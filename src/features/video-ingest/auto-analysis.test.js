import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createVideoWorkspace } from './workspace'
import { createVideoAutoAnalysis } from './auto-analysis'

function deferred() {
  let resolve
  const promise = new Promise(done => {
    resolve = done
  })
  return { promise, resolve }
}

function job(id = 'job-a') {
  return {
    id,
    revision: 1,
    status: 'awaiting_ai',
    filename: `${id}.mp4`,
    result: {
      defaultFrameId: 'frame-a',
      frames: [
        { id: 'frame-a', url: 'signed-frame' },
        { id: 'frame-b', url: 'signed-second' }
      ],
      metadata: { width: 1920, height: 1080 },
      download: { sha256: 'result-hash' }
    },
    review: {
      selectedFrameId: 'frame-a',
      usage: 'desktop',
      topic: '通用',
      filename: `${id}.mp4`,
      displayTitle: '',
      description: '',
      keywords: []
    }
  }
}

async function fixture(initial = [job()]) {
  const state = {
    remote: initial,
    allowed: true,
    credentials: {
      apiKey: 'synthetic-key',
      model: 'vision-alpha',
      signal: new globalThis.AbortController().signal
    }
  }
  const api = {
    listJobs: async () => ({ jobs: state.remote }),
    claimAi: vi.fn(async (_id, revision) => ({ leaseToken: 'lease', revision: revision + 1 })),
    releaseAi: vi.fn(async () => {}),
    saveReview: vi.fn(async (id, { review }) => {
      const updated = {
        ...state.remote.find(item => item.id === id),
        revision: 3,
        status: 'awaiting_review',
        review
      }
      state.remote = state.remote.map(item => (item.id === id ? updated : item))
      return updated
    }),
    getJob: async id => state.remote.find(item => item.id === id)
  }
  const workspace = createVideoWorkspace({ api, owner: 'test', storage: null })
  await workspace.refresh()
  const analyzeImage = vi.fn(async () => ({
    secondary: '风景',
    description: 'AI描述',
    displayTitle: 'AI标题',
    keywords: ['风景'],
    filenameSuggestions: ['风景.mp4']
  }))
  const options = {
    workspace,
    getCredentials: () => state.credentials,
    canRun: () => state.allowed,
    storage: sessionStorage,
    contextKey: 'test-context',
    analyzeImage,
    frameToBase64: async () => 'data:image/png;base64,test'
  }
  return { state, api, workspace, analyzeImage, options, auto: createVideoAutoAnalysis(options) }
}

beforeEach(() => sessionStorage.clear())

describe('云端视频就绪后的本地自动分析', () => {
  it('串行分析新任务一次，使用默认帧且不抢当前选中任务', async () => {
    const { auto, workspace, api, analyzeImage } = await fixture([job(), job('job-b')])
    workspace.selectJob('job-b')
    await Promise.all([auto.run(), auto.run()])
    await workspace.refresh()
    await auto.run()
    expect(analyzeImage).toHaveBeenCalledTimes(2)
    expect(
      api.saveReview.mock.calls.map(([id, body]) => [id, body.review.ai.frameId]).sort()
    ).toEqual([
      ['job-a', 'frame-a'],
      ['job-b', 'frame-a']
    ])
    expect(workspace.selectedJobId.value).toBe('job-b')
    expect(auto.activeJobId.value).toBe('')
    expect(workspace.reviewBusy.value).toBe(false)
  })

  it('失败仅尝试一次，轮询和重挂载保持暂停，显式retry才再次运行', async () => {
    const { auto, workspace, options, analyzeImage } = await fixture()
    analyzeImage.mockRejectedValue(new Error('server reflected synthetic-key'))
    await auto.run()
    await workspace.refresh()
    await auto.run()
    const remounted = createVideoAutoAnalysis(options)
    await remounted.run()
    expect(analyzeImage).toHaveBeenCalledTimes(1)
    expect(remounted.errors.value['job-a']).toBeTruthy()
    expect(JSON.stringify(sessionStorage)).not.toContain('synthetic-key')
    expect(JSON.stringify(auto.errors.value)).not.toContain('synthetic-key')
    analyzeImage.mockResolvedValue({ secondary: '风景', description: '恢复' })
    await remounted.retry('job-a')
    expect(analyzeImage).toHaveBeenCalledTimes(2)
  })

  it('缺Key、缺模型或无写权限时等待，不领取云端租约', async () => {
    const { state, auto, api } = await fixture()
    state.allowed = false
    await auto.run()
    state.allowed = true
    state.credentials = { model: 'vision-alpha', apiKey: '' }
    await auto.run()
    state.credentials = { model: '', apiKey: 'synthetic-key' }
    await auto.run()
    expect(api.claimAi).not.toHaveBeenCalled()
  })

  it('跳过dirty草稿、人工服务端审核字段和已有AI结果', async () => {
    const first = job()
    const reviewed = job('reviewed')
    reviewed.review.description = '人工保留'
    const analyzed = job('analyzed')
    analyzed.review.ai = { model: 'other' }
    const { auto, workspace, api } = await fixture([first, reviewed, analyzed])
    workspace.selectJob(first.id)
    workspace.reviewDraft.value.displayTitle = '本地保留'
    await auto.run()
    expect(api.claimAi).not.toHaveBeenCalled()
    expect(workspace.reviewDraft.value.displayTitle).toBe('本地保留')
  })

  it('分析途中直接改草稿时取消写回并释放租约', async () => {
    const { auto, workspace, api, analyzeImage } = await fixture()
    analyzeImage.mockImplementation(async () => {
      workspace.reviewDraft.value.description = '分析期间人工修改'
      return { description: '不能覆盖' }
    })
    await auto.run()
    expect(api.saveReview).not.toHaveBeenCalled()
    expect(api.releaseAi).toHaveBeenCalledWith('job-a', 'lease')
    expect(workspace.reviewDraft.value.description).toBe('分析期间人工修改')
  })

  it('dispose中止在途模型，释放租约且不保存结果', async () => {
    const { auto, api, analyzeImage } = await fixture()
    analyzeImage.mockImplementation(
      ({ credentials }) =>
        new Promise((_resolve, reject) => {
          credentials.signal.addEventListener(
            'abort',
            () => reject(new globalThis.DOMException('取消', 'AbortError')),
            { once: true }
          )
        })
    )
    const pending = auto.run()
    await vi.waitFor(() => expect(analyzeImage).toHaveBeenCalledOnce())
    auto.dispose()
    await pending
    expect(api.saveReview).not.toHaveBeenCalled()
    expect(api.releaseAi).toHaveBeenCalledWith('job-a', 'lease')
    expect(auto.activeJobId.value).toBe('')
  })

  it('自动分析时手动保存或分析不能并发领取租约', async () => {
    const { auto, workspace, api, analyzeImage, options, state } = await fixture()
    const gate = deferred()
    analyzeImage.mockReturnValue(gate.promise)
    const pending = auto.run()
    await vi.waitFor(() => expect(analyzeImage).toHaveBeenCalledOnce())
    await expect(
      workspace.analyzeReview({
        analyzeImage,
        credentials: state.credentials,
        frameToBase64: options.frameToBase64
      })
    ).rejects.toThrow('进行中')
    await expect(workspace.saveReview()).rejects.toThrow('进行中')
    expect(api.claimAi).toHaveBeenCalledOnce()
    gate.resolve({ description: '完成' })
    await pending
  })

  it('租约被另一标签页占用后暂停，不轮询重复claim或调用模型', async () => {
    const { auto, api, analyzeImage } = await fixture()
    api.claimAi.mockRejectedValue({ status: 409, code: 'AI_LEASE_BUSY' })
    await auto.run()
    await auto.run()
    expect(api.claimAi).toHaveBeenCalledOnce()
    expect(analyzeImage).not.toHaveBeenCalled()
    expect(auto.errors.value['job-a']).toContain('另一处')
  })

  it('分析途中云端更换处理结果时不把旧帧分析保存到新版本', async () => {
    const { auto, workspace, api, analyzeImage } = await fixture()
    analyzeImage.mockImplementation(async () => {
      workspace.upsertJob({ ...job(), revision: 2, processingVersion: 2 })
      return { description: '旧帧结果' }
    })
    await auto.run()
    expect(api.saveReview).not.toHaveBeenCalled()
    expect(api.releaseAi).toHaveBeenCalledOnce()
  })

  it('配置变更取消旧请求，reset后仅用新模型补跑一次', async () => {
    const { auto, state, api, analyzeImage } = await fixture()
    analyzeImage.mockImplementationOnce(
      ({ credentials }) =>
        new Promise((_resolve, reject) => {
          credentials.signal.addEventListener(
            'abort',
            () => reject(new globalThis.DOMException('取消', 'AbortError')),
            { once: true }
          )
        })
    )
    const pending = auto.run()
    await vi.waitFor(() => expect(analyzeImage).toHaveBeenCalledOnce())
    state.credentials = {
      apiKey: 'replacement-key',
      model: 'vision-beta',
      signal: new globalThis.AbortController().signal
    }
    auto.reset()
    const restarted = auto.run()
    await Promise.all([pending, restarted])
    expect(analyzeImage.mock.calls.map(([input]) => input.credentials.model)).toEqual([
      'vision-alpha',
      'vision-beta'
    ])
    expect(api.saveReview).toHaveBeenCalledOnce()
    expect(api.saveReview.mock.calls[0][1].review.ai.model).toBe('vision-beta')
  })

  it('分析途中失去写权限不会保存自动结果', async () => {
    const { auto, state, api, analyzeImage } = await fixture()
    analyzeImage.mockImplementation(async () => {
      state.allowed = false
      return { description: '结果' }
    })
    await auto.run()
    expect(api.saveReview).not.toHaveBeenCalled()
    expect(api.releaseAi).toHaveBeenCalledOnce()
  })

  it('手动审核忙碌时自动队列等待，解除后可以处理尚未尝试任务', async () => {
    const { auto, workspace, api } = await fixture()
    workspace.reviewBusy.value = true
    await auto.run()
    expect(api.claimAi).not.toHaveBeenCalled()
    workspace.reviewBusy.value = false
    await auto.run()
    expect(api.claimAi).toHaveBeenCalledOnce()
  })

  it('工作台自身dispose同样取消在途自动分析并释放租约', async () => {
    const { auto, workspace, api, analyzeImage } = await fixture()
    analyzeImage.mockImplementation(
      ({ credentials }) =>
        new Promise((_resolve, reject) => {
          credentials.signal.addEventListener(
            'abort',
            () => reject(new globalThis.DOMException('取消', 'AbortError')),
            { once: true }
          )
        })
    )
    const pending = auto.run()
    await vi.waitFor(() => expect(analyzeImage).toHaveBeenCalledOnce())
    workspace.dispose()
    await pending
    expect(api.saveReview).not.toHaveBeenCalled()
    expect(api.releaseAi).toHaveBeenCalledOnce()
  })

  it.each([401, 429, 503])('服务错误%s暂停整个队列，刷新后也等待显式重试', async status => {
    const { auto, options, analyzeImage, workspace } = await fixture([job(), job('job-b')])
    analyzeImage.mockRejectedValue(Object.assign(new Error('safe service error'), { status }))
    await auto.run()
    await workspace.refresh()
    await auto.run()
    expect(auto.paused.value).toBe(true)
    const remounted = createVideoAutoAnalysis(options)
    await remounted.run()
    expect(analyzeImage).toHaveBeenCalledOnce()
    expect(remounted.paused.value).toBe(true)
    analyzeImage.mockResolvedValue({ description: '恢复' })
    await remounted.retry(Object.keys(auto.errors.value)[0])
    expect(analyzeImage).toHaveBeenCalledTimes(3)
    expect(remounted.paused.value).toBe(false)
  })

  it('手动尝试失败后block保留失败状态，自动轮询不会再抢同任务', async () => {
    const { auto, api } = await fixture()
    auto.block('job-a')
    await auto.run()
    expect(api.claimAi).not.toHaveBeenCalled()
    auto.block('job-a', Object.assign(new Error('server key'), { status: 503 }))
    await auto.run()
    expect(auto.paused.value).toBe(true)
    expect(auto.errors.value['job-a']).toBeTruthy()
    expect(api.claimAi).not.toHaveBeenCalled()
  })

  it('用户cancel仅取消当前任务，重新开启不会自动重复该次分析', async () => {
    const { auto, api, analyzeImage } = await fixture()
    analyzeImage.mockImplementation(
      ({ credentials }) =>
        new Promise((_resolve, reject) => {
          credentials.signal.addEventListener(
            'abort',
            () => reject(new globalThis.DOMException('取消', 'AbortError')),
            { once: true }
          )
        })
    )
    const pending = auto.run()
    await vi.waitFor(() => expect(analyzeImage).toHaveBeenCalledOnce())
    auto.cancel()
    await pending
    await auto.run()
    expect(analyzeImage).toHaveBeenCalledOnce()
    expect(api.releaseAi).toHaveBeenCalledOnce()
  })
})
