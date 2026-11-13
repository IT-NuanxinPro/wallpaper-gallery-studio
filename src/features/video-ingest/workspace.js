import { computed, reactive, ref } from 'vue'
import { canPublish, canReview, createReviewDraft, errorMessage, validateReview } from './domain'
import { analyzeVideoFrame } from './review-service'

export function createVideoWorkspace({ api, owner, storage = globalThis.localStorage }) {
  const jobs = ref([])
  const publications = ref([])
  const topics = ref([])
  const topicsError = ref('')
  const selectedJobId = ref('')
  const selectedIds = ref([])
  const loading = ref(false)
  const error = ref('')
  const publicationErrors = ref({})
  const reviewBusy = ref(false)
  const publishing = ref(false)
  const sessions = reactive({})
  const publishedIds = new Set()
  const storageKey = `video-publications:${owner || 'unknown'}`
  let refreshPromise
  let topicsPromise
  let pollingTimer
  let disposed = false

  let trackedIds = []
  try {
    const restored = JSON.parse(storage?.getItem(storageKey) || '[]')
    if (Array.isArray(restored))
      trackedIds = restored.filter(id => typeof id === 'string').slice(-100)
  } catch {
    trackedIds = []
  }

  const selectedJob = computed(() => jobs.value.find(job => job.id === selectedJobId.value) || null)
  const activeSession = computed(() => sessions[selectedJobId.value])
  const reviewDraft = computed({
    get: () =>
      activeSession.value?.draft ||
      (selectedJob.value ? createReviewDraft(selectedJob.value) : null),
    set: value => {
      if (activeSession.value && canReview(selectedJob.value)) activeSession.value.draft = value
    }
  })
  const draftRevision = computed(() => activeSession.value?.revision)
  const conflict = computed(() => activeSession.value?.conflict || null)
  const isDirty = computed(() =>
    activeSession.value
      ? JSON.stringify(activeSession.value.draft) !== activeSession.value.baseline
      : false
  )
  const hasUnsavedDrafts = computed(() =>
    Object.values(sessions).some(session => JSON.stringify(session.draft) !== session.baseline)
  )
  const publishableJobs = computed(() => jobs.value.filter(canPublish))
  const pendingJobs = computed(() => jobs.value.filter(job => job.status !== 'published'))
  const publishedJobs = computed(() => jobs.value.filter(job => job.status === 'published'))

  function resetSession(job) {
    if (!canReview(job)) {
      delete sessions[job.id]
      return
    }
    const draft = createReviewDraft(job)
    sessions[job.id] = {
      draft,
      revision: job.revision,
      baseline: JSON.stringify(draft),
      conflict: null
    }
  }

  async function loadTopics() {
    if (topicsPromise) return topicsPromise
    topicsPromise = (async () => {
      try {
        const data = await api.getTopics()
        if (!Array.isArray(data?.topics)) throw new Error('视频分类响应无效')
        topics.value = [
          ...new Set(
            data.topics
              .filter(topic => typeof topic === 'string')
              .map(topic => topic.trim())
              .filter(Boolean)
          )
        ]
        topicsError.value = ''
      } catch (failure) {
        topicsError.value = errorMessage(failure)
      } finally {
        topicsPromise = null
      }
      return topics.value
    })()
    return topicsPromise
  }

  function selectJob(id) {
    selectedJobId.value = jobs.value.some(job => job.id === id) ? id : ''
    const job = selectedJob.value
    if (job && !sessions[id]) resetSession(job)
  }

  function selectNextPending() {
    selectJob(pendingJobs.value[0]?.id || '')
  }

  function upsertJob(job, { acceptReview = false } = {}) {
    const existing = jobs.value.find(item => item.id === job.id)
    if (existing && existing.revision > job.revision) return
    if (job.status === 'published') publishedIds.add(job.id)
    if (publishedIds.has(job.id) && job.status !== 'published')
      job = { ...job, status: 'published' }
    jobs.value = existing
      ? jobs.value.map(item => (item.id === job.id ? job : item))
      : [job, ...jobs.value]
    if (job.status === 'published') {
      delete sessions[job.id]
      selectedIds.value = selectedIds.value.filter(id => id !== job.id)

      if (selectedJobId.value === job.id && existing?.status !== 'published') selectNextPending()
      return
    }
    const session = sessions[job.id]
    if (acceptReview || (!session && canReview(job))) resetSession(job)
    else if (session && session.revision !== job.revision) {
      if (JSON.stringify(session.draft) === session.baseline) resetSession(job)
      else
        session.conflict = {
          remoteRevision: job.revision,
          message: '任务已被更新，本地草稿已保留。'
        }
    }
  }

  function rememberPublication(id) {
    if (!trackedIds.includes(id)) trackedIds.push(id)
    trackedIds = trackedIds.slice(-100)
    try {
      storage?.setItem(storageKey, JSON.stringify(trackedIds))
    } catch {
      return
    }
  }

  function upsertPublication(publication) {
    publications.value = [
      publication,
      ...publications.value.filter(item => item.id !== publication.id)
    ].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    rememberPublication(publication.id)
    if (publication.status === 'published') {
      for (const frozen of publication.jobs || []) {
        const current = jobs.value.find(
          job => job.id === frozen.id && job.publicationId === publication.id
        )
        if (current) upsertJob({ ...current, status: 'published' })
      }
    }
  }

  async function refresh() {
    if (refreshPromise) return refreshPromise
    loading.value = true
    refreshPromise = (async () => {
      try {
        const data = await api.listJobs()
        if (disposed) return
        const ids = new Set(data.jobs.map(job => job.id))
        jobs.value = jobs.value.filter(job => ids.has(job.id))
        for (const id of Object.keys(sessions)) if (!ids.has(id)) delete sessions[id]
        data.jobs.forEach(job => upsertJob(job))
        jobs.value.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        selectedIds.value = selectedIds.value.filter(id =>
          jobs.value.some(job => job.id === id && canPublish(job))
        )
        if (!selectedJob.value) selectNextPending()
        for (const job of jobs.value) if (job.publicationId) rememberPublication(job.publicationId)
        const results = await Promise.allSettled(trackedIds.map(id => api.getPublication(id)))
        const failures = {}
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') upsertPublication(result.value)
          else failures[trackedIds[index]] = errorMessage(result.reason)
        })
        publicationErrors.value = failures
        error.value = ''
      } catch (failure) {
        error.value = errorMessage(failure)
        throw failure
      } finally {
        loading.value = false
        refreshPromise = null
      }
    })()
    return refreshPromise
  }

  function acceptRemoteReview() {
    if (selectedJob.value) resetSession(selectedJob.value)
  }

  async function recordConflict(failure, id) {
    if (failure.status !== 409 && !/CONFLICT|LEASE/.test(failure.code || '')) return
    await api
      .getJob(id)
      .then(job => upsertJob(job))
      .catch(() => undefined)
    if (sessions[id])
      sessions[id].conflict = {
        remoteRevision: jobs.value.find(job => job.id === id)?.revision,
        message: failure.code?.includes('LEASE')
          ? '另一处正在进行 AI 分析，请稍后刷新重试。'
          : '审核版本已更新，本地草稿已保留。'
      }
  }

  async function saveReview({ useLatest = false } = {}) {
    const job = selectedJob.value
    if (!job || !canReview(job)) throw new Error('当前任务不能编辑审核信息')
    const draft = JSON.parse(JSON.stringify(reviewDraft.value))
    const errors = validateReview(draft, job.result?.frames)
    if (errors.length) throw new Error(errors.join('；'))
    if (draft.ai && draft.ai.frameId !== draft.selectedFrameId) delete draft.ai
    reviewBusy.value = true
    try {
      const updated = await api.saveReview(job.id, {
        revision: useLatest ? job.revision : draftRevision.value,
        review: draft
      })
      upsertJob(updated, { acceptReview: true })
      return updated
    } catch (failure) {
      await recordConflict(failure, job.id)
      throw failure
    } finally {
      reviewBusy.value = false
    }
  }

  async function analyzeReview(options) {
    const job = selectedJob.value
    if (!job || !canReview(job)) throw new Error('当前任务不能进行 AI 分析')
    if (conflict.value) throw new Error('请先处理审核版本冲突')
    reviewBusy.value = true
    try {
      const updated = await analyzeVideoFrame({
        ...options,
        topics: topics.value,
        api,
        job: { ...job, revision: draftRevision.value },
        review: JSON.parse(JSON.stringify(reviewDraft.value))
      })
      upsertJob(updated, { acceptReview: true })
      return updated
    } catch (failure) {
      await recordConflict(failure, job.id)

      await api
        .getJob(job.id)
        .then(updated => upsertJob(updated))
        .catch(() => undefined)
      throw failure
    } finally {
      reviewBusy.value = false
    }
  }

  async function publishSelected() {
    const selected = selectedIds.value.map(id => jobs.value.find(job => job.id === id))
    if (selected.length > 30) throw new Error('每个发布批次最多30个视频，请分批选择')
    if (!selected.length || selected.some(job => !canPublish(job)))
      throw new Error('请选择审核完整且待发布的任务')
    if (
      selected.some(
        job =>
          sessions[job.id] && JSON.stringify(sessions[job.id].draft) !== sessions[job.id].baseline
      )
    ) {
      throw new Error('所选任务有未保存的审核草稿，请先保存')
    }
    publishing.value = true
    try {
      const publication = await api.publish(
        selected.map(job => ({ id: job.id, revision: job.revision }))
      )
      upsertPublication(publication)
      selectedIds.value = []
      selected.forEach(job =>
        upsertJob({ ...job, status: 'publishing', publicationId: publication.id })
      )
      return publication
    } finally {
      publishing.value = false
    }
  }

  async function retryPublication(id) {
    const publication = await api.retryPublication(id)
    upsertPublication(publication)
    return publication
  }

  async function retryJob(job) {
    if (job.publicationId) return retryPublication(job.publicationId)
    const updated = await api.retryJob(job.id)
    upsertJob(updated)
    return updated
  }

  function startPolling(interval = 5000) {
    if (pollingTimer || disposed) return
    const tick = async () => {
      if (disposed) return
      if (!globalThis.document?.hidden) await refresh().catch(() => {})
      if (!disposed) pollingTimer = setTimeout(tick, interval)
    }
    pollingTimer = setTimeout(tick, interval)
  }

  function dispose() {
    disposed = true
    clearTimeout(pollingTimer)
  }

  return {
    jobs,
    publications,
    topics,
    topicsError,
    selectedJob,
    selectedJobId,
    selectedIds,
    loading,
    error,
    publicationErrors,
    reviewDraft,
    draftRevision,
    conflict,
    isDirty,
    hasUnsavedDrafts,
    publishableJobs,
    pendingJobs,
    publishedJobs,
    reviewBusy,
    publishing,
    refresh,
    loadTopics,
    selectJob,
    upsertJob,
    saveReview,
    analyzeReview,
    acceptRemoteReview,
    publishSelected,
    retryPublication,
    retryJob,
    startPolling,
    dispose
  }
}
