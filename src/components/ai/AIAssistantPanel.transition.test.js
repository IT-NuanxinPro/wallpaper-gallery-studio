import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import ElementPlus from 'element-plus'
import AIAssistantPanel from './AIAssistantPanel.vue'

const state = vi.hoisted(() => ({ ai: null, credentials: null }))
vi.mock('@/stores/ai', () => ({ useAIStore: () => state.ai }))
vi.mock('@/stores/credentials', () => ({ useCredentialsStore: () => state.credentials }))
vi.mock('@/composables/useAiConfigurationGuard', () => ({
  useAiConfigurationGuard: () => ({ requireAiConfiguration: () => true })
}))
vi.mock('./PromptTemplateSelector.vue', () => ({ default: { template: '<div />' } }))
vi.mock('./ResultCard.vue', () => ({
  default: { props: ['result'], template: '<article class="result-card">{{ result.id }}</article>' }
}))

let panel
beforeEach(() => {
  state.credentials = reactive({
    hasCredentials: true,
    hasModelReady: true,
    selectedModel: 'vision-test',
    loadCredentials: vi.fn()
  })
  state.ai = reactive({
    hasResults: false,
    results: [],
    analyzing: false,
    error: '',
    promptTemplate: '',
    currentProvider: 'sub2api',
    clearResults: vi.fn()
  })
})
afterEach(() => {
  panel?.unmount()
  vi.useRealTimers()
})

describe('AI 结果面板真实过渡', () => {
  it('空态与结果互换时，离场根节点始终命中面板的脱离布局规则', async () => {
    panel = mount(AIAssistantPanel, {
      global: {
        plugins: [ElementPlus],
        stubs: { RouterLink: RouterLinkStub, transition: false, 'transition-group': false }
      }
    })
    await flushPromises()
    vi.useFakeTimers()
    state.ai.results = [{ id: 'first' }]
    state.ai.hasResults = true
    await nextTick()
    expect(panel.find('.results-body > .empty-state.studio-panel-leave-active').exists()).toBe(true)
    expect(panel.find('.results-body > .results-list').exists()).toBe(true)
    await vi.runAllTimersAsync()
    expect(panel.find('.empty-state').exists()).toBe(false)

    state.ai.results = []
    state.ai.hasResults = false
    await nextTick()
    expect(panel.find('.results-body > .results-list.studio-panel-leave-active').exists()).toBe(
      true
    )
    expect(panel.find('.results-body > .empty-state').exists()).toBe(true)
    await vi.runAllTimersAsync()
    expect(panel.find('.results-list').exists()).toBe(false)
  })
})
