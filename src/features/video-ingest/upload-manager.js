import { computed, reactive, ref } from 'vue'
import { errorMessage, validateVideoFile } from './domain'

const ACTIVE_STAGES = ['waiting', 'hashing', 'uploading', 'completing']

export function createVideoUploadManager({ uploader, onJob, onSettled } = {}) {
  const transfers = ref([])
  const sources = new Map()
  const controllers = new Map()
  let disposed = false
  const activeCount = computed(
    () => transfers.value.filter(transfer => ACTIVE_STAGES.includes(transfer.stage)).length
  )
  const hasActiveTransfers = computed(() => activeCount.value > 0)
  const hasActive = jobId =>
    transfers.value.some(
      transfer => transfer.jobId === jobId && ACTIVE_STAGES.includes(transfer.stage)
    )
  const canRetry = id => !disposed && sources.has(id) && !controllers.has(id)

  async function upload(id) {
    if (disposed) throw new Error('视频上传工作台已关闭')
    let source = sources.get(id)
    const transfer = transfers.value.find(item => item.id === id)
    if (!source || !transfer || controllers.has(id))
      throw new Error('源文件不可用，请重选原视频继续')
    const controller = new globalThis.AbortController()
    controllers.set(id, controller)
    transfer.stage = 'waiting'
    transfer.error = ''
    let file = source.file
    let event
    let failure
    try {
      const job = await uploader.upload(file, {
        job: source.job,
        signal: controller.signal,
        onProgress: progress => {
          if (!disposed) Object.assign(transfer, progress)
        },
        onJob: job => {
          if (disposed) return
          source.job = job
          transfer.jobId = job.id
          onJob?.(job)
        }
      })

      const completedIds = new Set(
        transfers.value
          .filter(item => item.id === id || (item.jobId === job.id && !controllers.has(item.id)))
          .map(item => item.id)
      )
      completedIds.forEach(completedId => sources.delete(completedId))
      transfers.value = transfers.value.filter(item => !completedIds.has(item.id))
      event = { id, jobId: job.id, status: 'done', job }
    } catch (error) {
      failure = error
      transfer.stage = error.name === 'AbortError' ? 'paused' : 'error'
      transfer.error = errorMessage(error)
      event = { id, jobId: transfer.jobId, status: transfer.stage, error }
    } finally {
      controllers.delete(id)
      file = null
      source = null
    }
    if (!disposed) {
      await Promise.resolve()
        .then(() => onSettled?.(event))
        .catch(() => undefined)
    }
    if (failure) throw failure
    return event.job
  }

  function addFiles(files, { job, resumeJob } = {}) {
    if (disposed) return Promise.reject(new Error('视频上传工作台已关闭'))
    return Promise.allSettled(
      Array.from(files).map(file => {
        try {
          validateVideoFile(file)
        } catch (error) {
          return Promise.reject(error)
        }
        const id = globalThis.crypto.randomUUID()
        const transfer = reactive({
          id,
          filename: file.name,
          jobId: (job || resumeJob)?.id || '',
          stage: 'waiting',
          percent: 0,
          error: ''
        })
        sources.set(id, { file, job: job || resumeJob })
        transfers.value.push(transfer)
        return upload(id)
      })
    )
  }

  function pause(id) {
    controllers.get(id)?.abort()
  }
  function retry(id) {
    return upload(id)
  }
  function dispose() {
    disposed = true
    controllers.forEach(controller => controller.abort())
    controllers.clear()
    sources.clear()
    transfers.value = []
  }

  return {
    transfers,
    addFiles,
    pause,
    retry,
    hasActive,
    hasActiveTransfers,
    activeCount,
    canRetry,
    dispose
  }
}
