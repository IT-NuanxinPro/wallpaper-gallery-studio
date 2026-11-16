import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import { reactive } from 'vue'
import ElementPlus from 'element-plus'
import LocalCollectionStatus from './LocalCollectionStatus.vue'
const state = vi.hoisted(() => ({ upload: null, route: null, importing: vi.fn() }))
vi.mock('vue-router', () => ({ useRoute: () => state.route }))
vi.mock('@/stores/upload', () => ({ useUploadStore: () => state.upload }))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ permissionChecked: true, canUpload: true, token: 'test' })
}))
vi.mock('@/stores/config', () => ({
  useConfigStore: () => ({ config: { owner: 'a', repo: 'b', branch: 'main' } })
}))
vi.mock('@/stores/credentials', () => ({ useCredentialsStore: () => ({ hasModelReady: true }) }))
vi.mock('@/composables/useAiConfigurationGuard', () => ({
  useAiConfigurationGuard: () => ({ requireAiConfiguration: () => true })
}))
vi.mock('./importer', () => ({ importCollectorBatch: (...args) => state.importing(...args) }))
vi.mock('./receipts', () => ({ flushCollectorReceipts: vi.fn() }))
let panel
afterEach(() => panel?.unmount())
describe('本地导入提示', () => {
  it('导入成功自动收起，可展开和关闭；新错误重新显示而不重复导入', async () => {
    state.route = reactive({ query: { localBatch: 'batch' } })
    state.upload = reactive({
      files: [{ localSource: { batchId: 'batch' } }],
      series: 'desktop',
      localReceiptError: '',
      localReceiptStatus: ''
    })
    state.importing.mockResolvedValue({ added: 1, skipped: 0 })
    panel = mount(LocalCollectionStatus, {
      attachTo: document.body,
      global: {
        plugins: [ElementPlus],
        stubs: {
          RouterLink: RouterLinkStub,
          ElCollapseTransition: { template: '<div><slot /></div>' }
        }
      }
    })
    await flushPromises()
    expect(panel.find('[aria-label="展开导入提示"]').exists()).toBe(true)
    await panel.get('[aria-label="展开导入提示"]').trigger('click')
    expect(panel.text()).toContain('从列表移除会删除')
    await panel.get('[aria-label="关闭导入提示"]').trigger('click')
    expect(panel.get('.local-import').isVisible()).toBe(false)
    expect(state.upload.files).toHaveLength(1)
    state.upload.localReceiptError = '回传失败'
    await flushPromises()
    expect(panel.get('.local-import').isVisible()).toBe(true)
    expect(panel.get('[role="alert"]').text()).toBe('回传失败')
    expect(state.importing).toHaveBeenCalledTimes(1)
  })
  it('导入过程中关闭提示不取消任务，结果继续进入上传列表', async () => {
    let finish
    state.route = reactive({ query: { localBatch: 'second' } })
    state.upload = reactive({
      files: [],
      series: 'desktop',
      localReceiptError: '',
      localReceiptStatus: ''
    })
    state.importing.mockImplementation(
      (id, options) =>
        new Promise(resolve => {
          finish = () => {
            expect(options.signal.aborted).toBe(false)
            resolve({ added: 0, skipped: 0 })
          }
        })
    )
    panel = mount(LocalCollectionStatus, {
      attachTo: document.body,
      global: {
        plugins: [ElementPlus],
        stubs: {
          RouterLink: RouterLinkStub,
          ElCollapseTransition: { template: '<div><slot /></div>' }
        }
      }
    })
    await panel.get('[aria-label="关闭导入提示"]').trigger('click')
    finish()
    await flushPromises()
    expect(panel.get('.local-import').isVisible()).toBe(false)
    expect(panel.emitted('series')).toEqual([['desktop']])
  })
})
