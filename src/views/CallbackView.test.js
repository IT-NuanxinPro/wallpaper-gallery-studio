import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'
import CallbackView from './CallbackView.vue'

const state = vi.hoisted(() => ({
  config: null,
  auth: null,
  push: vi.fn(),
  replace: vi.fn(),
  exchangeToken: vi.fn(),
  getCurrentUser: vi.fn()
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: state.push, replace: state.replace }),
  useRoute: () => ({ query: { code: 'test-code', state: 'test-state' } })
}))
vi.mock('@/stores/config', () => ({ useConfigStore: () => state.config }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => state.auth }))
vi.mock('@/config/oauth', () => ({ verifyState: () => true, exchangeToken: state.exchangeToken }))
vi.mock('@/services/github', () => ({
  githubService: { setToken: vi.fn(), getCurrentUser: state.getCurrentUser }
}))
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn() } }))

let panel
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  state.config = reactive({
    isConfigured: true,
    config: { owner: 'chosen-owner', repo: 'chosen-repo', branch: 'main' }
  })
  state.auth = reactive({
    token: null,
    user: null,
    setToken: vi.fn(value => {
      state.auth.token = value
    }),
    setUser: vi.fn(value => {
      state.auth.user = value
    }),
    checkPermission: vi.fn().mockResolvedValue('write'),
    invalidatePermission: vi.fn()
  })
  state.exchangeToken.mockResolvedValue('callback-token')
  state.getCurrentUser.mockResolvedValue({ id: 1, login: 'account' })
})
afterEach(() => {
  panel?.unmount()
  vi.useRealTimers()
})
async function render() {
  panel = mount(CallbackView, {
    global: {
      stubs: {
        GradientBackground: { template: '<div><slot /></div>' },
        GlassCard: { template: '<div><slot /></div>' },
        ElIcon: true,
        ElButton: true
      }
    }
  })
  await flushPromises()
  await vi.runAllTimersAsync()
  return panel
}

describe('OAuth身份确认后选择仓库', () => {
  it('无仓库配置也完成身份登录，再进入仓库选择器', async () => {
    state.config.isConfigured = false
    state.config.config = {}
    await render()
    expect(state.exchangeToken).toHaveBeenCalledWith('test-code')
    expect(state.auth.setToken).toHaveBeenCalledWith('callback-token')
    expect(state.auth.setUser).toHaveBeenCalledWith({ id: 1, login: 'account' })
    expect(state.auth.invalidatePermission).toHaveBeenCalledOnce()
    expect(state.replace).toHaveBeenCalledWith('/login?select_repo=1')
    expect(state.auth.checkPermission).not.toHaveBeenCalled()
  })

  it('即使已有旧仓库也只进入选择器，不预检查或直达上传页', async () => {
    await render()
    expect(state.replace).toHaveBeenCalledWith('/login?select_repo=1')
    expect(state.auth.checkPermission).not.toHaveBeenCalled()
    expect(state.push).not.toHaveBeenCalledWith('/upload')
  })

  it('换取token期间切换账号时旧回调不能覆盖新身份', async () => {
    state.exchangeToken.mockImplementation(async () => {
      state.auth.token = 'new-token'
      state.auth.user = { id: 2, login: 'new-account' }
      return 'callback-token'
    })
    await render()
    expect(state.auth.setToken).not.toHaveBeenCalled()
    expect(state.getCurrentUser).not.toHaveBeenCalled()
    expect(state.replace).not.toHaveBeenCalled()
    expect(panel.text()).toContain('账号已变更')
  })

  it('获取身份期间切换账号时旧响应不能写回或继续跳转', async () => {
    state.getCurrentUser.mockImplementation(async () => {
      state.auth.token = 'new-token'
      state.auth.user = { id: 2, login: 'new-account' }
      return { id: 1, login: 'old-account' }
    })
    await render()
    expect(state.auth.setToken).not.toHaveBeenCalled()
    expect(state.auth.setUser).not.toHaveBeenCalled()
    expect(state.replace).not.toHaveBeenCalled()
    expect(panel.text()).toContain('账号已变更')
  })
})
