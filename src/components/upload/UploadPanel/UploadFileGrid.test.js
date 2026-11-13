import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import UploadFileGrid from './UploadFileGrid.vue'

let wrapper
afterEach(() => {
  wrapper?.unmount()
  vi.useRealTimers()
})

describe('上传网格离场', () => {
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
