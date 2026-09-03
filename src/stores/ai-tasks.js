import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  clearAiTaskRecords,
  deleteAiTaskRecords,
  formatTaskStorageError,
  listAiTaskRecords,
  patchAiTaskRecord,
  putAiTaskRecord,
  putAiTaskRecords
} from '@/services/ai/task-storage'
import { cancelAiTaskRun, cancelAiTaskRuns } from '@/services/ai/task-runtime'

export const AI_TASK_STATUS = Object.freeze({
  QUEUED: 'queued',
  ANALYZING: 'analyzing',
  RETRYING: 'retrying',
  COMPLETED: 'completed',
  FAILED: 'failed'
})

function generateTaskId() {
  return `ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function generateBatchId() {
  return `batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export const useAiTasksStore = defineStore('ai-tasks', () => {
  const tasks = ref([])
  const initialized = ref(false)
  const persistenceWarning = ref('')
  const currentBatchId = ref(null)
  const persistedTaskIds = new Set()
  let initializationPromise = null

  const queuedTasks = computed(() =>
    tasks.value.filter(task => task.status === AI_TASK_STATUS.QUEUED)
  )
  const activeTasks = computed(() =>
    tasks.value.filter(task =>
      [AI_TASK_STATUS.ANALYZING, AI_TASK_STATUS.RETRYING].includes(task.status)
    )
  )
  const completedTasks = computed(() =>
    tasks.value.filter(task => task.status === AI_TASK_STATUS.COMPLETED)
  )
  const failedTasks = computed(() =>
    tasks.value.filter(task => task.status === AI_TASK_STATUS.FAILED)
  )
  const pendingCount = computed(() => queuedTasks.value.length + activeTasks.value.length)

  function sortTasks() {
    tasks.value.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
  }

  function initialize() {
    if (initialized.value) return tasks.value
    if (initializationPromise) return initializationPromise

    initializationPromise = (async () => {
      try {
        const records = await listAiTaskRecords()
        const now = Date.now()
        const recordsToUpdate = []
        tasks.value = records.map(record => {
          const normalizedRecord = {
            ...record,
            batchId: record.batchId || `legacy_${record.createdAt || 'restored'}`
          }

          if (record.status === AI_TASK_STATUS.ANALYZING) {
            const interruptedRecord = {
              ...normalizedRecord,
              status: AI_TASK_STATUS.QUEUED,
              retryAt: null,
              error: '页面刷新后已重新加入队列',
              updatedAt: now
            }
            recordsToUpdate.push(interruptedRecord)
            return interruptedRecord
          }

          if (record.status === AI_TASK_STATUS.RETRYING && !Number.isFinite(record.retryAt)) {
            const recoverableRecord = {
              ...normalizedRecord,
              status: AI_TASK_STATUS.QUEUED,
              retryAt: null,
              updatedAt: now
            }
            recordsToUpdate.push(recoverableRecord)
            return recoverableRecord
          }

          if (normalizedRecord.batchId !== record.batchId) {
            recordsToUpdate.push(normalizedRecord)
          }
          return normalizedRecord
        })

        persistedTaskIds.clear()
        records.forEach(record => persistedTaskIds.add(record.id))
        await Promise.all(recordsToUpdate.map(task => putAiTaskRecord(task)))
        sortTasks()
        currentBatchId.value = tasks.value.at(-1)?.batchId || null
        persistenceWarning.value = ''
        initialized.value = true
      } catch (error) {
        initialized.value = false
        persistenceWarning.value = formatTaskStorageError(error)
        console.warn('[AiTaskCenter] 恢复任务失败:', error)
      }

      return tasks.value
    })().finally(() => {
      initializationPromise = null
    })

    return initializationPromise
  }

  function startBatch() {
    currentBatchId.value = generateBatchId()
    return currentBatchId.value
  }

  async function createTasks(taskInputs, batchId = null) {
    if (!taskInputs.length) return []

    const resolvedBatchId = batchId || currentBatchId.value || startBatch()
    const createdTasks = taskInputs.map((input, index) => {
      const now = Date.now() + index
      return {
        id: generateTaskId(),
        fileId: input.fileId,
        fileName: input.file.name,
        fileType: input.file.type,
        fileLastModified: input.file.lastModified || now,
        blob: input.file,
        series: input.series,
        provider: input.provider,
        modelKey: input.modelKey,
        batchId: input.batchId || resolvedBatchId,
        status: AI_TASK_STATUS.QUEUED,
        attempts: 0,
        maxAttempts: 3,
        error: null,
        result: null,
        manualTarget: null,
        retryAt: null,
        createdAt: now,
        updatedAt: now,
        startedAt: null,
        finishedAt: null
      }
    })

    tasks.value.push(...createdTasks)
    sortTasks()

    try {
      await putAiTaskRecords(createdTasks)
      createdTasks.forEach(task => persistedTaskIds.add(task.id))
      persistenceWarning.value = ''
    } catch (error) {
      persistenceWarning.value = formatTaskStorageError(error)
      console.warn('[AiTaskCenter] 批量任务持久化失败:', error)
    }

    return createdTasks
  }

  async function createTask(input) {
    const createdTasks = await createTasks([input], input.batchId)
    return createdTasks[0]
  }

  async function updateTask(id, patch) {
    const index = tasks.value.findIndex(task => task.id === id)
    if (index < 0) return null

    const next = {
      ...tasks.value[index],
      ...patch,
      id,
      updatedAt: Date.now()
    }
    tasks.value[index] = next

    if (persistedTaskIds.has(id)) {
      try {
        const persisted = await patchAiTaskRecord(id, next)
        if (!persisted) {
          persistedTaskIds.delete(id)
          tasks.value = tasks.value.filter(task => task.id !== id)
          return null
        }
        persistenceWarning.value = ''
      } catch (error) {
        persistenceWarning.value = formatTaskStorageError(error)
        console.warn('[AiTaskCenter] 更新任务持久化失败:', error)
      }
    }

    return tasks.value.find(task => task.id === id) || null
  }

  async function retryTask(id) {
    const task = tasks.value.find(item => item.id === id)
    if (!task) return null

    return updateTask(id, {
      status: AI_TASK_STATUS.QUEUED,
      attempts: 0,
      error: null,
      retryAt: null,
      finishedAt: null
    })
  }

  async function restoreCancelledTasks(ids) {
    await Promise.all(
      ids.map(id => {
        const task = tasks.value.find(item => item.id === id)
        if (!task || ![AI_TASK_STATUS.ANALYZING, AI_TASK_STATUS.RETRYING].includes(task.status)) {
          return null
        }

        return updateTask(id, {
          status: AI_TASK_STATUS.QUEUED,
          retryAt: null,
          error: '删除未完成，任务已重新加入队列'
        })
      })
    )
  }

  async function removeTask(id) {
    cancelAiTaskRun(id)

    if (persistedTaskIds.has(id)) {
      try {
        await deleteAiTaskRecords([id])
        persistedTaskIds.delete(id)
        persistenceWarning.value = ''
      } catch (error) {
        persistenceWarning.value = formatTaskStorageError(error)
        console.warn('[AiTaskCenter] 删除任务持久化失败:', error)
        await restoreCancelledTasks([id])
        throw error
      }
    }

    tasks.value = tasks.value.filter(task => task.id !== id)
  }

  async function removeTasksByFileIds(fileIds) {
    const ids = tasks.value.filter(task => fileIds.includes(task.fileId)).map(task => task.id)
    if (!ids.length) return 0

    cancelAiTaskRuns(ids)
    const persistedIds = ids.filter(id => persistedTaskIds.has(id))
    if (persistedIds.length) {
      try {
        await deleteAiTaskRecords(persistedIds)
        persistedIds.forEach(id => persistedTaskIds.delete(id))
        persistenceWarning.value = ''
      } catch (error) {
        persistenceWarning.value = formatTaskStorageError(error)
        console.warn('[AiTaskCenter] 批量删除任务持久化失败:', error)
        await restoreCancelledTasks(ids)
        throw error
      }
    }

    const idSet = new Set(ids)
    tasks.value = tasks.value.filter(task => !idSet.has(task.id))
    return ids.length
  }

  async function clearFinished() {
    const finishedIds = tasks.value
      .filter(task => task.status === AI_TASK_STATUS.COMPLETED)
      .map(task => task.id)
    if (!finishedIds.length) return 0

    cancelAiTaskRuns(finishedIds)
    const fileIds = tasks.value
      .filter(task => finishedIds.includes(task.id))
      .map(task => task.fileId)
    return removeTasksByFileIds(fileIds)
  }

  async function clearAll() {
    const ids = tasks.value.map(task => task.id)
    cancelAiTaskRuns(ids)

    if (persistedTaskIds.size > 0) {
      try {
        await clearAiTaskRecords()
        persistedTaskIds.clear()
        persistenceWarning.value = ''
      } catch (error) {
        persistenceWarning.value = formatTaskStorageError(error)
        console.warn('[AiTaskCenter] 清空任务持久化失败:', error)
        await restoreCancelledTasks(ids)
        throw error
      }
    }

    tasks.value = []
    currentBatchId.value = null
  }

  function getTaskByFileId(fileId) {
    return tasks.value.find(task => task.fileId === fileId) || null
  }

  async function updateTaskByFileId(fileId, patch) {
    const task = getTaskByFileId(fileId)
    if (!task) return null
    return updateTask(task.id, patch)
  }

  async function saveManualTarget(fileId, target) {
    return updateTaskByFileId(fileId, {
      manualTarget: target
        ? {
            series: target.series,
            l1: target.l1,
            l2: target.l2 || '',
            path: target.path,
            updatedAt: Date.now()
          }
        : null
    })
  }

  return {
    tasks,
    initialized,
    persistenceWarning,
    currentBatchId,
    queuedTasks,
    activeTasks,
    completedTasks,
    failedTasks,
    pendingCount,
    initialize,
    startBatch,
    createTasks,
    createTask,
    updateTask,
    retryTask,
    removeTask,
    removeTasksByFileIds,
    clearFinished,
    clearAll,
    getTaskByFileId,
    updateTaskByFileId,
    saveManualTarget
  }
})
