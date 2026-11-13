import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import UploadFileGrid from './UploadFileGrid.vue'

let wrapper
afterEach(() => {
  wrapper?.unmount()
  vi.useRealTimers()
})

describe('上传网格离场', () => {
  it('空态与文件网格互换时外层收到真实离场类，父面板可保持新列表原位', async () => {
    wrapper = mount(UploadFileGrid, {
      props: { files: [] },
      global: {
        stubs: {
          transition: false,
          'transition-group': false,
          ElCheckbox: true,
          ElIcon: true,
          UploadFileItem: { props: ['file'], template: '<div>{{ file.id }}</div>' }
        }
      }
    })
    const host = wrapper.element.parentElement
    vi.useFakeTimers()
    await wrapper.setProps({ files: [{ id: 'first', status: 'pending' }] })
    expect(host.querySelector('.upload-file-grid__empty.studio-panel-leave-active')).not.toBeNull()
    expect(wrapper.find('.upload-file-grid').exists()).toBe(true)
    await vi.runAllTimersAsync()
    await wrapper.setProps({ files: [] })
    expect(host.querySelector('.upload-file-grid.studio-panel-leave-active')).not.toBeNull()
    expect(wrapper.find('.upload-file-grid__empty').exists()).toBe(true)
    await vi.runAllTimersAsync()
    expect(wrapper.find('.upload-file-grid').exists()).toBe(false)
  })

  it('删除非首列卡片时从原位置退出，并在退出完成后清理临时定位', async () => {
    vi.useFakeTimers()
    const files = ['first', 'second', 'third'].map(id => ({ id, status: 'pending' }))
    wrapper = mount(UploadFileGrid, {
      props: { files },
      global: {
        stubs: {
          transition: false,
          'transition-group': false,
          ElCheckbox: true,
          ElIcon: true,
          UploadFileItem: {
            props: ['file'],
            template: '<div class="upload-file-item" :data-id="file.id">{{ file.id }}</div>'
          }
        }
      }
    })
    const leaving = wrapper.get('[data-id="second"]').element
    Object.defineProperties(leaving, {
      offsetLeft: { value: 184 },
      offsetTop: { value: 20 },
      offsetWidth: { value: 156 },
      offsetHeight: { value: 156 }
    })

    await wrapper.setProps({ files: [files[0], files[2]] })

    expect(leaving.style.position).toBe('absolute')
    expect(leaving.style.left).toBe('184px')
    expect(leaving.style.top).toBe('20px')
    expect(leaving.style.width).toBe('156px')
    expect(leaving.style.height).toBe('156px')
    expect(leaving.style.right).toBe('auto')
    await vi.runAllTimersAsync()
    expect(leaving.style.position).toBe('')
    expect(leaving.style.left).toBe('')
    expect(wrapper.find('[data-id="second"]').exists()).toBe(false)
    expect(wrapper.findAll('.upload-file-item').map(item => item.attributes('data-id'))).toEqual([
      'first',
      'third'
    ])
  })
})
