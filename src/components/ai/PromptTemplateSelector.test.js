import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PromptTemplateSelector from './PromptTemplateSelector.vue'
import { getUploadCategoryTree } from '@/services/upload/category-directory'

vi.mock('@/services/upload/category-directory', () => ({ getUploadCategoryTree: vi.fn() }))

let wrapper
const tree = {
  desktop: { secondary: ['科技'], third: { 科技: ['机器人'] } },
  mobile: { secondary: ['游戏'], third: { 游戏: ['新游戏'] } }
}

beforeEach(() => {
  vi.clearAllMocks()
  getUploadCategoryTree.mockResolvedValue(tree)
  wrapper = mount(PromptTemplateSelector, {
    props: { modelValue: 'default', primaryCategory: 'desktop', provider: 'sub2api' },
    global: { plugins: [ElementPlus] }
  })
})

afterEach(() => wrapper.unmount())

describe('提示词预览', () => {
  it('展开时加载最新分类，切换系列和 Provider 后更新，刷新按钮强制重读', async () => {
    expect(getUploadCategoryTree).not.toHaveBeenCalled()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.get('pre').text()).toContain('科技：机器人')
    await wrapper.setProps({ primaryCategory: 'mobile', provider: 'cloudflare' })
    await flushPromises()
    expect(wrapper.get('pre').text()).toContain('游戏：新游戏')
    expect(wrapper.get('pre').text()).toContain('供上传归档读取的结构化结果')
    await wrapper
      .findAll('button')
      .find(button => button.text().includes('刷新分类'))
      .trigger('click')
    await flushPromises()
    expect(getUploadCategoryTree).toHaveBeenLastCalledWith({ force: true })
  })

  it('快速切换系列后，旧预览请求不能覆盖新结果', async () => {
    let finishOld
    getUploadCategoryTree.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finishOld = resolve
        })
    )
    await wrapper.get('button').trigger('click')
    await wrapper.setProps({ primaryCategory: 'mobile' })
    await flushPromises()
    finishOld(tree)
    await flushPromises()
    expect(wrapper.get('pre').text()).toContain('游戏：新游戏')
    expect(wrapper.get('pre').text()).not.toContain('科技：机器人')
  })

  it('自定义动态变量提示以文本显示，预览会展开成远程分类', async () => {
    await wrapper.setProps({
      modelValue: 'custom',
      customPrompt: '按 {{secondaryList}} / {{thirdHints}} 分类'
    })
    expect(wrapper.text()).toContain('{{thirdHints}}')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.get('pre').text()).toContain('科技：机器人')
    expect(wrapper.get('pre').text()).not.toContain('{{thirdHints}}')
  })
})
