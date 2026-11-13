import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import UploadDropzone from './UploadDropzone.vue'

const state = vi.hoisted(() => ({ requireAiConfiguration: vi.fn() }))
vi.mock('@/composables/useAiConfigurationGuard', () => ({
  useAiConfigurationGuard: () => ({ requireAiConfiguration: state.requireAiConfiguration })
}))

let panel
beforeEach(() => {
  state.requireAiConfiguration.mockReset().mockReturnValue(false)
  panel = mount(UploadDropzone, { global: { stubs: { ElIcon: true } } })
})
afterEach(() => {
  panel.unmount()
  vi.restoreAllMocks()
})

describe('AI 图片添加入口', () => {
  it('缺少Key时选图和选文件夹都提示，阻止打开系统选择器', async () => {
    const inputs = panel.findAll('input')
    const filePicker = vi.spyOn(inputs[0].element, 'click')
    const folderPicker = vi.spyOn(inputs[1].element, 'click')
    const buttons = panel.findAll('button')
    await buttons[0].trigger('click')
    await buttons[1].trigger('click')
    expect(state.requireAiConfiguration).toHaveBeenCalledTimes(2)
    expect(filePicker).not.toHaveBeenCalled()
    expect(folderPicker).not.toHaveBeenCalled()
    state.requireAiConfiguration.mockReturnValue(true)
    await buttons[0].trigger('click')
    await buttons[1].trigger('click')
    expect(filePicker).toHaveBeenCalledOnce()
    expect(folderPicker).toHaveBeenCalledOnce()
  })

  it('拖放先检查Key，拒绝时不会读取目录或添加文件', async () => {
    const readEntry = vi.fn()
    const file = new globalThis.File(['image'], 'sample.png', { type: 'image/png' })
    await panel.get('.upload-dropzone__area').trigger('drop', {
      dataTransfer: { items: [{ webkitGetAsEntry: readEntry }], files: [file] }
    })
    expect(state.requireAiConfiguration).toHaveBeenCalledOnce()
    expect(readEntry).not.toHaveBeenCalled()
    expect(panel.emitted('add-files')).toBeUndefined()
    state.requireAiConfiguration.mockReturnValue(true)
    await panel.get('.upload-dropzone__area').trigger('drop', {
      dataTransfer: { items: [], files: [file] }
    })
    expect(panel.emitted('add-files')).toEqual([[[file]]])
  })

  it('选择器打开后配置被清除，返回文件仍被拒绝且输入会复位', async () => {
    const input = panel.findAll('input')[0]
    Object.defineProperty(input.element, 'files', {
      value: [new globalThis.File(['image'], 'sample.png', { type: 'image/png' })]
    })
    await input.trigger('change')
    expect(state.requireAiConfiguration).toHaveBeenCalledOnce()
    expect(panel.emitted('add-files')).toBeUndefined()
    expect(input.element.value).toBe('')
  })

  it('上传期间按钮禁用，拖放不触发配置提示或添加', async () => {
    await panel.setProps({ uploading: true })
    expect(
      panel.findAll('button').every(button => button.attributes('disabled') !== undefined)
    ).toBe(true)
    await panel.get('.upload-dropzone__area').trigger('drop', {
      dataTransfer: { items: [], files: [] }
    })
    expect(state.requireAiConfiguration).not.toHaveBeenCalled()
    expect(panel.emitted('add-files')).toBeUndefined()
  })
})
