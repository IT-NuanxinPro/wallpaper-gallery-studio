import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { reactive } from 'vue'
import ElementPlus from 'element-plus'
import AIAssistantPanel from './AIAssistantPanel.vue'
import UploadHeader from '../upload/UploadPanel/UploadHeader.vue'

const state = vi.hoisted(() => ({ credentials: null, ai: null }))
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
  state.credentials = reactive({ hasCredentials: false, loadCredentials: vi.fn() })
  state.ai = reactive({
    currentProvider: 'sub2api',
    currentModel: 'sub2api-gpt-6.1-sol',
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

describe('三个入口共用单一模型配置', () => {
  it('图片上传只显示固定模型，没有下拉；缺少 Key 时禁用 AI 入口，保留人工上传', async () => {
    const panel = mount(UploadHeader, { global })
    expect(panel.text()).toContain('GPT-6.1 Sol')
    expect(panel.find('.upload-header__ai-dropdown').exists()).toBe(false)
    expect(panel.findComponent({ name: 'ElPopover' }).exists()).toBe(false)
    expect(panel.getComponent(RouterLinkStub).props('to')).toBe('/settings#ai-config')
    const modeButtons = panel.findAll('.upload-header__mode-btn')
    expect(modeButtons[0].attributes('disabled')).toBeDefined()
    expect(modeButtons[1].attributes('disabled')).toBeUndefined()
    state.credentials.hasCredentials = true
    await flushPromises()
    expect(modeButtons[0].attributes('disabled')).toBeUndefined()
    panel.unmount()
  })

  it('AI 工坊只显示固定模型，配置保存与清除立即影响分析按钮', async () => {
    const panel = mount(AIAssistantPanel, { global })
    await flushPromises()
    expect(panel.text()).toContain('GPT-6.1 Sol')
    expect(panel.find('.provider-group').exists()).toBe(false)
    expect(panel.find('.model-group').exists()).toBe(false)
    expect(panel.getComponent(RouterLinkStub).props('to')).toBe('/settings#ai-config')
    panel.getComponent({ name: 'ElUpload' }).props('onChange')({}, [{ name: 'test.png' }])
    await flushPromises()
    expect(panel.get('.analyze-btn').attributes('disabled')).toBeDefined()
    state.credentials.hasCredentials = true
    await flushPromises()
    expect(panel.get('.analyze-btn').attributes('disabled')).toBeUndefined()
    state.credentials.hasCredentials = false
    await flushPromises()
    expect(panel.get('.analyze-btn').attributes('disabled')).toBeDefined()
    panel.unmount()
  })
})
