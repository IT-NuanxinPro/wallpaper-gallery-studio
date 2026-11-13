import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { githubService } from '@/services/github'

function emptyPendingInfo() {
  return {
    pendingCount: 0,
    pendingFiles: [],
    latestTag: null,
    latestTagInfo: null,
    message: null,
    error: null
  }
}
function emptyWorkflowStatus() {
  return {
    hasRunning: false,
    runningWorkflow: null,
    latestRun: null,
    justTriggered: false,
    triggerTime: null
  }
}
function repositoryKey(owner, repo, branch = '') {
  return JSON.stringify([owner, repo, branch])
}

export const useWorkflowStore = defineStore('workflow', () => {
  const loading = ref(false)
  const triggering = ref(false)
  const polling = ref(false)
  const pendingInfo = ref(emptyPendingInfo())
  const statsData = ref(null)
  const workflowStatus = ref(emptyWorkflowStatus())
  const sessionUploadCount = ref(0)
  let epoch = 0
  let requestSequence = 0
  const requests = new Map()
  const activeLoads = new Set()
  let imageContext = null
  let workflowContext = ''
  let pollTimer = null
  let pollGeneration = 0
  const delayTimers = new Set()
  const MAX_POLL_TIME = 30 * 60 * 1000

  // 每类请求只接受当前会话、当前目标的最后一次响应。
  function beginRequest(kind, key, workflow = false) {
    const request = { epoch, key, sequence: ++requestSequence }
    requests.set(kind, request)
    return {
      isCurrent: () =>
        epoch === request.epoch &&
        requests.get(kind) === request &&
        (!workflow || workflowContext === key)
    }
  }
  function beginLoading() {
    const activity = {}
    activeLoads.add(activity)
    loading.value = true
    return () => {
      activeLoads.delete(activity)
      loading.value = activeLoads.size > 0
    }
  }
  function clearDelayTimers() {
    delayTimers.forEach(timer => clearTimeout(timer))
    delayTimers.clear()
  }
  function addDelayTimer(callback, delay, isCurrent) {
    const timer = setTimeout(() => {
      delayTimers.delete(timer)
      if (isCurrent()) callback()
    }, delay)
    delayTimers.add(timer)
  }
  function bindWorkflow(owner, repo) {
    const key = repositoryKey(owner, repo)
    if (workflowContext && workflowContext !== key) {
      stopPolling()
      clearDelayTimers()
      workflowStatus.value = emptyWorkflowStatus()
      triggering.value = false
    }
    workflowContext = key
    return key
  }
  function captureContext() {
    const revision = epoch
    const workflow = workflowContext
    const image = imageContext
    return {
      image,
      isCurrent: () => revision === epoch && workflow === workflowContext && image === imageContext
    }
  }

  const canTrigger = computed(
    () =>
      !loading.value &&
      !triggering.value &&
      !workflowStatus.value.justTriggered &&
      !workflowStatus.value.hasRunning &&
      pendingInfo.value.pendingCount > 0
  )
  const isRunning = computed(
    () => workflowStatus.value.justTriggered || workflowStatus.value.hasRunning
  )
  const statusText = computed(() => {
    if (workflowStatus.value.justTriggered) return '已触发，等待启动...'
    if (!workflowStatus.value.hasRunning) return null
    const run = workflowStatus.value.runningWorkflow
    if (run?.status === 'queued') return '排队中...'
    if (run?.status === 'in_progress') return '运行中...'
    return '处理中...'
  })

  async function refreshPendingInfo(owner, repo, branch = 'main') {
    setImageRepoConfig(owner, repo, branch)
    const request = beginRequest('pending', repositoryKey(owner, repo, branch))
    const finishLoading = beginLoading()
    try {
      const info = await githubService.getPendingImages(owner, repo, branch)
      if (!request.isCurrent()) return null
      pendingInfo.value = info
      return info
    } catch (error) {
      if (!request.isCurrent()) return null
      pendingInfo.value.error = error.message
      throw error
    } finally {
      finishLoading()
    }
  }

  async function refreshStatsData(owner, repo, branch = 'main') {
    setImageRepoConfig(owner, repo, branch)
    const request = beginRequest('stats', repositoryKey(owner, repo, branch))
    try {
      const data = await githubService.getStats(owner, repo, branch)
      if (!request.isCurrent()) return null
      statsData.value = data
      return data
    } catch (error) {
      if (request.isCurrent()) console.error('Failed to refresh stats data:', error)
      return null
    }
  }

  async function refreshWorkflowStatus(owner, repo) {
    const key = bindWorkflow(owner, repo)
    const request = beginRequest('workflow', key, true)
    const context = captureContext()
    try {
      const status = await githubService.hasRunningWorkflow(owner, repo)
      if (!request.isCurrent()) return null
      const wasRunning = workflowStatus.value.hasRunning || workflowStatus.value.justTriggered
      workflowStatus.value = {
        ...status,
        justTriggered: false,
        triggerTime: status.hasRunning ? workflowStatus.value.triggerTime : null
      }
      if (!status.hasRunning && wasRunning && context.image) {
        const { owner: imageOwner, repo: imageRepo, branch } = context.image
        addDelayTimer(
          async () => {
            try {
              await Promise.all([
                refreshPendingInfo(imageOwner, imageRepo, branch),
                refreshStatsData(imageOwner, imageRepo, branch)
              ])
            } catch (error) {
              if (context.isCurrent()) console.error('[WorkflowStore] 数据刷新失败:', error)
            }
          },
          1500,
          context.isCurrent
        )
      }
      return status
    } catch (error) {
      if (!request.isCurrent()) return null
      console.error('Failed to refresh workflow status:', error)
      return workflowStatus.value
    }
  }

  async function triggerWorkflow(owner, repo, message = '', publisher = '') {
    if (!canTrigger.value) return false
    const request = beginRequest('trigger', bindWorkflow(owner, repo), true)
    const context = captureContext()
    triggering.value = true
    try {
      await githubService.triggerWorkflow(owner, repo, 'process-wallpapers', {
        message: message || `chore: 处理 ${pendingInfo.value.pendingCount} 张新图片`,
        publisher: publisher || ''
      })
      if (!request.isCurrent()) return false
      workflowStatus.value.justTriggered = true
      workflowStatus.value.triggerTime = Date.now()
      addDelayTimer(() => startPolling(owner, repo), 3000, context.isCurrent)
      return true
    } catch (error) {
      if (!request.isCurrent()) return false
      throw error
    } finally {
      if (request.isCurrent()) triggering.value = false
    }
  }

  async function rollbackLastRelease(imageOwner, imageRepo, owner, repo, tagName = '') {
    const request = beginRequest('rollback', bindWorkflow(owner, repo), true)
    const context = captureContext()
    const finishLoading = beginLoading()
    try {
      const result = await githubService.rollbackToLastTag(
        imageOwner,
        imageRepo,
        owner,
        repo,
        tagName
      )
      if (!request.isCurrent()) return null
      workflowStatus.value.justTriggered = true
      workflowStatus.value.triggerTime = Date.now()
      addDelayTimer(() => startPolling(owner, repo), 3000, context.isCurrent)
      return result
    } catch (error) {
      if (!request.isCurrent()) return null
      throw error
    } finally {
      finishLoading()
    }
  }

  async function triggerFrontendDeploy(owner, repo) {
    const request = beginRequest('deploy', repositoryKey(owner, repo))
    const finishLoading = beginLoading()
    try {
      await githubService.dispatchWorkflowByName(owner, repo, 'deploy.yml')
      return request.isCurrent()
    } catch (error) {
      if (!request.isCurrent()) return false
      throw error
    } finally {
      finishLoading()
    }
  }

  function startPolling(owner, repo, interval = 5000) {
    bindWorkflow(owner, repo)
    stopPolling()
    const generation = pollGeneration
    const context = captureContext()
    const startedAt = Date.now()
    const isCurrent = () => generation === pollGeneration && context.isCurrent()
    polling.value = true
    refreshWorkflowStatus(owner, repo)
    pollTimer = setInterval(async () => {
      if (!isCurrent()) return
      if (Date.now() - startedAt > MAX_POLL_TIME) {
        workflowStatus.value.justTriggered = false
        workflowStatus.value.triggerTime = null
        stopPolling()
        return
      }
      const status = await refreshWorkflowStatus(owner, repo)
      if (!isCurrent() || !status) return
      if (!status.hasRunning && !workflowStatus.value.justTriggered) {
        stopPolling()
      } else if (
        workflowStatus.value.justTriggered &&
        workflowStatus.value.triggerTime &&
        Date.now() - workflowStatus.value.triggerTime > 10 * 60 * 1000
      ) {
        workflowStatus.value.justTriggered = false
        workflowStatus.value.triggerTime = null
        stopPolling()
      }
    }, interval)
  }

  function stopPolling() {
    pollGeneration++
    requests.delete('workflow')
    if (pollTimer !== null) clearInterval(pollTimer)
    pollTimer = null
    polling.value = false
  }

  function setImageRepoConfig(owner, repo, branch = 'main') {
    const key = repositoryKey(owner, repo, branch)
    if (imageContext?.key === key) return
    if (imageContext) cleanup()
    imageContext = { owner, repo, branch, key }
  }

  function addSessionUpload(count = 1) {
    sessionUploadCount.value += count
  }
  function resetSessionUpload() {
    sessionUploadCount.value = 0
  }

  function cleanup() {
    epoch++
    requests.clear()
    stopPolling()
    clearDelayTimers()
    activeLoads.clear()
    loading.value = false
    triggering.value = false
    pendingInfo.value = emptyPendingInfo()
    statsData.value = null
    workflowStatus.value = emptyWorkflowStatus()
    sessionUploadCount.value = 0
    imageContext = null
    workflowContext = ''
  }

  return {
    loading,
    triggering,
    polling,
    pendingInfo,
    workflowStatus,
    sessionUploadCount,
    statsData,
    canTrigger,
    isRunning,
    statusText,
    refreshPendingInfo,
    refreshStatsData,
    refreshWorkflowStatus,
    triggerWorkflow,
    triggerFrontendDeploy,
    rollbackLastRelease,
    startPolling,
    stopPolling,
    setImageRepoConfig,
    addSessionUpload,
    resetSessionUpload,
    cleanup
  }
})
