import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  credentials: { hasCredentials: false, hasModelReady: false, loadCredentials: vi.fn() },
  push: vi.fn(),
  message: vi.fn()
}))
vi.mock('@/stores/credentials', () => ({ useCredentialsStore: () => state.credentials }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: state.push }) }))
vi.mock('element-plus', () => ({ ElMessage: state.message }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.credentials.hasCredentials = false
  state.credentials.hasModelReady = false
  state.message.mockReturnValue({ close: vi.fn() })
})

describe('AI配置操作反馈', () => {
  it('缺少Key拦截操作并只显示一条可操作提示', async () => {
    const { useAiConfigurationGuard } = await import('./useAiConfigurationGuard')
    const first = useAiConfigurationGuard()
    expect(first.requireAiConfiguration()).toBe(false)
    expect(useAiConfigurationGuard().requireAiConfiguration()).toBe(false)
    expect(state.message).toHaveBeenCalledTimes(1)
    const options = state.message.mock.calls[0][0]
    expect(options.message.children[0].children).toContain('API Key')
    options.message.children[1].props.onClick()
    expect(state.push).toHaveBeenCalledWith('/settings#ai-config')
    expect(state.message.mock.results[0].value.close).toHaveBeenCalledOnce()
  })

  it('已配置直接放行，提示关闭后允许下一次提醒', async () => {
    const { useAiConfigurationGuard } = await import('./useAiConfigurationGuard')
    const guard = useAiConfigurationGuard()
    guard.requireAiConfiguration()
    state.message.mock.calls[0][0].onClose()
    guard.requireAiConfiguration()
    expect(state.message).toHaveBeenCalledTimes(2)
    state.credentials.hasCredentials = true
    state.credentials.hasModelReady = true
    expect(guard.requireAiConfiguration()).toBe(true)
    expect(state.message).toHaveBeenCalledTimes(2)
  })
  it('只有Key未选模型时提示选模型，不能放行请求', async () => {
    state.credentials.hasCredentials = true
    const { useAiConfigurationGuard } = await import('./useAiConfigurationGuard')
    expect(useAiConfigurationGuard().requireAiConfiguration()).toBe(false)
    expect(state.message.mock.calls[0][0].message.children[0].children).toContain('选择模型')
  })
})
