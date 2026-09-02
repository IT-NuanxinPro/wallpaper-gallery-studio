import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  clearAiTaskRecords,
  deleteAiTaskRecord,
  formatTaskStorageError,
  listAiTaskRecords,
  patchAiTaskRecord,
  putAiTaskRecord
} from '@/services/ai/task-storage'

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

export const useAiTasksStore = defineStore('ai-tasks', () => {
  const tasks = ref([])
  const initialized = ref(false)
  const persistenceWarning = ref('')

  const queuedTasks = computed(() => tasks.value.filter(task => task.status === AI_TASK_STATUS.QUEUED))
  const activeTasks = computed(() =>
    tasks.value.filter(task =>
      [AI_TASK_STATUS.ANALYZING, AI_TASK_STATUS.RETRYING].includes(task.status)
    )
  )
  const completedTasks = computed(() =>
    tasks.value.filter(task => task.status === AI_TASK_STATUS.COMPLETED)
  )
  const failedTasks = computed(() => tasks.value.filter(task => task.status === AI_TASK_STATUS.FAILED))
  const pendingCount = computed(() => queuedTasks.value.length + activeTasks.value.length)

  function sortTasks() {
    tasks.value.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
  }

  async function initialize() {
    if (initialized.value) return tasks.value

    try {
      const records = await listAiTaskRecords()
      const now = Date.now()
      tasks.value = records.map(record => {
        if ([AI_TASK_STATUS.ANALYZING, AI_TASK_STATUS.RETRYING].includes(record.status)) {
          return {
            ...record,
            status: AI_TASK_STATUS.QUEUED,
            retryAt: null,
            error: null,
            updatedAt: now
          }
        }
        return record
      })

      await Promise.all(
        tasks.value
          .filter(task => task.updatedAt === now)
          .map(task => putAiTaskRecord(task).catch(() => null))
      )
      sortTasks()
    } catch (error) {
      persistenceWarning.value = formatTaskStorageError(error)
      console.warn('[AiTaskCenter] 恢复任务失败:', error)
    } finally {
      initialized.value = true
    }

    return tasks.value
  }

  async function createTask({ fileId, file, series, provider, modelKey }) {
    const now = Date.now()
    const task = {
      id: generateTaskId(),
      fileId,
      fileName: file.name,
      fileType: file.type,
      fileLastModified: file.lastModified || now,
      blob: file,
      series,
      provider,
      modelKey,
      status: AI_TASK_STATUS.QUEUED,
      attempts: 0,
      maxAttempts: 3,
      error: null,
      result: null,
      retryAt: null,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      finishedAt: null
    }

    tasks.value.push(task)
    sortTasks()

    try {
      await putAiTaskRecord(task)
    } catch (error) {
      persistenceWarning.value = formatTaskStorageError(error)
      console.warn('[AiTaskCenter] 任务持久化失败:', error)
    }

    return task
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

    try {
      await patchAiTaskRecord(id, next)
    } catch (error) {
      persistenceWarning.value = formatTaskStorageError(error)
      console.warn('[AiTaskCenter] 更新任务持久化失败:', error)
    }

    return next
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

  async function removeTask(id) {
    tasks.value = tasks.value.filter(task => task.id !== id)
    try {
      await deleteAiTaskRecord(id)
    } catch (error) {
      console.warn('[AiTaskCenter] 删除任务持久化失败:', error)
    }
  }

  async function removeTasksByFileIds(fileIds) {
    const ids = tasks.value.filter(task => fileIds.includes(task.fileId)).map(task => task.id)
    await Promise.all(ids.map(removeTask))
  }

  async function clearFinished() {
    const finishedIds = tasks.value
      .filter(task => [AI_TASK_STATUS.COMPLETED, AI_TASK_STATUS.FAILED].includes(task.status))
      .map(task => task.id)
    await Promise.all(finishedIds.map(removeTask))
  }

  async function clearAll() {
    tasks.value = []
    try {
      await clearAiTaskRecords()
    } catch (error) {
      console.warn('[AiTaskCenter] 清空任务持久化失败:', error)
    }
  }

  function getTaskByFileId(fileId) {
    return tasks.value.find(task => task.fileId === fileId) || null
  }

  return {
    tasks,
    initialized,
    persistenceWarning,
    queuedTasks,
    activeTasks,
    completedTasks,
    failedTasks,
    pendingCount,
    initialize,
    createTask,
    updateTask,
    retryTask,
    removeTask,
    removeTasksByFileIds,
    clearFinished,
    clearAll,
    getTaskByFileId
  }
})
