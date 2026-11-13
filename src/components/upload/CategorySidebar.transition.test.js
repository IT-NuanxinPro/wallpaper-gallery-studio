import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import CategorySidebar from './CategorySidebar.vue'

vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ canUpload: false }) }))
let panel
afterEach(() => {
  panel?.unmount()
  vi.useRealTimers()
})

describe('目录状态真实过渡', () => {
  it('空态、加载、目录三态切换都把旧节点交给同一舞台的离场定位', async () => {
    panel = mount(CategorySidebar, {
      props: { series: 'desktop', treeData: [], loadNode: (_node, resolve) => resolve([]) },
      global: {
        plugins: [ElementPlus],
        stubs: { transition: false, 'transition-group': false, ElTree: true }
      }
    })
    vi.useFakeTimers()
    await panel.setProps({ loading: true })
    expect(
      panel
        .find(
          '.category-sidebar__tree-stage > .category-sidebar__tree-empty.studio-panel-leave-active'
        )
        .exists()
    ).toBe(true)
    expect(panel.find('.category-sidebar__tree-stage > .category-sidebar__loading').exists()).toBe(
      true
    )
    await vi.runAllTimersAsync()
    await panel.setProps({
      loading: false,
      treeData: [{ name: '风景', path: 'wallpaper/desktop/风景', type: 'l1' }]
    })
    expect(
      panel
        .find(
          '.category-sidebar__tree-stage > .category-sidebar__loading.studio-panel-leave-active'
        )
        .exists()
    ).toBe(true)
    expect(
      panel
        .find('.category-sidebar__tree-stage > .category-sidebar__tree[data-scroll-region]')
        .exists()
    ).toBe(true)
    await vi.runAllTimersAsync()
    await panel.setProps({ treeData: [] })
    expect(
      panel
        .find('.category-sidebar__tree-stage > .category-sidebar__tree.studio-panel-leave-active')
        .exists()
    ).toBe(true)
    await vi.runAllTimersAsync()
    expect(panel.find('.category-sidebar__tree').exists()).toBe(false)
  })
})
