import { AI_TASK_STATUS, useAiTasksStore } from '@/stores/ai-tasks'
import { useCredentialsStore } from '@/stores/credentials'
import { useUploadSessionStore } from '@/stores/upload-session'
import { analyzeImage as classifierAnalyze } from '@/services/ai/classifier'
import { AI_MODEL_KEY, AI_PROVIDER } from './model'

let runningPromise = null

function sleep(ms, signal) {
  return new Promise(resolve => {
    if (signal?.aborted) return resolve()
    const finish = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, ms)
    signal?.addEventListener('abort', finish, { once: true })
  })
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

  await credentialsStore.loadCredentials()
  await taskStore.initialize()
  await sessionStore.restoreAiTaskFiles()

  while (true) {
    let task = taskStore.tasks.find(item => item.status === AI_TASK_STATUS.QUEUED)
    if (!task) return

    // 每次执行（包括重试）读取当前会话，不在持久化任务中携带凭据。
    const credentials = credentialsStore.getCredentialsByProvider(AI_PROVIDER)
    if (!credentials?.apiKey?.trim() || credentials.signal?.aborted) return

    const uploadFile = sessionStore.files.find(file => file.id === task.fileId)
    if (!uploadFile?.file) {
      await taskStore.updateTask(task.id, {
        status: AI_TASK_STATUS.FAILED,
        error: '任务图片数据已丢失，请重新添加图片',
        finishedAt: Date.now()
      })
      continue
    }

    const previousAttempts = task.attempts || 0
    const attemptNumber = previousAttempts + 1
    task = await taskStore.updateTask(task.id, {
      provider: AI_PROVIDER,
      modelKey: AI_MODEL_KEY,
      status: AI_TASK_STATUS.ANALYZING,
      attempts: attemptNumber,
      startedAt: task.startedAt || Date.now(),
      retryAt: null,
      error: null
    })
    markUploadFileTask(uploadFile, task, AI_TASK_STATUS.ANALYZING)

    try {
      const result = await classifierAnalyze({
        file: uploadFile.file,
        series: task.series,
        providerType: AI_PROVIDER,
        credentials,
        modelKey: AI_MODEL_KEY
      })
      if (credentials.signal?.aborted) {
        throw Object.assign(new Error('AI 会话已变更'), { name: 'AbortError' })
      }

      const metadata = buildAiMetadata(task.series, result)
      applyResultToUploadFile(uploadFile, task, metadata)
      await taskStore.updateTask(task.id, {
        status: AI_TASK_STATUS.COMPLETED,
        result: metadata,
        error: null,
        retryAt: null,
        finishedAt: Date.now()
      })
    } catch (error) {
      if (credentials.signal?.aborted || error.name === 'AbortError') {
        task = await taskStore.updateTask(task.id, {
          status: AI_TASK_STATUS.QUEUED,
          attempts: previousAttempts,
          retryAt: null,
          error: null
        })
        markUploadFileTask(uploadFile, task, AI_TASK_STATUS.QUEUED)
        // 清除凭据会在下一轮退出；换 Key 则自动改用新会话。
        continue
      }

      // 错误正文可能含服务端回显，任务历史只存本地固定提示。
      const message = 'AI 分析失败，请检查当前标签页的 API 配置后重试'
      if (attemptNumber < (task.maxAttempts || 3)) {
        const retryDelay = Math.min(30000, 2000 * 2 ** previousAttempts)
        task = await taskStore.updateTask(task.id, {
          status: AI_TASK_STATUS.RETRYING,
          error: message,
          retryAt: Date.now() + retryDelay
        })
        markUploadFileTask(uploadFile, task, AI_TASK_STATUS.RETRYING)
        await sleep(retryDelay, credentials.signal)
        task = await taskStore.updateTask(task.id, {
          status: AI_TASK_STATUS.QUEUED,
          retryAt: null
        })
        markUploadFileTask(uploadFile, task, AI_TASK_STATUS.QUEUED)
      } else {
        uploadFile.aiTaskStatus = AI_TASK_STATUS.FAILED
        uploadFile.aiTaskAttempts = attemptNumber
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
