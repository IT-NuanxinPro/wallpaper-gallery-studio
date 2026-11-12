import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  localStorage.clear()
  sessionStorage.clear()
  setActivePinia(createPinia())
})

it('环境中的AI key不再被读取，三个调用入口仅使用本标签配置', async () => {
  vi.stubEnv('VITE_SUB2API_API_KEY', 'must-not-import-build-secret')
  vi.stubEnv('VITE_ZHIPU_API_KEY', 'retired-secret')
  const { useCredentialsStore } = await import('./credentials')
  const store = useCredentialsStore()
  await store.loadCredentials()
  expect(store.hasCredentials).toBe(false)
  await store.saveCredentials({ apiKey: 'colleague-key', baseUrl: 'https://gateway.example/v1' })
  expect(store.hasCredentials).toBe(true)
  expect(store.availableProviders.map(item => item.key)).toEqual(['sub2api'])
  expect(store.getCredentialsByProvider('sub2api')).toMatchObject({
    apiKey: 'colleague-key',
    baseUrl: 'https://gateway.example/v1'
  })
  expect(store.getCredentialsByProvider('zhipu')).toBe(null)
  expect(Object.values(localStorage).join('')).not.toContain('colleague-key')
})

it('清除和替换配置取消旧会话请求，后续请求只用最新Key', async () => {
  const { useCredentialsStore } = await import('./credentials')
  const store = useCredentialsStore()
  await store.saveCredentials({ apiKey: 'key-one', baseUrl: 'https://gateway.example/v1' })
  const first = store.getCredentialsByProvider('sub2api')
  await store.saveCredentials({ apiKey: 'key-two', baseUrl: 'https://gateway.example/v1' })
  expect(first.signal.aborted).toBe(true)
  const second = store.getCredentialsByProvider('sub2api')
  expect(second.apiKey).toBe('key-two')
  expect(second.sessionRevision).toBeGreaterThan(first.sessionRevision)
  store.clearCredentials()
  expect(second.signal.aborted).toBe(true)
  expect(store.hasCredentials).toBe(false)
  expect(store.getCredentialsByProvider('sub2api').apiKey).toBe('')
  expect(sessionStorage.length).toBe(0)
})

it('刷新允许恢复同会话配置，其他Pinia使用同document内存状态', async () => {
  vi.spyOn(globalThis.performance, 'getEntriesByType').mockReturnValue([{ type: 'reload' }])
  const { SESSION_CREDENTIALS_KEY } = await import('@/services/ai/session-credentials')
  sessionStorage.setItem(
    SESSION_CREDENTIALS_KEY,
    JSON.stringify({ apiKey: 'refresh-key', baseUrl: 'https://gateway.example/v1' })
  )
  const { useCredentialsStore } = await import('./credentials')
  const store = useCredentialsStore()
  await store.loadCredentials()
  expect(store.apiKey).toBe('refresh-key')
  expect(store.getCredentials().apiKey).toBe('refresh-key')
  vi.restoreAllMocks()
})
