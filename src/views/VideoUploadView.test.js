import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus from 'element-plus'
import VideoUploadView from './VideoUploadView.vue'

const state = vi.hoisted(() => ({ workspace: null }))
vi.mock('@/components/MainLayout.vue', () => ({ default: { template: '<main><slot /></main>' } }))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ canUpload: true, permissionChecked: true, user: { login: 'tester' } })
}))
vi.mock('@/stores/config', () => ({ useConfigStore: () => ({ isConfigured: false }) }))
vi.mock('@/stores/credentials', () => ({
  useCredentialsStore: () => ({ hasCredentials: false, loadCredentials: vi.fn() })
}))
vi.mock('@/services/ai/classifier', () => ({
  analyzeImage: vi.fn(),
  CLASSIFIER_CONFIG: { defaultModel: 'sub2api-gpt-6.1-sol' }
}))
vi.mock('@/features/video-ingest/api', () => ({ createVideoApi: () => ({ configured: true }) }))
vi.mock('@/features/video-ingest/uploader', () => ({
  createVideoUploader: () => ({ upload: vi.fn() })
}))
vi.mock('@/features/video-ingest/workspace', () => ({
  createVideoWorkspace: () => state.workspace
}))

beforeEach(() => {
  window.innerWidth = 1440
  state.workspace = {
    jobs: ref([]),
    publications: ref([{ id: 'old', status: 'published', jobs: ['old-job'] }]),
    topics: ref([]),
    topicsError: ref(''),
    selectedJob: ref(null),
    selectedJobId: ref(''),
    selectedIds: ref([]),
    loading: ref(false),
    error: ref(''),
    publicationErrors: ref({}),
    reviewDraft: ref(null),
    draftRevision: ref(0),
    conflict: ref(null),
    isDirty: ref(false),
    hasUnsavedDrafts: ref(false),
    reviewBusy: ref(false),
    publishing: ref(false),
    refresh: vi.fn(),
    loadTopics: vi.fn(),
    startPolling: vi.fn(),
    dispose: vi.fn(),
    selectJob: vi.fn()
  }
})

describe('发布完成提示', () => {
  it('没有Key时添加视频立即提示配置，不打开文件选择器', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: VideoUploadView }]
    })
    await router.push('/')
    const panel = mount(
      { template: '<router-view />' },
      {
        attachTo: document.body,
        global: {
          plugins: [ElementPlus, router],
          stubs: { VideoJobQueue: true, VideoReviewPanel: true }
        }
      }
    )
    await flushPromises()
    const inputClick = vi.spyOn(panel.get('input[type="file"]').element, 'click')
    const add = panel.findAll('button').find(button => button.text() === '添加视频')
    await add.trigger('click')
    await flushPromises()
    expect(inputClick).not.toHaveBeenCalled()
    expect(document.querySelector('.studio-action-notice')?.textContent).toContain(
      '请先配置 API Key'
    )
    expect(document.querySelector('.studio-action-notice__action')?.textContent).toBe('去配置')
    document.querySelector('.el-message__closeBtn')?.click()
    panel.unmount()
  })
  it.each([390, 820, 980])(
    '%dpx窗口选择任务后切入可键盘滚动的审阅区，返回队列不丢弃当前任务',
    async width => {
      window.innerWidth = width
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/', component: VideoUploadView }]
      })
      await router.push('/')
      const panel = mount(
        { template: '<router-view />' },
        {
          attachTo: document.body,
          global: {
            plugins: [ElementPlus, router],
            stubs: { VideoJobQueue: true, VideoReviewPanel: true }
          }
        }
      )
      await flushPromises()
      const queue = panel.getComponent({ name: 'VideoJobQueue' })
      const review = panel.get('.video-workspace__review')
      expect(review.attributes('tabindex')).toBe('0')
      expect(review.isVisible()).toBe(false)
      queue.vm.$emit('select', 'video-1')
      await flushPromises()
      expect(state.workspace.selectJob).toHaveBeenCalledWith('video-1')
      expect(review.isVisible()).toBe(true)
      expect(panel.get('.video-workspace__queue').isVisible()).toBe(false)
      await panel.get('[aria-label="返回视频队列"]').trigger('click')
      expect(panel.get('.video-workspace__queue').isVisible()).toBe(true)
      expect(review.isVisible()).toBe(false)
      panel.unmount()
    }
  )

  it('轮询更新版本保留审阅组件，切换任务身份才重建组件', async () => {
    state.workspace.jobs.value = [{ id: 'video-1', status: 'awaiting_review' }]
    state.workspace.selectedJob.value = state.workspace.jobs.value[0]
    state.workspace.selectedJobId.value = 'video-1'
    state.workspace.reviewDraft.value = { filename: '视频.mp4' }
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: VideoUploadView }]
    })
    await router.push('/')
    const panel = mount(
      { template: '<router-view />' },
      {
        global: {
          plugins: [ElementPlus, router],
          stubs: { VideoJobQueue: true, VideoReviewPanel: true }
        }
      }
    )
    await flushPromises()
    const original = panel.getComponent({ name: 'VideoReviewPanel' }).vm.$.uid
    state.workspace.selectedJob.value = { ...state.workspace.selectedJob.value, revision: 8 }
    await flushPromises()
    expect(panel.getComponent({ name: 'VideoReviewPanel' }).vm.$.uid).toBe(original)
    state.workspace.selectedJob.value = { id: 'video-2', status: 'awaiting_review' }
    await flushPromises()
    expect(panel.getComponent({ name: 'VideoReviewPanel' }).vm.$.uid).not.toBe(original)
    panel.unmount()
  })

  it('初始历史不提示，只提示本次发布状态转换；关闭后刷新不重新出现', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: VideoUploadView }]
    })
    await router.push('/')
    const panel = mount(
      { template: '<router-view />' },
      {
        global: {
          plugins: [ElementPlus, router],
          stubs: { VideoJobQueue: true, VideoReviewPanel: true }
        }
      }
    )
    await flushPromises()
    expect(panel.find('.video-workspace__published-notice').exists()).toBe(false)
    state.workspace.publications.value.push({ id: 'new', status: 'deploying', jobs: ['new-job'] })
    await flushPromises()
    state.workspace.publications.value = state.workspace.publications.value.map(item =>
      item.id === 'new' ? { ...item, status: 'published' } : item
    )
    await flushPromises()
    expect(panel.get('.video-workspace__published-notice').text()).toContain('1 个视频已发布')
    await panel.get('[aria-label="关闭发布完成提示"]').trigger('click')
    state.workspace.publications.value = state.workspace.publications.value.map(item => ({
      ...item
    }))
    await flushPromises()
    expect(panel.find('.video-workspace__published-notice').exists()).toBe(false)
    panel.unmount()
  })
})
