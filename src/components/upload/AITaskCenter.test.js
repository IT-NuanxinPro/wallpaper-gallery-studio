import { describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'
import ElementPlus from 'element-plus'
import AITaskCenter from './AITaskCenter.vue'
const state = vi.hoisted(() => ({ store: null, resume: vi.fn(async () => {}) }))
vi.mock('@/stores/ai-tasks', () => ({ useAiTasksStore: () => state.store }))
vi.mock('@/services/ai/task-runner', () => ({
  resumeAiTaskQueue: (...args) => state.resume(...args),
  retryAiTask: vi.fn()
}))
vi.mock('@/composables/useAiConfigurationGuard', () => ({
  useAiConfigurationGuard: () => ({ requireAiConfiguration: () => true })
}))
describe('任务中心折叠', () => {
  it('默认只展示实时计数，展开收起不暂停或重复启动分析', async () => {
    const task = { id: 'one', fileName: 'one.jpg', status: 'queued' }
    state.store = reactive({
      tasks: [task],
      queuedTasks: [task],
      activeTasks: [],
      completedTasks: [],
      failedTasks: [],
      pendingCount: 1,
      initialize: vi.fn(async () => {})
    })
    const panel = mount(AITaskCenter, {
      attachTo: document.body,
      global: {
        plugins: [ElementPlus],
        stubs: { ElCollapseTransition: { template: '<div><slot /></div>' } }
      }
    })
    await flushPromises()
    expect(panel.get('.ai-task-center__list').isVisible()).toBe(false)
    expect(panel.text()).toContain('排队 1')
    await panel.get('button[aria-expanded]').trigger('click')
    expect(panel.get('.ai-task-center__list').isVisible()).toBe(true)
    await panel.get('button[aria-expanded]').trigger('click')
    state.store.queuedTasks = []
    state.store.completedTasks = [task]
    await flushPromises()
    expect(panel.text()).toContain('完成 1')
    expect(panel.get('.ai-task-center__list').isVisible()).toBe(false)
    expect(state.resume).toHaveBeenCalledTimes(1)
    panel.unmount()
  })
})
