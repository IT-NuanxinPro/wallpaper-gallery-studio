import { AI_TASK_STATUS, useAiTasksStore } from '@/stores/ai-tasks'
import { useCredentialsStore } from '@/stores/credentials'
import { useUploadSessionStore } from '@/stores/upload-session'
import { analyzeImage as classifierAnalyze } from '@/services/ai/classifier'
import {
  beginAiTaskRun,
  finishAiTaskRun,
  isAiTaskRunCurrent,
  waitForAiTaskRetry
} from '@/services/ai/task-runtime'

let runningPromise = null

function buildTargetPath(series, metadata) {
  const category = metadata.category || metadata.secondary
  const subcategory = metadata.subcategory || metadata.third || ''
  if (!series || !category) return ''
  return ['wallpaper', series, category, subcategory].filter(Boolean).join('/')
}

function buildAiMetadata(series, result) {
  return {
    series,
    category: result.secondary || '通用',
    subcategory: result.third || '',
    primary: series,
    secondary: result.secondary || '通用',
    third: result.third || '',
    keywords: result.keywords || [],
    description: result.description || '',
    filenameSuggestions: result.filenameSuggestions || [],
    displayTitle: result.displayTitle || null,
    confidence: result.confidence || 0,
    reasoning: result.reasoning || null
  }
}

function applyResultToUploadFile(uploadFile, task, metadata) {
  if (!uploadFile) return

  uploadFile.aiMetadata = metadata
  uploadFile.aiTaskId = task.id
  uploadFile.aiTaskStatus = AI_TASK_STATUS.COMPLETED
  uploadFile.aiTaskAttempts = task.attempts || 0

  if (task.manualTarget) {
    uploadFile.targetSeries = task.manualTarget.series
    uploadFile.targetL1 = task.manualTarget.l1
    uploadFile.targetL2 = task.manualTarget.l2 || ''
    uploadFile.targetPath = task.manualTarget.path
    uploadFile.targetSource = 'manual'
    return
  }

  if (uploadFile.targetSource !== 'manual') {
    uploadFile.targetSeries = task.series
    uploadFile.targetL1 = metadata.category || metadata.secondary || ''
    uploadFile.targetL2 = metadata.subcategory || metadata.third || ''
    uploadFile.targetPath = buildTargetPath(task.series, metadata)
    uploadFile.targetSource = 'ai'
  }
}

function markUploadFileTask(uploadFile, task, status) {
  if (!uploadFile) return
  uploadFile.aiTaskId = task.id
  uploadFile.aiTaskStatus = status
  uploadFile.aiTaskAttempts = task.attempts || 0
}

async function runQueue() {
  const taskStore = useAiTasksStore()
  const sessionStore = useUploadSessionStore()
  const credentialsStore = useCredentialsStore()

  await taskStore.initialize()
  await sessionStore.restoreAiTaskFiles()

  while (true) {
    const task =
      taskStore.tasks.find(item => item.status === AI_TASK_STATUS.QUEUED) ||
      [...taskStore.tasks]
        .filter(item => item.status === AI_TASK_STATUS.RETRYING)
        .sort((first, second) => (first.retryAt || 0) - (second.retryAt || 0))[0]
    if (!task) break

    const runToken = beginAiTaskRun(task.id)
    try {
      if (task.status === AI_TASK_STATUS.RETRYING) {
        const remainingDelay = Math.max(0, (task.retryAt || 0) - Date.now())
        const retryReady = await waitForAiTaskRetry(task.id, runToken, remainingDelay)
        if (!retryReady || !isAiTaskRunCurrent(task.id, runToken)) continue
      }

      let currentTask = taskStore.tasks.find(item => item.id === task.id)
      let uploadFile = sessionStore.files.find(file => file.id === task.fileId)
      if (!currentTask || !isAiTaskRunCurrent(task.id, runToken)) continue

      if (!uploadFile?.file) {
        await taskStore.updateTask(task.id, {
          status: AI_TASK_STATUS.FAILED,
          error: '任务图片数据已丢失，请重新添加图片',
          retryAt: null,
          finishedAt: Date.now()
        })
        continue
      }

      const hasProviderCredentials = credentialsStore.availableProviders.some(
        provider => provider.key === task.provider
      )
      const credentials = credentialsStore.getCredentialsByProvider(task.provider)
      if (!hasProviderCredentials) {
        // 没有凭据时保持原状态，等用户配置后再次恢复，不把任务判死。
        console.warn(`[AiTaskCenter] 缺少 ${task.provider} 凭据，暂停队列`)
        break
      }

      const maxAttempts = task.maxAttempts || 3
      let completed = false
      let lastError = null

      for (let attempt = task.attempts || 0; attempt < maxAttempts && !completed; attempt++) {
        if (!isAiTaskRunCurrent(task.id, runToken)) break

        const attemptNumber = attempt + 1
        currentTask = await taskStore.updateTask(task.id, {
          status: AI_TASK_STATUS.ANALYZING,
          attempts: attemptNumber,
          startedAt: task.startedAt || Date.now(),
          retryAt: null,
          error: null
        })
        if (!currentTask || !isAiTaskRunCurrent(task.id, runToken)) break

        uploadFile = sessionStore.files.find(file => file.id === task.fileId)
        if (!uploadFile?.file) break
        markUploadFileTask(uploadFile, currentTask, AI_TASK_STATUS.ANALYZING)

        try {
          const result = await classifierAnalyze({
            file: uploadFile.file,
            series: currentTask.series,
            providerType: currentTask.provider,
            credentials,
            modelKey: currentTask.modelKey
          })

          if (!isAiTaskRunCurrent(task.id, runToken)) break
          currentTask = taskStore.tasks.find(item => item.id === task.id)
          uploadFile = sessionStore.files.find(file => file.id === task.fileId)
          if (!currentTask || !uploadFile) break

          const metadata = buildAiMetadata(currentTask.series, result)
          const completedTask = await taskStore.updateTask(task.id, {
            status: AI_TASK_STATUS.COMPLETED,
            result: metadata,
            error: null,
            retryAt: null,
            finishedAt: Date.now()
          })
          if (!completedTask || !isAiTaskRunCurrent(task.id, runToken)) break

          uploadFile = sessionStore.files.find(file => file.id === task.fileId)
          if (!uploadFile) break
          applyResultToUploadFile(uploadFile, completedTask, metadata)
          completed = true
        } catch (error) {
          if (!isAiTaskRunCurrent(task.id, runToken)) break

          lastError = error
          const isLastAttempt = attemptNumber >= maxAttempts
          if (!isLastAttempt) {
            const retryDelay = Math.min(30000, 2000 * 2 ** attempt)
            const retryAt = Date.now() + retryDelay
            currentTask = await taskStore.updateTask(task.id, {
              status: AI_TASK_STATUS.RETRYING,
              attempts: attemptNumber,
              error: error.message || String(error),
              retryAt
            })
            if (!currentTask || !isAiTaskRunCurrent(task.id, runToken)) break

            uploadFile = sessionStore.files.find(file => file.id === task.fileId)
            markUploadFileTask(uploadFile, currentTask, AI_TASK_STATUS.RETRYING)
            const retryReady = await waitForAiTaskRetry(task.id, runToken, retryDelay)
            if (!retryReady) break
          }
        }
      }

      if (!completed && lastError && isAiTaskRunCurrent(task.id, runToken)) {
        const message = lastError.message || 'AI 分析失败'
        const failedTask = await taskStore.updateTask(task.id, {
          status: AI_TASK_STATUS.FAILED,
          error: message,
          retryAt: null,
          finishedAt: Date.now()
        })
        if (!failedTask || !isAiTaskRunCurrent(task.id, runToken)) continue

        uploadFile = sessionStore.files.find(file => file.id === task.fileId)
        if (uploadFile) {
          uploadFile.aiTaskStatus = AI_TASK_STATUS.FAILED
          uploadFile.aiTaskAttempts = failedTask.attempts || maxAttempts
          uploadFile.aiMetadata = null
        }
      }
    } finally {
      finishAiTaskRun(task.id, runToken)
    }
  }
}

export function resumeAiTaskQueue() {
  if (!runningPromise) {
    runningPromise = runQueue().finally(() => {
      runningPromise = null
    })
  }
  return runningPromise
}

export async function retryAiTask(taskId) {
  const taskStore = useAiTasksStore()
  const sessionStore = useUploadSessionStore()
  await taskStore.initialize()

  const task = await taskStore.retryTask(taskId)
  if (!task) return null

  const uploadFile = sessionStore.files.find(file => file.id === task.fileId)
  if (uploadFile) {
    uploadFile.aiMetadata = null
    uploadFile.aiTaskStatus = AI_TASK_STATUS.QUEUED
    uploadFile.aiTaskAttempts = 0
    if (!task.manualTarget) {
      uploadFile.targetPath = ''
      uploadFile.targetL1 = ''
      uploadFile.targetL2 = ''
      uploadFile.targetSource = null
    }
  }

  await resumeAiTaskQueue()
  return task
}
