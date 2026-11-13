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
  it('单条发布只冻结当前任务，保留其他批量选择并阻止重复提交', async () => {
    let finish
    const publish = vi.fn(
      jobs =>
        new Promise(resolve => {
          finish = () => resolve({ id: 'single', status: 'queued', jobs })
        })
    )
    const state = createVideoWorkspace({
      owner: 'owner',
      storage: memoryStorage(),
      api: {
        listJobs: async () => ({ jobs: [job, { ...job, id: 'job-2' }] }),
        publish
      }
    })
    await state.refresh()
    state.selectedIds.value = ['job-1', 'job-2']
    const pending = state.publishJob('job-1')
    await expect(state.publishJob('job-1')).rejects.toThrow('进行中')
    finish()
    await pending
    expect(publish).toHaveBeenCalledExactlyOnceWith([{ id: 'job-1', revision: 1 }])
    expect(state.selectedIds.value).toEqual(['job-2'])
    expect(state.jobs.value.find(item => item.id === 'job-1').status).toBe('publishing')
  })

  it('单条发布拦截未保存草稿和版本冲突，保存后使用最新审核版本', async () => {
    const publish = vi.fn(async jobs => ({ id: 'single', status: 'queued', jobs }))
    const state = createVideoWorkspace({
      owner: 'owner',
      storage: memoryStorage(),
      api: {
        listJobs: async () => ({ jobs: [job] }),
        publish,
        saveReview: async (id, { review }) => ({ ...job, id, revision: 2, review })
      }
    })
    await state.refresh()
    state.reviewDraft.value.displayTitle = '新标题'
    await expect(state.publishJob(job.id)).rejects.toThrow('未保存')
    state.upsertJob({ ...job, revision: 2 })
    await expect(state.publishJob(job.id)).rejects.toThrow('冲突')
    expect(publish).not.toHaveBeenCalled()
    await state.saveReview({ useLatest: true })
    await state.publishJob(job.id)
    expect(publish).toHaveBeenCalledExactlyOnceWith([{ id: job.id, revision: 2 }])
  })

  it('竖屏默认电脑壁纸，兼容旧云端默认草稿并保留历史已发布用途', async () => {
    const portrait = {
      ...job,
      status: 'awaiting_ai',
      result: { ...job.result, metadata: { width: 1080, height: 1920 } },
      review: {
        selectedFrameId: 'frame-1',
        usage: 'mobile',
        topic: '通用',
        filename: 'source.mp4',
        displayTitle: '',
        description: '',
        keywords: []
      }
    }
    const state = createVideoWorkspace({
      owner: 'owner',
      storage: memoryStorage(),
      api: {
        listJobs: async () => ({
          jobs: [
            portrait,
            {
              ...job,
              id: 'history',
              status: 'published',
              review: { ...job.review, usage: 'mobile' }
            }
          ]
        })
      }
    })
    await state.refresh()
    expect(state.reviewDraft.value.usage).toBe('desktop')
    expect(state.canAutoAnalyze(job.id)).toBe(true)
    state.selectJob('history')
    expect(state.reviewDraft.value.usage).toBe('mobile')
  })

  it('当前处理任务轮询进入待审核后立即建立可写审核会话，不要求再次点击任务', async () => {
    let remote = { ...job, status: 'processing', revision: 1, result: undefined, review: undefined }
    const state = createVideoWorkspace({
      owner: 'owner',
      storage: memoryStorage(),
      api: {
        listJobs: async () => ({ jobs: [remote] })
      }
    })
    await state.refresh()
    expect(state.selectedJobId.value).toBe('job-1')
    remote = { ...job, status: 'awaiting_ai', revision: 2 }
    await state.refresh()
    expect(state.draftRevision.value).toBe(2)
    state.reviewDraft.value = { ...state.reviewDraft.value, displayTitle: '直接编辑生成后的任务' }
    expect(state.reviewDraft.value.displayTitle).toBe('直接编辑生成后的任务')
    expect(state.isDirty.value).toBe(true)
  })

  it('发布成功清除选中任务的草稿冲突和批量选择，并转到下一待办但保留历史', async () => {
    let remote = [{ ...job }, { ...job, id: 'job-2' }]
    const state = createVideoWorkspace({
      owner: 'owner',
      storage: memoryStorage(),
      api: {
        listJobs: async () => ({ jobs: remote })
      }
    })
    await state.refresh()
    state.selectJob('job-1')
    state.reviewDraft.value.displayTitle = '未保存草稿'
    state.upsertJob({ ...job, revision: 2 })
    expect(state.conflict.value).not.toBeNull()
    state.selectedIds.value = ['job-1', 'job-2']
    remote = [
      { ...job, status: 'published', revision: 3 },
      { ...job, id: 'job-2' }
    ]
    await state.refresh()
    expect(state.selectedJobId.value).toBe('job-2')
    expect(state.selectedIds.value).toEqual(['job-2'])
    expect(state.hasUnsavedDrafts.value).toBe(false)
    expect(state.conflict.value).toBeNull()
    expect(state.publishedJobs.value.map(item => item.id)).toEqual(['job-1'])
    expect(state.pendingJobs.value.map(item => item.id)).toEqual(['job-2'])
    state.selectJob('job-1')
    expect(state.reviewDraft.value.displayTitle).toBe('星空')
    expect(state.isDirty.value).toBe(false)
    await state.refresh()
    expect(state.selectedJobId.value).toBe('job-1')
    expect(state.conflict.value).toBeNull()
  })

  it('刷新后仅有已发布历史时不自动打开，手动打开历史不产生可写草稿', async () => {
    const state = createVideoWorkspace({
      owner: 'owner',
      storage: memoryStorage(),
      api: {
        listJobs: async () => ({ jobs: [{ ...job, status: 'published' }] })
      }
    })
    await state.refresh()
    expect(state.selectedJobId.value).toBe('')
    expect(state.reviewDraft.value).toBeNull()
    state.selectJob('job-1')
    state.reviewDraft.value = { ...state.reviewDraft.value, displayTitle: '不能写回历史' }
    expect(state.reviewDraft.value.displayTitle).toBe('星空')
    expect(state.hasUnsavedDrafts.value).toBe(false)
    await state.refresh()
    expect(state.selectedJobId.value).toBe('job-1')
    expect(state.reviewDraft.value.displayTitle).toBe('星空')
  })

  it('publication先报告成功时清理本地待发状态，旧列表轮询不能恢复完成任务', async () => {
    const state = createVideoWorkspace({
      owner: 'owner',
      storage: memoryStorage(),
      api: {
        listJobs: async () => ({
          jobs: [{ ...job, status: 'publishing', publicationId: 'pub-1' }]
        }),
        getPublication: async () => ({ id: 'pub-1', status: 'published', jobs: [{ ...job }] })
      }
    })
    await state.refresh()
    expect(state.jobs.value[0].status).toBe('published')
    expect(state.selectedJobId.value).toBe('')
    expect(state.pendingJobs.value).toEqual([])
    state.selectJob('job-1')
    await state.refresh()
    expect(state.jobs.value[0].status).toBe('published')
    expect(state.selectedJobId.value).toBe('job-1')
    expect(state.hasUnsavedDrafts.value).toBe(false)
  })

  it('publication进度读取失败不误判发布成功，保留审核草稿与错误供恢复', async () => {
    const state = createVideoWorkspace({
      owner: 'owner',
      storage: memoryStorage(),
      api: {
        listJobs: async () => ({ jobs: [{ ...job, publicationId: 'pub-1' }] }),
        getPublication: async () => {
          throw new Error('发布进度暂不可用')
        }
      }
    })
    await state.refresh()
    state.reviewDraft.value.displayTitle = '保留待办草稿'
    await state.refresh()
    expect(state.pendingJobs.value).toHaveLength(1)
    expect(state.publishedJobs.value).toEqual([])
    expect(state.reviewDraft.value.displayTitle).toBe('保留待办草稿')
    expect(state.hasUnsavedDrafts.value).toBe(true)
    expect(state.publicationErrors.value['pub-1']).toBe('发布进度暂不可用')
  })

  it('失败刷新不丢失待办草稿，服务端移除任务后清理孤立草稿', async () => {
    let mode = 'success'
    const state = createVideoWorkspace({
      owner: 'owner',
      storage: memoryStorage(),
      api: {
        listJobs: async () => {
          if (mode === 'failed') throw new Error('网络中断')
          return { jobs: mode === 'empty' ? [] : [job] }
        }
      }
    })
    await state.refresh()
    state.reviewDraft.value.displayTitle = '待恢复草稿'
    mode = 'failed'
    await expect(state.refresh()).rejects.toThrow('网络中断')
    expect(state.selectedJobId.value).toBe('job-1')
    expect(state.reviewDraft.value.displayTitle).toBe('待恢复草稿')
    mode = 'empty'
    await state.refresh()
    expect(state.selectedJobId.value).toBe('')
    expect(state.hasUnsavedDrafts.value).toBe(false)
  })

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
