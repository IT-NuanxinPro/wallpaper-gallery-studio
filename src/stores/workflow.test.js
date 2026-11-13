import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { githubService } from '@/services/github'
import { useWorkflowStore } from './workflow'

vi.mock('@/services/github', () => ({
  githubService: {
    getPendingImages: vi.fn(),
    getStats: vi.fn(),
    hasRunningWorkflow: vi.fn(),
    triggerWorkflow: vi.fn(),
    rollbackToLastTag: vi.fn(),
    dispatchWorkflowByName: vi.fn()
  }
}))

function deferred() {
  let resolve
  let reject
  const promise = new Promise((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  vi.useFakeTimers()
  githubService.hasRunningWorkflow.mockResolvedValue({ hasRunning: true, latestRun: { id: 'new' } })
})
afterEach(() => {
  useWorkflowStore().cleanup()
  vi.useRealTimers()
})

describe('工作流请求与仓库会话绑定', () => {
  it.each([
    [
      'refreshPendingInfo',
      'getPendingImages',
      'pendingInfo',
      { pendingCount: 9, latestTag: 'old' },
      { pendingCount: 1, latestTag: 'new' }
    ],
    ['refreshStatsData', 'getStats', 'statsData', { total: 9 }, { total: 1 }],
    [
      'refreshWorkflowStatus',
      'hasRunningWorkflow',
      'workflowStatus',
      { hasRunning: false, latestRun: { id: 'old' } },
      { hasRunning: true, latestRun: { id: 'new' } }
    ]
  ])('%s忽略清理前旧仓库的迟到响应', async (action, method, field, oldValue, newValue) => {
    const old = deferred()
    githubService[method].mockReturnValueOnce(old.promise).mockResolvedValueOnce(newValue)
    const store = useWorkflowStore()
    const pending = store[action]('owner', 'old')
    store.cleanup()
    await store[action]('owner', 'new')
    old.resolve(oldValue)
    await pending
    expect(store[field]).toMatchObject(newValue)
  })

  it('同一仓库只接受最新一次刷新，旧错误不覆盖结果', async () => {
    const old = deferred()
    githubService.getPendingImages
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ pendingCount: 1, error: null })
    const store = useWorkflowStore()
    const pending = store.refreshPendingInfo('owner', 'repo')
    await store.refreshPendingInfo('owner', 'repo')
    old.reject(new Error('old failure'))
    await expect(pending).resolves.toBeNull()
    expect(store.pendingInfo).toMatchObject({ pendingCount: 1, error: null })
    expect(store.loading).toBe(false)
  })

  it('改变图床仓库使旧请求失效，并清除统计和上传计数', async () => {
    const old = deferred()
    const store = useWorkflowStore()
    store.setImageRepoConfig('owner', 'old', 'main')
    store.statsData = { total: 8 }
    store.addSessionUpload(3)
    githubService.getPendingImages.mockReturnValueOnce(old.promise)
    const pending = store.refreshPendingInfo('owner', 'old')
    store.setImageRepoConfig('owner', 'new', 'main')
    old.resolve({ pendingCount: 8 })
    await pending
    expect(store.pendingInfo.pendingCount).toBe(0)
    expect(store.statsData).toBeNull()
    expect(store.sessionUploadCount).toBe(0)
    expect(store.loading).toBe(false)
  })

  it('清理后旧触发完成不能恢复标记或启动旧轮询', async () => {
    const old = deferred()
    const store = useWorkflowStore()
    store.pendingInfo.pendingCount = 1
    githubService.triggerWorkflow.mockReturnValueOnce(old.promise)
    const pending = store.triggerWorkflow('owner', 'old')
    store.cleanup()
    old.resolve(true)
    await expect(pending).resolves.toBe(false)
    await vi.advanceTimersByTimeAsync(4000)
    expect(store.workflowStatus.justTriggered).toBe(false)
    expect(store.polling).toBe(false)
    expect(githubService.hasRunningWorkflow).not.toHaveBeenCalled()
  })

  it('旧轮询响应不能停止后来启动的新仓库轮询', async () => {
    const old = deferred()
    const store = useWorkflowStore()
    githubService.hasRunningWorkflow
      .mockResolvedValueOnce({ hasRunning: true })
      .mockReturnValueOnce(old.promise)
    store.startPolling('owner', 'old', 1000)
    await vi.advanceTimersByTimeAsync(1000)
    store.cleanup()
    store.startPolling('owner', 'new', 1000)
    await Promise.resolve()
    old.resolve({ hasRunning: false })
    await Promise.resolve()
    await Promise.resolve()
    expect(store.polling).toBe(true)
    expect(store.workflowStatus).toMatchObject({ hasRunning: true, latestRun: { id: 'new' } })
  })

  it('切换工作流目标后旧触发响应不能启动原仓库轮询', async () => {
    const old = deferred()
    const store = useWorkflowStore()
    store.pendingInfo.pendingCount = 1
    githubService.triggerWorkflow.mockReturnValueOnce(old.promise)
    const pending = store.triggerWorkflow('owner', 'old-workflow')
    await store.refreshWorkflowStatus('owner', 'new-workflow')
    old.resolve(true)
    await expect(pending).resolves.toBe(false)
    await vi.advanceTimersByTimeAsync(4000)
    expect(githubService.hasRunningWorkflow.mock.calls).toEqual([['owner', 'new-workflow']])
    expect(store.triggering).toBe(false)
  })

  it('完成后的延迟刷新保留启动分支，清理会取消该回调', async () => {
    const store = useWorkflowStore()
    store.setImageRepoConfig('owner', 'images', 'release')
    store.workflowStatus.hasRunning = true
    githubService.hasRunningWorkflow.mockResolvedValue({ hasRunning: false })
    githubService.getPendingImages.mockResolvedValue({ pendingCount: 0 })
    githubService.getStats.mockResolvedValue({ total: 2 })
    await store.refreshWorkflowStatus('owner', 'workflow')
    await vi.advanceTimersByTimeAsync(1500)
    expect(githubService.getPendingImages).toHaveBeenCalledWith('owner', 'images', 'release')
    expect(githubService.getStats).toHaveBeenCalledWith('owner', 'images', 'release')

    store.workflowStatus.hasRunning = true
    await store.refreshWorkflowStatus('owner', 'workflow')
    store.cleanup()
    await vi.advanceTimersByTimeAsync(2000)
    expect(githubService.getStats).toHaveBeenCalledTimes(1)
    expect(store.statsData).toBeNull()
  })
})
