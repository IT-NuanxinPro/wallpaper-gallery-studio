import { computed, ref } from 'vue'
import { analyzeImage as defaultAnalyzeImage } from '@/services/ai/classifier'
import { normalizeModelId } from '@/services/ai/model'
import { videoProcessingIdentity } from './workspace'

export function createVideoAutoAnalysis({
  workspace,
  getCredentials,
  canRun,
  storage = globalThis.sessionStorage,
  contextKey = '',
  analyzeImage = defaultAnalyzeImage,
  frameToBase64
}) {
  const activeJobId = ref('')
  const errors = ref({})
  const pauseReason = ref('')
  const paused = computed(() => !!pauseReason.value)
  const storageKey = `video-auto-analysis:${contextKey}`
  let attempts = {}
  let running = null
  let controller = null
  let disposed = false
  let generation = 0
  let rerunRequested = false

  try {
    const saved = JSON.parse(storage?.getItem(storageKey) || '{}')
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      attempts = saved.attempts && typeof saved.attempts === 'object' ? saved.attempts : saved
      if (saved.pauseReason) pauseReason.value = 'AI 服务暂不可用，自动队列已暂停，请重试或更新配置'
    }
  } catch {
    /* 当前页面仍可防重复。 */
  }

  function persist() {
    try {
      storage?.setItem(storageKey, JSON.stringify({ attempts, pauseReason: pauseReason.value }))
    } catch {
      /* 只保留内存。 */
    }
  }

  function attemptKey(job, model) {
    return JSON.stringify([job.id, videoProcessingIdentity(job), model])
  }

  function failureMessage(error) {
    if (error.status === 503)
      return '当前模型服务不可用（HTTP 503），请检查上游分组和账号状态后重试'
    if (error.status === 502) return '上游模型调用失败（HTTP 502），请检查网关账号后重试'
    return error.status === 409 || /LEASE/.test(error.code || '')
      ? '另一处正在分析或审核已更新，请刷新后手动重试'
      : error.name === 'AbortError'
        ? '自动分析已取消，请手动重试或重新配置后继续'
        : '自动分析失败，请检查 AI 配置后手动重试'
  }

  function recordFailure(id, key, error) {
    const message = failureMessage(error)
    attempts[key] = message
    errors.value = { ...errors.value, [id]: message }
    if ([401, 403, 429].includes(error.status) || error.status >= 500) {
      pauseReason.value = 'AI 服务暂不可用，自动队列已暂停，请重试或更新配置'
    }
  }

  function restoreErrors() {
    const currentErrors = {}
    const model = normalizeModelId(getCredentials()?.model)
    for (const job of workspace.jobs.value) {
      const key = attemptKey(job, model)
      if (job.status === 'awaiting_ai' && attempts[key] && attempts[key] !== 'completed') {
        currentErrors[job.id] =
          attempts[key] === 'attempted' ? '此任务已尝试自动分析，请手动重试' : attempts[key]
      }
    }
    errors.value = currentErrors
  }

  async function processQueue() {
    for (const job of [...workspace.jobs.value]) {
      if (disposed || paused.value || !canRun() || workspace.reviewBusy.value) break
      const credentials = getCredentials()
      const model = normalizeModelId(credentials?.model)
      if (!credentials?.apiKey?.trim() || !model || credentials.signal?.aborted) break
      if (!workspace.canAutoAnalyze(job.id)) continue
      const key = attemptKey(job, model)
      if (attempts[key]) {
        if (attempts[key] !== 'completed')
          errors.value = {
            ...errors.value,
            [job.id]:
              attempts[key] === 'attempted' ? '此任务已尝试自动分析，请手动重试' : attempts[key]
          }
        continue
      }

      const attemptGeneration = generation
      attempts[key] = 'attempted'
      persist()
      activeJobId.value = job.id
      controller = new globalThis.AbortController()
      const signal = controller.signal
      const abort = () => controller?.abort()
      credentials.signal?.addEventListener('abort', abort, { once: true })
      try {
        const updated = await workspace.analyzeJob(
          job.id,
          {
            credentials: { ...credentials, model, signal },
            analyzeImage,
            ...(frameToBase64 ? { frameToBase64 } : {}),
            beforeSave: () => !disposed && canRun() && !signal.aborted
          },
          { automatic: true }
        )
        if (generation === attemptGeneration)
          attempts[key] = updated ? 'completed' : '此任务已有审核修改，请手动分析'
      } catch (error) {
        if (generation === attemptGeneration) {
          recordFailure(job.id, key, error)
        }
      } finally {
        credentials.signal?.removeEventListener('abort', abort)
        controller = null
        activeJobId.value = ''
        persist()
      }
    }
  }

  function run() {
    if (disposed) return Promise.resolve()
    restoreErrors()
    rerunRequested = true
    if (!running)
      running = (async () => {
        do {
          rerunRequested = false
          await processQueue()
        } while (rerunRequested && !disposed)
      })().finally(() => {
        running = null
      })
    return running
  }

  function clear(id) {
    pauseReason.value = ''
    for (const key of Object.keys(attempts)) {
      try {
        if (JSON.parse(key)[0] === id) delete attempts[key]
      } catch {
        delete attempts[key]
      }
    }
    const next = { ...errors.value }
    delete next[id]
    errors.value = next
    persist()
  }

  async function retry(id) {
    if (activeJobId.value) return
    clear(id)
    return run()
  }

  function reset() {
    generation++
    controller?.abort()
    attempts = {}
    errors.value = {}
    pauseReason.value = ''
    persist()
  }

  function cancel() {
    controller?.abort()
  }

  function block(id, error) {
    const job = workspace.jobs.value.find(item => item.id === id)
    const model = normalizeModelId(getCredentials()?.model)
    if (!job || !model) return
    const key = attemptKey(job, model)
    if (error) recordFailure(id, key, error)
    else {
      clear(id)
      attempts[key] = 'attempted'
    }
    persist()
  }

  function dispose() {
    disposed = true
    controller?.abort()
  }

  return {
    activeJobId,
    errors,
    paused,
    pauseReason,
    run,
    retry,
    clear,
    block,
    reset,
    cancel,
    dispose
  }
}
