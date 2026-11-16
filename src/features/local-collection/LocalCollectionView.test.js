import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus, { ElMessageBox } from 'element-plus'
import LocalCollectionView from './LocalCollectionView.vue'

const state = vi.hoisted(() => ({ api: {}, requireAi: vi.fn(), flush: vi.fn() }))
vi.mock('@/components/MainLayout.vue', () => ({ default: { template: '<main><slot /></main>' } }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ token: 'test-token' }) }))
vi.mock('@/composables/useAiConfigurationGuard', () => ({
  useAiConfigurationGuard: () => ({ requireAiConfiguration: state.requireAi })
}))
vi.mock('./api', () => ({ createCollectorApi: () => state.api }))
vi.mock('./receipts', () => ({ flushCollectorReceipts: (...args) => state.flush(...args) }))

let wrapper
let router
let batch
beforeEach(() => {
  batch = {
    id: 'batch-1',
    name: '桌面素材',
    platform: 'wp',
    source: 'nature',
    status: 'ready',
    series: 'desktop',
    count: 2,
    items: [],
    studio: { verifiedCount: 0, readyToClean: false, autoCleanup: false }
  }
  state.api = {
    health: vi
      .fn()
      .mockResolvedValue({ ok: true, collectorId: 'local', outputRoot: '/local/wallpapers' }),
    platforms: vi.fn().mockResolvedValue({ platforms: [{ id: 'wp', label: '壁纸平台' }] }),
    sources: vi.fn().mockResolvedValue({ sources: [{ id: 'nature', label: '自然风景' }] }),
    status: vi.fn().mockResolvedValue({ running: false, outcome: 'idle', stats: {}, logs: [] }),
    batches: vi
      .fn()
      .mockImplementation(async () => ({ batches: [globalThis.structuredClone(batch)] })),
    files: vi.fn().mockResolvedValue({ files: [], total: 0, nextOffset: 0, hasMore: false }),
    runs: vi.fn().mockResolvedValue({ runs: [] }),
    start: vi.fn().mockResolvedValue({ ok: true }),
    stop: vi.fn().mockResolvedValue({ ok: true }),
    createBatch: vi.fn().mockResolvedValue({ ok: true }),
    clean: vi.fn().mockResolvedValue({ ok: true }),
    batch: vi.fn(async () => ({ batch: globalThis.structuredClone(batch) })),
    deleteItems: vi.fn(),
    thumbnailUrl: () => '/thumbnail',
    imageUrl: () => '/image'
  }
  state.requireAi.mockReset().mockReturnValue(true)
  state.flush.mockReset().mockResolvedValue({ pending: 0, synced: 0, errors: [] })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})
const paginationBatchStub = {
  props: ['batches'],
  template:
    '<div><article v-for="batch in batches" :key="batch.id" :data-batch-id="batch.id">{{ batch.name }}</article></div>'
}
async function render({ paginationOnly = false } = {}) {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: LocalCollectionView },
      { path: '/upload', component: { template: '<div>上传页面</div>' } }
    ]
  })
  await router.push('/')
  wrapper = mount(LocalCollectionView, {
    attachTo: document.body,
    global: {
      plugins: [ElementPlus, router],
      stubs: paginationOnly ? { CollectionBatches: paginationBatchStub } : {}
    }
  })
  await flushPromises()
  return wrapper
}
function button(label) {
  return wrapper.findAll('button').find(item => item.text() === label)
}

describe('本地采集工作区', () => {
  it('点击批次打开图片预览，删除后列表数量立即更新', async () => {
    batch.items = [{ sourceItemId: 'a', filename: '山川.jpg', sha256: 'a'.repeat(64) }]
    batch.count = 1
    await render()
    await button('查看图片').trigger('click')
    await flushPromises()
    expect(state.api.batch).toHaveBeenCalledWith('batch-1')
    const dialog = wrapper.getComponent({ name: 'BatchImagesDialog' })
    expect(dialog.props('modelValue')).toBe(true)
    expect(dialog.props('collectorId')).toBe('local')
    batch = { ...batch, count: 0, items: [] }
    dialog.vm.$emit('updated', batch)
    await flushPromises()
    expect(wrapper.get('[data-batch-id="batch-1"]').text()).toContain('本地现有 0 张')
  })

  it('读取全局待上传批次，不以部分核验限制手动清理', async () => {
    await render()
    expect(state.api.batches).toHaveBeenCalledWith({ offset: 0, limit: 100 })
    expect(wrapper.find('[data-batch-id="batch-1"]').exists()).toBe(true)
    expect(button('清理本地').attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).not.toContain('部分图片已核验')
    expect(wrapper.text()).toContain('保留的图片和元数据上传成功即自动清理整批')
    expect(wrapper.find('select').exists()).toBe(false)
  })

  it('缺少 AI 配置先提示，配置就绪后通过批次 ID 进入上传页', async () => {
    await render()
    state.requireAi.mockReturnValue(false)
    await button('送到图片上传').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
    expect(state.requireAi).toHaveBeenCalledOnce()
    state.requireAi.mockReturnValue(true)
    await button('送到图片上传').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/upload?localBatch=batch-1')
  })

  it('无上传回执也可手动整批清理，取消不执行，确认不要求token', async () => {
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    await render()
    await button('清理本地').trigger('click')
    await flushPromises()
    expect(state.api.clean).not.toHaveBeenCalled()
    expect(confirm.mock.calls[0][0]).toContain('包括未上传及从上传列表移除的图片')
    expect(confirm.mock.calls[0][0]).toContain('源记录与上传关联会保留')
    confirm.mockResolvedValue('confirm')
    await button('清理本地').trigger('click')
    await flushPromises()
    expect(state.api.clean).toHaveBeenCalledExactlyOnceWith({ batchId: 'batch-1', confirmed: true })
  })

  it('导入批次展示整批自动清理说明，不再提供核验开关', async () => {
    batch.studio.importedAt = '2026-11-16T00:00:00Z'
    batch.studio.verifiedCount = 1
    batch.studio.discardedCount = 1
    await render()
    expect(wrapper.text()).toContain('保留的图片上传成功后自动清理本批')
    expect(wrapper.text()).toContain('本地现有 2 张')
    expect(wrapper.text()).not.toContain('不保留 1 张')
    expect(wrapper.find('[aria-label="桌面素材 核验后自动清理"]').exists()).toBe(false)
    expect(button('清理本地').attributes('disabled')).toBeUndefined()
  })

  it('回执失败持续展示可重试消息，重试成功后清除提示', async () => {
    state.flush.mockResolvedValueOnce({ pending: 1, synced: 0, errors: ['远端暂不可用'] })
    await render()
    expect(wrapper.text()).toContain('远端暂不可用')
    await button('同步上传状态').trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain('远端暂不可用')
    expect(state.flush).toHaveBeenCalledTimes(2)
  })

  it('连接失败保留重连入口，重连成功后恢复批次', async () => {
    state.api.health.mockRejectedValueOnce(new Error('本地服务未启动'))
    await render()
    expect(wrapper.text()).toContain('本地服务未启动')
    await button('重新连接').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('本机已连接')
    expect(wrapper.find('[data-batch-id="batch-1"]').exists()).toBe(true)
  })

  it('回执因采集目录或登录不匹配而保留时，不误报同步完成', async () => {
    state.flush.mockResolvedValue({ pending: 2, synced: 0, errors: [] })
    await render()
    expect(wrapper.text()).toContain('还有 2 条上传记录待同步')
    expect(wrapper.text()).toContain('当前 GitHub 登录及本机采集目录')
  })

  it('120个批次可分页加载，刷新保留已加载范围并显示全局数量', async () => {
    const all = Array.from({ length: 120 }, (_, index) => ({
      ...batch,
      id: `batch-${index}`,
      name: `素材 ${index}`
    }))
    state.api.batches.mockImplementation(async ({ offset = 0, limit = 100 } = {}) => ({
      batches: all.slice(offset, offset + limit),
      nextOffset: Math.min(offset + limit, all.length),
      hasMore: offset + limit < all.length,
      total: 120,
      activeCount: 120,
      historyCount: 0
    }))
    await render({ paginationOnly: true })
    expect(wrapper.findAll('[data-batch-id]')).toHaveLength(100)
    expect(wrapper.get('#collection-tab-batches').text()).toContain('120')
    await button('加载更多批次').trigger('click')
    await flushPromises()
    expect(state.api.batches).toHaveBeenCalledWith({ offset: 100, limit: 100 })
    expect(wrapper.findAll('[data-batch-id]')).toHaveLength(120)
    await button('同步上传状态').trigger('click')
    await flushPromises()
    expect(state.api.batches).toHaveBeenLastCalledWith({ offset: 0, limit: 120 })
    expect(wrapper.findAll('[data-batch-id]')).toHaveLength(120)
  })

  it('历史视图可以继续加载落在下一页的历史批次', async () => {
    const all = Array.from({ length: 120 }, (_, index) => ({
      ...batch,
      id: `batch-${index}`,
      status: index < 100 ? 'ready' : 'completed'
    }))
    state.api.batches.mockImplementation(async ({ offset = 0, limit = 100 } = {}) => ({
      batches: all.slice(offset, offset + limit),
      nextOffset: Math.min(offset + limit, all.length),
      hasMore: offset + limit < all.length,
      total: 120,
      activeCount: 100,
      historyCount: 20
    }))
    await render({ paginationOnly: true })
    await wrapper.get('#collection-tab-history').trigger('click')
    expect(wrapper.get('#collection-tab-history').text()).toContain('20')
    await button('加载更多批次').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-batch-id]')).toHaveLength(20)
    expect(button('加载更多批次')).toBeUndefined()
  })

  it('发送采集参数不传入任意输出路径', async () => {
    await render()
    await wrapper.get('.collection-controls .el-form').trigger('submit')
    await flushPromises()
    expect(state.api.start).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'wp',
        source: 'nature',
        startPage: 1,
        pages: 3,
        series: ['desktop', 'mobile', 'avatar'],
        autoBatch: expect.objectContaining({ enabled: true, size: 30 })
      })
    )
    expect(state.api.start.mock.calls[0][0]).not.toHaveProperty('outputRoot')
  })
})
