import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import ElementPlus from 'element-plus'
import HistoryView from './HistoryView.vue'

const state = vi.hoisted(() => ({ history: null }))
vi.mock('@/stores/history', () => ({ useHistoryStore: () => state.history }))
vi.mock('@/components/MainLayout.vue', () => ({ default: { template: '<main><slot /></main>' } }))
let panel
afterEach(() => {
  panel?.unmount()
  vi.useRealTimers()
})

describe('历史空态与列表真实过渡', () => {
  it('新增和清空历史时离场节点脱离布局，列表根保留独立滚动', async () => {
    state.history = reactive({
      records: [],
      successCount: 0,
      errorCount: 0,
      getRecordsByDate: () =>
        state.history.records.length ? { '2026-11-13': state.history.records } : {}
    })
    panel = mount(HistoryView, {
      global: { plugins: [ElementPlus], stubs: { transition: false, 'transition-group': false } }
    })
    vi.useFakeTimers()
    state.history.records = [
      { id: 'first', filename: 'first.png', status: 'success', timestamp: 1 }
    ]
    await nextTick()
    expect(
      panel.find('.history-view__body > .history-view__empty.studio-panel-leave-active').exists()
    ).toBe(true)
    expect(
      panel.find('.history-view__body > .history-view__list[data-scroll-region]').exists()
    ).toBe(true)
    await vi.runAllTimersAsync()
    state.history.records = []
    await nextTick()
    expect(
      panel.find('.history-view__body > .history-view__list.studio-panel-leave-active').exists()
    ).toBe(true)
    expect(panel.find('.history-view__body > .history-view__empty').exists()).toBe(true)
    await vi.runAllTimersAsync()
    expect(panel.find('.history-view__list').exists()).toBe(false)
  })
})
