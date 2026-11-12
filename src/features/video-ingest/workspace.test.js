import { describe, expect, it, vi } from 'vitest'
import { createVideoWorkspace } from './workspace'
import { VideoApiError } from './api'

const job = {
  id: 'job-1',
  revision: 1,
  filename: 'source.mp4',
  status: 'awaiting_review',
  review: {
    selectedFrameId: 'frame-1',
    usage: 'desktop',
    topic: '风景',
    filename: '星空.mp4',
    displayTitle: '星空',
    description: '星空描述',
    keywords: ['星空']
  },
  result: {
    defaultFrameId: 'frame-1',
    frames: [{ id: 'frame-1', url: 'short-lived' }],
    metadata: { width: 1920, height: 1080 }
  }
}

function memoryStorage(initial = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: key => data[key] || null,
    setItem: (key, value) => {
      data[key] = value
    }
  }
}

describe('视频工作台恢复与审核', () => {
  it('加载已有视频分类；后续读取失败保留候选，并允许继续编辑审核', async () => {
    let failing = false
    const state = createVideoWorkspace({
      owner: 'owner',
      storage: memoryStorage(),
      api: {
        getTopics: async () => {
          if (failing) throw new Error('分类暂不可用')
          return { topics: ['宝可梦', '动漫', '宝可梦', ' ', 1] }
        },
        listJobs: async () => ({ jobs: [job] })
      }
    })
    await state.loadTopics()
    expect(state.topics.value).toEqual(['宝可梦', '动漫'])
    expect(state.topicsError.value).toBe('')
    failing = true
    await expect(state.loadTopics()).resolves.toEqual(['宝可梦', '动漫'])
    expect(state.topicsError.value).toBe('分类暂不可用')
    await state.refresh()
    state.selectJob(job.id)
    state.reviewDraft.value.topic = '人工输入主题'
    expect(state.reviewDraft.value.topic).toBe('人工输入主题')
  })

  it('切换任务后仍保留其他任务草稿，并持续提示未保存修改', async () => {
    const state = createVideoWorkspace({
      owner: 'owner',
      storage: memoryStorage(),
      api: {
        listJobs: async () => ({ jobs: [job, { ...job, id: 'job-2' }] })
      }
    })
    await state.refresh()
    state.selectJob('job-1')
    state.reviewDraft.value.displayTitle = '尚未保存'
    state.selectJob('job-2')
    expect(state.isDirty.value).toBe(false)
    expect(state.hasUnsavedDrafts.value).toBe(true)
    state.selectJob('job-1')
    expect(state.reviewDraft.value.displayTitle).toBe('尚未保存')
  })

  it('刷新从服务端恢复任务并从任务publicationId恢复发布进度', async () => {
    const storage = memoryStorage()
    const state = createVideoWorkspace({
      owner: 'owner',
      storage,
      api: {
        listJobs: async () => ({
          jobs: [{ ...job, publicationId: 'pub-1', status: 'publishing' }]
        }),
        getPublication: async id => ({ id, status: 'deploying', jobs: [] })
      }
    })
    await state.refresh()
    expect(state.jobs.value[0].id).toBe('job-1')
    expect(state.publications.value[0].status).toBe('deploying')
    expect(Object.values(storage.data).join('')).not.toContain('short-lived')
    expect(Object.values(storage.data).join('')).toContain('pub-1')
  })

  it('远端版本更新保留本地草稿，显式采纳服务端版本后解除冲突', async () => {
    let remote = globalThis.structuredClone(job)
    const state = createVideoWorkspace({
      owner: 'owner',
      storage: memoryStorage(),
      api: {
        listJobs: async () => ({ jobs: [remote] }),
        saveReview: async () => {
          throw new VideoApiError('版本已更新', 409, 'REVISION_CONFLICT')
        },
        getJob: async () => remote
      }
    })
    await state.refresh()
    state.selectJob('job-1')
    state.reviewDraft.value.displayTitle = '本地草稿'
    remote = { ...remote, revision: 2, review: { ...remote.review, displayTitle: '远端标题' } }
    await expect(state.saveReview()).rejects.toThrow('版本已更新')
    expect(state.reviewDraft.value.displayTitle).toBe('本地草稿')
    expect(state.conflict.value.remoteRevision).toBe(2)
    expect(state.draftRevision.value).toBe(1)
    state.acceptRemoteReview()
    expect(state.reviewDraft.value.displayTitle).toBe('远端标题')
    expect(state.draftRevision.value).toBe(2)
    expect(state.conflict.value).toBeNull()
  })

  it('批量发布冻结已保存版本，失败任务通过publication重试', async () => {
    let frozen
    const retryPublication = vi.fn(async id => ({ id, status: 'queued', jobs: [] }))
    const state = createVideoWorkspace({
      owner: 'owner',
      storage: memoryStorage(),
      api: {
        listJobs: async () => ({ jobs: [job] }),
        publish: async jobs => {
          frozen = jobs
          return { id: 'pub-1', status: 'queued', jobs }
        },
        getPublication: async id => ({ id, status: 'queued', jobs: [] }),
        retryPublication
      }
    })
    await state.refresh()
    state.selectedIds.value = ['job-1']
    await state.publishSelected()
    expect(frozen).toEqual([{ id: 'job-1', revision: 1 }])
    await state.retryJob({ ...job, status: 'failed', publicationId: 'pub-1' })
    expect(retryPublication).toHaveBeenCalledWith('pub-1')
  })

  it('单次发布超过30项时在客户端阻止，保留原选择供用户分批', async () => {
    const state = createVideoWorkspace({
      owner: 'owner',
      storage: memoryStorage(),
      api: {
        listJobs: async () => ({
          jobs: Array.from({ length: 31 }, (_, index) => ({ ...job, id: `job-${index}` }))
        }),
        publish: async () => ({ id: 'should-not-publish', status: 'queued', jobs: [] })
      }
    })
    await state.refresh()
    state.selectedIds.value = state.jobs.value.map(item => item.id)
    await expect(state.publishSelected()).rejects.toThrow('30')
    expect(state.selectedIds.value).toHaveLength(31)
  })
})
