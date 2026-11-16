import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'
import BatchImagesDialog from './BatchImagesDialog.vue'

const state = vi.hoisted(() => ({ api: {} }))
vi.mock('./api', () => ({ createCollectorApi: () => state.api }))
let panel
const initial = () => ({
  id: 'batch',
  name: '今天的壁纸',
  directory: 'upload-batches/today/desktop',
  count: 2,
  items: [
    { sourceItemId: 'a', filename: '山川.jpg', sha256: 'a'.repeat(64) },
    { sourceItemId: 'b', filename: '海面.jpg', sha256: 'b'.repeat(64) }
  ]
})
beforeEach(() => {
  state.api = {
    batch: vi.fn(async () => ({ batch: initial() })),
    deleteItems: vi.fn(async () => ({ ok: true, batch: { ...initial(), items: [], count: 0 } })),
    imageUrl: ({ itemId }) => '/image/' + itemId,
    thumbnailUrl: ({ itemId }) => '/thumbnail/' + itemId
  }
})
afterEach(() => {
  panel?.unmount()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})
async function render() {
  panel = mount(BatchImagesDialog, {
    props: { modelValue: true, batch: initial(), collectorId: 'local' },
    global: {
      plugins: [ElementPlus],
      stubs: {
        ElDialog: { template: '<div><slot name="header" /><slot /><slot name="footer" /></div>' }
      }
    }
  })
  await flushPromises()
}
describe('批次图片预览与删除', () => {
  it('父页面轮询移除图片时保留弹窗并清除失效选择', async () => {
    await render()
    await panel.get('[aria-label="选择 山川.jpg"] input').setValue(true)
    await panel.setProps({ batch: { ...initial(), count: 1, items: [initial().items[1]] } })
    expect(panel.findAll('[data-item-id]')).toHaveLength(1)
    expect(panel.text()).toContain('本地 1 张 · 已选 0 张')
    expect(panel.get('[data-testid="delete-selected"]').attributes('disabled')).toBeDefined()
  })

  it('打开读取实际存活清单，可看原图，不显示已删除状态栏', async () => {
    await render()
    expect(state.api.batch).toHaveBeenCalledExactlyOnceWith('batch')
    expect(panel.findAll('[data-item-id]')).toHaveLength(2)
    expect(panel.findComponent({ name: 'ElImage' }).props('previewSrcList')).toEqual([
      '/image/a',
      '/image/b'
    ])
    expect(panel.text()).toContain('本地 2 张')
    expect(panel.text()).not.toContain('不保留')
  })
  it('多选删除需要明确确认，取消不请求；删除完成立即移除图片和选择', async () => {
    await render()
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    await panel.get('[aria-label="选择 山川.jpg"] input').setValue(true)
    await panel.get('[aria-label="选择 海面.jpg"] input').setValue(true)
    await panel.get('[data-testid="delete-selected"]').trigger('click')
    await flushPromises()
    expect(state.api.deleteItems).not.toHaveBeenCalled()
    expect(confirm.mock.calls[0][0]).toContain('永久删除')
    confirm.mockResolvedValue('confirm')
    await panel.get('[data-testid="delete-selected"]').trigger('click')
    await flushPromises()
    expect(state.api.deleteItems).toHaveBeenCalledExactlyOnceWith({
      batchId: 'batch',
      collectorId: 'local',
      items: ['a', 'b'],
      confirmed: true
    })
    expect(panel.findAll('[data-item-id]')).toHaveLength(0)
    expect(panel.text()).toContain('这个批次已没有本地图片')
    expect(panel.emitted('updated')[0][0].count).toBe(0)
  })
  it('单图删除只提交该图片，刷新后清除失效选择', async () => {
    await render()
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm')
    state.api.deleteItems.mockResolvedValue({
      ok: true,
      batch: { ...initial(), count: 1, items: [initial().items[1]] }
    })
    await panel.get('[aria-label="删除 山川.jpg"]').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledOnce()
    expect(state.api.deleteItems.mock.calls[0][0].items).toEqual(['a'])
    expect(panel.findAll('[data-item-id]')).toHaveLength(1)
    await panel.get('[aria-label="选择 海面.jpg"] input').setValue(true)
    state.api.batch.mockResolvedValue({ batch: { ...initial(), count: 0, items: [] } })
    await panel.get('[aria-label="刷新批次图片"]').trigger('click')
    await flushPromises()
    expect(panel.get('[data-testid="delete-selected"]').attributes('disabled')).toBeDefined()
  })
})
