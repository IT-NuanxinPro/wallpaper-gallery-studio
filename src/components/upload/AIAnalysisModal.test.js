import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { reactive } from 'vue'
import ElementPlus from 'element-plus'
import AIAnalysisModal from './AIAnalysisModal.vue'

const state = vi.hoisted(() => ({
  credentials: null,
  analyzeImage: vi.fn(),
  requireAiConfiguration: vi.fn()
}))
vi.mock('@/composables/useAiConfigurationGuard', () => ({
  useAiConfigurationGuard: () => ({ requireAiConfiguration: state.requireAiConfiguration })
}))
vi.mock('@/stores/credentials', () => ({ useCredentialsStore: () => state.credentials }))
vi.mock('@/services/ai/classifier', () => ({ analyzeImage: state.analyzeImage }))

beforeEach(() => {
  state.analyzeImage.mockReset()
  state.requireAiConfiguration
    .mockReset()
    .mockImplementation(() => state.credentials.hasCredentials)
  state.credentials = reactive({
    hasCredentials: false,
    getCredentialsByProvider: vi.fn(() => ({
      apiKey: 'session-key',
      baseUrl: 'https://api.test/v1'
    }))
  })
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})

const global = {
  plugins: [ElementPlus],
  stubs: {
    RouterLink: RouterLinkStub,
    ElDialog: { template: '<div><slot /><slot name="footer" /></div>' }
  }
}

describe('图片分析弹窗共用配置', () => {
  it('缺少 Key 时引导同标签设置且不调用分析', async () => {
    const panel = mount(AIAnalysisModal, {
      props: {
        modelValue: true,
        file: new globalThis.File(['x'], 'test.png', { type: 'image/png' })
      },
      global
    })
    await flushPromises()
    expect(panel.text()).toContain('GPT-6.1 Sol')
    expect(panel.getComponent(RouterLinkStub).props('to')).toBe('/settings#ai-config')
    expect(state.analyzeImage).not.toHaveBeenCalled()
    panel.unmount()
  })

  it('失败后Key被清除，重新分析可点击但只提示配置，不发起新请求', async () => {
    state.credentials.hasCredentials = true
    state.analyzeImage.mockRejectedValue(new Error('分析失败'))
    const panel = mount(AIAnalysisModal, {
      props: {
        modelValue: true,
        file: new globalThis.File(['x'], 'test.png', { type: 'image/png' })
      },
      global
    })
    await flushPromises()
    state.credentials.hasCredentials = false
    await flushPromises()
    const retry = panel.findAll('button').find(button => button.text().includes('重新分析'))
    expect(retry.attributes('disabled')).toBeUndefined()
    await retry.trigger('click')
    expect(state.requireAiConfiguration).toHaveBeenCalledOnce()
    expect(state.analyzeImage).toHaveBeenCalledOnce()
    panel.unmount()
  })

  it('使用共用 Key 与固定模型分析，并适配分类服务结果', async () => {
    state.credentials.hasCredentials = true
    state.analyzeImage.mockResolvedValue({
      filenameSuggestions: ['星空.jpg'],
      secondary: '风景',
      description: '星空描述',
      keywords: ['星空'],
      confidence: 0.95
    })
    const file = new globalThis.File(['x'], 'test.png', { type: 'image/png' })
    const panel = mount(AIAnalysisModal, { props: { modelValue: true, file }, global })
    await flushPromises()
    expect(state.analyzeImage).toHaveBeenCalledWith(
      expect.objectContaining({
        file,
        providerType: 'sub2api',
        modelKey: 'sub2api-gpt-6.1-sol',
        credentials: { apiKey: 'session-key', baseUrl: 'https://api.test/v1' }
      })
    )
    expect(panel.text()).toContain('星空描述')
    panel.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
  })
})
