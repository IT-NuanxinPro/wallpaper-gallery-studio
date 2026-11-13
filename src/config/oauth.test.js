import { beforeEach, expect, it, vi } from 'vitest'
beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  sessionStorage.clear()
  vi.unstubAllEnvs()
})
it('登录页保存的OAuth配置优先于部署默认，显式清空不会回退', async () => {
  vi.stubEnv('VITE_GITHUB_CLIENT_ID', 'build-id')
  vi.stubEnv('VITE_OAUTH_WORKER_URL', 'https://build.example/token')
  localStorage.setItem(
    'wallpaper_admin_config',
    JSON.stringify({ clientId: 'my-id', oauthWorkerUrl: 'http://127.0.0.1:8795/token' })
  )
  const { oauthConfig, getAuthUrl } = await import('./oauth')
  expect(oauthConfig.clientId).toBe('my-id')
  expect(oauthConfig.tokenEndpoint).toBe('http://127.0.0.1:8795/token')
  expect(new URL(getAuthUrl()).searchParams.get('client_id')).toBe('my-id')
  localStorage.setItem(
    'wallpaper_admin_config',
    JSON.stringify({ clientId: '', oauthWorkerUrl: '' })
  )
  expect(() => getAuthUrl()).toThrow('登录页')
})
