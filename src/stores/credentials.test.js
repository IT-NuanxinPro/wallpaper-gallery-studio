import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const config = {
  apiKey: 'colleague-key',
  baseUrl: 'https://gateway.example/v1',
  model: 'vision-a',
  models: [{ id: 'vision-a' }, { id: 'vision-b' }]
}
beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  localStorage.clear()
  sessionStorage.clear()
  setActivePinia(createPinia())
})

it('只使用会话Key与所选远程模型，不读取环境凭据', async () => {
  vi.stubEnv('VITE_SUB2API_API_KEY', 'must-not-import-build-secret')
  const { useCredentialsStore } = await import('./credentials')
  const store = useCredentialsStore()
  store.loadCredentials()
  expect(store.hasCredentials).toBe(false)
  expect(store.hasModelReady).toBe(false)
  store.saveCredentials(config)
  expect(store.hasModelReady).toBe(true)
  expect(store.getCredentialsByProvider('sub2api')).toMatchObject({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: 'vision-a'
  })
  expect(store.getCredentialsByProvider('zhipu')).toBe(null)
  expect(JSON.stringify(localStorage)).not.toContain(config.apiKey)
})

it('换模型与清除取消旧会话请求，未选模型不能保存', async () => {
  const { useCredentialsStore } = await import('./credentials')
  const store = useCredentialsStore()
  store.saveCredentials(config)
  const first = store.getCredentials()
  expect(() => store.saveCredentials({ ...config, model: 'unlisted' })).toThrow('选择')
  expect(store.getCredentials().signal).toBe(first.signal)
  expect(first.signal.aborted).toBe(false)
  store.selectModel('vision-b')
  expect(first.signal.aborted).toBe(true)
  expect(store.getCredentials().model).toBe('vision-b')
  const second = store.getCredentials()
  store.clearCredentials()
  expect(second.signal.aborted).toBe(true)
  expect(store.hasCredentials).toBe(false)
  expect(store.hasModelReady).toBe(false)
  expect(store.models).toEqual([])
  expect(store.selectedModel).toBe('')
  expect(sessionStorage.length).toBe(0)
})

it('更换Key列表与模型一起原子更新，旧Key请求取消', async () => {
  const { useCredentialsStore } = await import('./credentials')
  const store = useCredentialsStore()
  store.saveCredentials(config)
  const old = store.getCredentials()
  store.saveCredentials({
    ...config,
    apiKey: 'new-key',
    model: 'vision-c',
    models: [{ id: 'vision-c' }]
  })
  expect(old.signal.aborted).toBe(true)
  expect(store.getCredentials()).toMatchObject({ apiKey: 'new-key', model: 'vision-c' })
  expect(() => store.selectModel('vision-a')).toThrow()
})

it('刷新恢复模型和列表；旧仅Key缓存不擅自指定模型', async () => {
  vi.spyOn(globalThis.performance, 'getEntriesByType').mockReturnValue([{ type: 'reload' }])
  const { SESSION_CREDENTIALS_KEY } = await import('@/services/ai/session-credentials')
  sessionStorage.setItem(SESSION_CREDENTIALS_KEY, JSON.stringify(config))
  const { useCredentialsStore } = await import('./credentials')
  const store = useCredentialsStore()
  store.loadCredentials()
  expect(store.hasModelReady).toBe(true)
  expect(store.selectedModel).toBe('vision-a')
  expect(store.models).toEqual(config.models)
  setActivePinia(createPinia())
  sessionStorage.setItem(
    SESSION_CREDENTIALS_KEY,
    JSON.stringify({ apiKey: 'old-key', baseUrl: config.baseUrl })
  )
  const legacy = useCredentialsStore()
  legacy.loadCredentials()
  expect(legacy.hasCredentials).toBe(true)
  expect(legacy.hasModelReady).toBe(false)
  expect(legacy.getCredentials().model).toBe('')
  vi.restoreAllMocks()
})
