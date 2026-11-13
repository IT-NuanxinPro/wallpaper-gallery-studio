import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { reactive } from 'vue'
import ElementPlus from 'element-plus'
import AIAssistantPanel from './AIAssistantPanel.vue'
import UploadHeader from '../upload/UploadPanel/UploadHeader.vue'

const state = vi.hoisted(() => ({ credentials: null, ai: null, requireAiConfiguration: vi.fn() }))
vi.mock('@/composables/useAiConfigurationGuard', () => ({
  useAiConfigurationGuard: () => ({ requireAiConfiguration: state.requireAiConfiguration })
}))
vi.mock('@/stores/credentials', () => ({ useCredentialsStore: () => state.credentials }))
vi.mock('@/stores/ai', () => ({ useAIStore: () => state.ai }))
vi.mock('./PromptTemplateSelector.vue', () => ({ default: { template: '<div />' } }))
vi.mock('./ResultCard.vue', () => ({ default: { template: '<div />' } }))
vi.mock('gsap', () => ({
  gsap: {
    set: vi.fn(),
    killTweensOf: vi.fn(),
    timeline: () => ({ fromTo: vi.fn(), to: vi.fn(), kill: vi.fn() })
  }
}))

beforeEach(() => {
  state.credentials = reactive({
    hasCredentials: false,
    hasModelReady: false,
    selectedModel: '',
    loadCredentials: vi.fn()
  })
  state.requireAiConfiguration.mockReset().mockImplementation(() => state.credentials.hasModelReady)
  state.ai = reactive({
    currentProvider: 'sub2api',
    currentModel: 'vision-custom',
    promptTemplate: '',
    hasResults: false,
    analyzing: false,
    error: '',
    setProvider: vi.fn(),
    analyzeImage: vi.fn(),
    clearResults: vi.fn()
  })
})

const global = {
  plugins: [ElementPlus],
  stubs: { RouterLink: RouterLinkStub, PromptTemplateSelector: true, ResultCard: true }
}

describe('三个入口共用已选远程模型', () => {
  it('图片上传只有AI链路，缺少Key点击上传会提示而不发出上传事件', async () => {
    const panel = mount(UploadHeader, { global })
    expect(panel.text()).toContain('未选择模型')
    expect(panel.text()).not.toContain('手动上传')
    expect(panel.find('.upload-header__mode-switch').exists()).toBe(false)
    expect(panel.getComponent(RouterLinkStub).props('to')).toBe('/settings#ai-config')
    expect(panel.get('.upload-header__btn-upload').attributes('disabled')).toBeUndefined()
    await panel.get('.upload-header__btn-upload').trigger('click')
    expect(state.requireAiConfiguration).toHaveBeenCalledOnce()
    expect(panel.emitted('upload')).toBeUndefined()
    Object.assign(state.credentials, {
      hasCredentials: true,
      hasModelReady: true,
      selectedModel: 'vision-custom'
    })
    await flushPromises()
    expect(panel.text()).toContain('vision-custom')
    await panel.get('.upload-header__btn-upload').trigger('click')
    expect(panel.emitted('upload')).toHaveLength(1)
    panel.unmount()
  })

  it('空列表缺少Key也可点击上传获得配置提示，忙碌时仍不可重复触发', async () => {
    const panel = mount(UploadHeader, { global })
    await panel.get('.upload-header__btn-upload').trigger('click')
    expect(state.requireAiConfiguration).toHaveBeenCalledOnce()
    await panel.setProps({ uploading: true })
    expect(panel.get('.upload-header__btn-upload').attributes('disabled')).toBeDefined()
    panel.unmount()
  })

  it('工坊选图与分析即时检查Key，配置被清除后点击分析会提示且不会发请求', async () => {
    const panel = mount(AIAssistantPanel, { global })
    await flushPromises()
    expect(panel.text()).toContain('未选择模型')
    await panel.get('.upload-area').trigger('click')
    expect(state.requireAiConfiguration).toHaveBeenCalledOnce()
    expect(panel.find('.analyze-btn').exists()).toBe(false)
    Object.assign(state.credentials, {
      hasCredentials: true,
      hasModelReady: true,
      selectedModel: 'vision-custom'
    })
    panel.getComponent({ name: 'ElUpload' }).props('onChange')({}, [{ name: 'test.png' }])
    await flushPromises()
    Object.assign(state.credentials, {
      hasCredentials: false,
      hasModelReady: false,
      selectedModel: ''
    })
    await flushPromises()
    expect(panel.get('.analyze-btn').attributes('disabled')).toBeUndefined()
    await panel.get('.analyze-btn').trigger('click')
    expect(state.ai.analyzeImage).not.toHaveBeenCalled()
    expect(state.requireAiConfiguration).toHaveBeenCalledTimes(3)
    Object.assign(state.credentials, {
      hasCredentials: true,
      hasModelReady: true,
      selectedModel: 'vision-custom'
    })
    await panel.get('.analyze-btn').trigger('click')
    expect(state.ai.analyzeImage).toHaveBeenCalledOnce()
    panel.unmount()
  })
})
