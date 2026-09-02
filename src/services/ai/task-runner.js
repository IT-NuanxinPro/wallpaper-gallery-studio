import { AI_TASK_STATUS, useAiTasksStore } from '@/stores/ai-tasks'
import { useCredentialsStore } from '@/stores/credentials'
import { useUploadSessionStore } from '@/stores/upload-session'
import { analyzeImage as classifierAnalyze } from '@/services/ai/classifier'

let runningPromise = null

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

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
  uploadFile.targetSeries = task.series
  uploadFile.targetL1 = metadata.category || metadata.secondary || ''
  uploadFile.targetL2 = metadata.subcategory || metadata.third || ''
  uploadFile.targetPath = buildTargetPath(task.series, metadata)
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
    const task = taskStore.tasks.find(item => item.status === AI_TASK_STATUS.QUEUED)
    if (!task) break

    const uploadFile = sessionStore.files.find(file => file.id === task.fileId)
    if (!uploadFile?.file) {
      await taskStore.updateTask(task.id, {
        status: AI_TASK_STATUS.FAILED,
        error: '任务图片数据已丢失，请重新添加图片',
        finishedAt: Date.now()
      })
      continue
    }

    const credentials = credentialsStore.getCredentialsByProvider(task.provider)
    if (!credentials) {
      // 没有凭据时保持 queued，等用户配置后再次恢复，不把任务判死。
      console.warn(`[AiTaskCenter] 缺少 ${task.provider} 凭据，暂停队列`)
      break
    }

    const maxAttempts = task.maxAttempts || 3
    let completed = false
    let lastError = null

    for (let attempt = task.attempts || 0; attempt < maxAttempts && !completed; attempt++) {
      const attemptNumber = attempt + 1
      await taskStore.updateTask(task.id, {
        status: AI_TASK_STATUS.ANALYZING,
        attempts: attemptNumber,
        startedAt: task.startedAt || Date.now(),
        retryAt: null,
        error: null
      })
      task.attempts = attemptNumber
      markUploadFileTask(uploadFile, task, AI_TASK_STATUS.ANALYZING)

      try {
        const result = await classifierAnalyze({
          file: uploadFile.file,
          series: task.series,
          providerType: task.provider,
          credentials,
          modelKey: task.modelKey
        })

        const metadata = buildAiMetadata(task.series, result)
        applyResultToUploadFile(uploadFile, task, metadata)
        await taskStore.updateTask(task.id, {
          status: AI_TASK_STATUS.COMPLETED,
          result: metadata,
          error: null,
          retryAt: null,
          finishedAt: Date.now()
        })
        completed = true
      } catch (error) {
        lastError = error
        const isLastAttempt = attemptNumber >= maxAttempts

        if (!isLastAttempt) {
          const retryDelay = Math.min(30000, 2000 * 2 ** attempt)
          const retryAt = Date.now() + retryDelay
          await taskStore.updateTask(task.id, {
            status: AI_TASK_STATUS.RETRYING,
            attempts: attemptNumber,
            error: error.message,
            retryAt
          })
          markUploadFileTask(uploadFile, task, AI_TASK_STATUS.RETRYING)
          await sleep(retryDelay)
        }
      }
    }

    if (!completed) {
      const message = lastError?.message || 'AI 分析失败'
      uploadFile.aiTaskStatus = AI_TASK_STATUS.FAILED
      uploadFile.aiTaskAttempts = task.attempts || maxAttempts
      uploadFile.aiMetadata = null
      await taskStore.updateTask(task.id, {
        status: AI_TASK_STATUS.FAILED,
        error: message,
        retryAt: null,
        finishedAt: Date.now()
      })
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
    uploadFile.targetPath = ''
    uploadFile.targetL1 = ''
    uploadFile.targetL2 = ''
  }

  await resumeAiTaskQueue()
  return task
}
