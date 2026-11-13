import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus from 'element-plus'
import VideoUploadView from './VideoUploadView.vue'

const state = vi.hoisted(() => ({ workspace: null, transfers: null }))
vi.mock('@/components/MainLayout.vue', () => ({ default: { template: '<main><slot /></main>' } }))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ canUpload: true, permissionChecked: true, user: { login: 'tester' } })
}))
vi.mock('@/stores/config', () => ({
  useConfigStore: () => ({ isConfigured: false, config: { videoApiUrl: 'http://video.test' } })
}))
vi.mock('@/stores/credentials', () => ({
  useCredentialsStore: () => ({
    hasCredentials: false,
    hasModelReady: false,
    selectedModel: '',
    getCredentialsByProvider: () => ({ apiKey: '', model: '' }),
    loadCredentials: vi.fn()
  })
}))
vi.mock('@/services/ai/classifier', () => ({
  analyzeImage: vi.fn(),
  CLASSIFIER_CONFIG: { defaultModel: 'sub2api-gpt-6.1-sol' }
}))
vi.mock('@/features/video-ingest/api', () => ({ createVideoApi: () => ({ configured: true }) }))
vi.mock('@/features/video-ingest/uploader', () => ({
  createVideoUploader: () => ({ upload: vi.fn() })
}))
vi.mock('@/features/video-ingest/workspace', async importOriginal => ({
  ...(await importOriginal()),
  createVideoWorkspace: () => state.workspace
}))
vi.mock('@/features/video-ingest/upload-manager', () => ({
  createVideoUploadManager: () => ({
    transfers: state.transfers,
    hasActiveTransfers: ref(false),
    canRetry: () => false,
    dispose: vi.fn()
  })
}))

beforeEach(() => {
  window.innerWidth = 1440
  state.transfers = ref([])
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

let transitionPanel
afterEach(() => {
  transitionPanel?.unmount()
  transitionPanel = undefined
  vi.useRealTimers()
})

async function mountTransitionPanel() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: VideoUploadView }]
  })
  await router.push('/')
  transitionPanel = mount(
    { template: '<router-view />' },
    {
      attachTo: document.body,
      global: {
        plugins: [ElementPlus, router],
        stubs: {
          transition: false,
          'transition-group': false,
          VideoJobQueue: true,
          VideoReviewPanel: {
            name: 'VideoReviewPanel',
            props: ['job'],
            template: '<section class="review-content" :data-job-id="job.id">{{ job.id }}</section>'
          }
        }
      }
    }
  )
  await flushPromises()
  return transitionPanel
}

function prepareReview() {
  state.workspace.jobs.value = [
    { id: 'first', status: 'awaiting_review' },
    { id: 'second', status: 'awaiting_review' }
  ]
  state.workspace.selectedJob.value = state.workspace.jobs.value[0]
  state.workspace.selectedJobId.value = 'first'
  state.workspace.reviewDraft.value = { filename: '视频.mp4' }
  state.workspace.selectJob.mockImplementation(id => {
    state.workspace.selectedJob.value = state.workspace.jobs.value.find(job => job.id === id)
    state.workspace.selectedJobId.value = id
  })
}

describe('视频工作区真实过渡', () => {
  it('切换任务保留旧面板滚动至退场结束，新面板入场才归顶', async () => {
    prepareReview()
    const panel = await mountTransitionPanel()
    const scroller = panel.get('.video-workspace__review').element
    scroller.scrollTop = 280
    vi.useFakeTimers()
    panel.getComponent({ name: 'VideoJobQueue' }).vm.$emit('select', 'second')
    await nextTick()
    await nextTick()
    expect(panel.get('[data-job-id="first"]').classes()).toContain('studio-panel-leave-active')
    expect(scroller.scrollTop).toBe(280)
    await vi.runAllTimersAsync()
    expect(panel.find('[data-job-id="first"]').exists()).toBe(false)
    expect(panel.find('[data-job-id="second"]').exists()).toBe(true)
    expect(scroller.scrollTop).toBe(0)
    expect(document.activeElement).toBe(scroller)
  })

  it('版本更新和再次点击同一任务保留滚动，自动切换任务在入场时归顶', async () => {
    prepareReview()
    const panel = await mountTransitionPanel()
    const scroller = panel.get('.video-workspace__review').element
    scroller.scrollTop = 260
    state.workspace.selectedJob.value = { ...state.workspace.selectedJob.value, revision: 5 }
    await nextTick()
    panel.getComponent({ name: 'VideoJobQueue' }).vm.$emit('select', 'first')
    await nextTick()
    await nextTick()
    expect(scroller.scrollTop).toBe(260)
    vi.useFakeTimers()
    state.workspace.jobs.value[0].status = 'published'
    state.workspace.selectedJob.value = state.workspace.jobs.value[0]
    await nextTick()
    expect(scroller.scrollTop).toBe(260)
    await vi.runAllTimersAsync()
    expect(panel.get('.review-content').attributes('data-job-id')).toBe('second')
    expect(scroller.scrollTop).toBe(0)
  })

  it('上传完成的进度项从原始内边距位置离场并恢复临时样式', async () => {
    state.transfers.value = [
      { id: 'first', filename: 'first.mp4', stage: 'uploading', percent: 40 },
      { id: 'second', filename: 'second.mp4', stage: 'uploading', percent: 20 }
    ]
    const panel = await mountTransitionPanel()
    const leaving = panel.findAll('.video-workspace__transfer')[1].element
    Object.defineProperties(leaving, {
      offsetLeft: { value: 16 },
      offsetTop: { value: 88 },
      offsetWidth: { value: 300 },
      offsetHeight: { value: 62 }
    })
    vi.useFakeTimers()
    state.transfers.value = [state.transfers.value[0]]
    await nextTick()
    expect(leaving.style.position).toBe('absolute')
    expect(leaving.style.left).toBe('16px')
    expect(leaving.style.top).toBe('88px')
    expect(leaving.style.width).toBe('300px')
    expect(leaving.style.height).toBe('62px')
    expect(leaving.style.right).toBe('auto')
    await vi.runAllTimersAsync()
    expect(leaving.style.position).toBe('')
    expect(leaving.style.width).toBe('')
    expect(panel.findAll('.video-workspace__transfer')).toHaveLength(1)
  })
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
})
