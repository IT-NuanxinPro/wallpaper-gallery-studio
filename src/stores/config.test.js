import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/services/github', () => ({ githubService: { getContents: vi.fn() } }))
const variables = [
  'VITE_GITHUB_REPO_OWNER',
  'VITE_GITHUB_REPO_NAME',
  'VITE_GITHUB_REPO_BRANCH',
  'VITE_GITHUB_CLIENT_ID',
  'VITE_OAUTH_WORKER_URL',
  'VITE_WORKFLOW_OWNER',
  'VITE_WORKFLOW_REPO',
  'VITE_FRONTEND_OWNER',
  'VITE_FRONTEND_REPO',
  'VITE_VIDEO_API_URL'
]
beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  variables.forEach(key => vi.stubEnv(key, ''))
  setActivePinia(createPinia())
})

it('新部署无作者仓库回退，首次使用需要配置', async () => {
  const { useConfigStore } = await import('./config')
  const store = useConfigStore()
  expect(store.isConfigured).toBe(false)
  expect(store.isOAuthConfigured).toBe(false)
  expect(store.config.workflowRepo).toBe('')
  expect(store.config.frontendRepo).toBe('')
  expect(store.config.videoApiUrl).toBe('')
})
it('未选择仓库也可配置OAuth先完成身份登录', async () => {
  const { useConfigStore } = await import('./config')
  const store = useConfigStore()
  store.setConnectionConfig({
    clientId: 'my-app',
    oauthWorkerUrl: 'https://auth.example/token',
    owner: 'ignored'
  })
  expect(store.isOAuthConfigured).toBe(true)
  expect(store.isConfigured).toBe(false)
  expect(store.config.owner).toBe('')
})

it('登录前允许保存仓库配置且不请求GitHub，不保留额外秘密字段', async () => {
  const { useConfigStore } = await import('./config')
  const { githubService } = await import('@/services/github')
  const store = useConfigStore()
  store.setConfig({
    owner: 'colleague',
    repo: 'my-wallpapers',
    branch: 'main',
    token: 'must-not-persist'
  })
  expect(store.isConfigured).toBe(true)
  expect(githubService.getContents).not.toHaveBeenCalled()
  expect(localStorage.getItem('wallpaper_admin_config')).not.toContain('must-not-persist')
})

it('显式清空可选服务覆盖环境预设，修改配置不会重新套用作者目标', async () => {
  vi.stubEnv('VITE_WORKFLOW_OWNER', 'deployer')
  vi.stubEnv('VITE_WORKFLOW_REPO', 'preselected-workflow')
  localStorage.setItem(
    'wallpaper_admin_config',
    JSON.stringify({
      owner: 'colleague',
      repo: 'my-wallpapers',
      branch: 'main',
      workflowOwner: '',
      workflowRepo: ''
    })
  )
  const { useConfigStore } = await import('./config')
  expect(useConfigStore().config.workflowRepo).toBe('')
})
it('旧缓存切换了数据仓库时不继承部署者的可选服务', async () => {
  vi.stubEnv('VITE_GITHUB_REPO_OWNER', 'deployer')
  vi.stubEnv('VITE_GITHUB_REPO_NAME', 'original-data')
  vi.stubEnv('VITE_WORKFLOW_OWNER', 'deployer')
  vi.stubEnv('VITE_WORKFLOW_REPO', 'original-workflow')
  vi.stubEnv('VITE_VIDEO_API_URL', 'https://original.example')
  localStorage.setItem(
    'wallpaper_admin_config',
    JSON.stringify({ owner: 'colleague', repo: 'own-data', branch: 'main' })
  )
  const { useConfigStore } = await import('./config')
  const store = useConfigStore()
  expect(store.config.workflowRepo).toBe('')
  expect(store.config.videoApiUrl).toBe('')
})

it('目标和可选仓库成对校验，HTTP服务地址允许且不保存无效配置', async () => {
  const { useConfigStore, validateConfigInput } = await import('./config')
  const config = { owner: 'colleague', repo: 'my-wallpapers', branch: 'main' }
  expect(validateConfigInput({ ...config, videoApiUrl: 'http://192.168.1.8:8795' })).toBe(null)
  expect(validateConfigInput({ ...config, workflowOwner: 'colleague' })).toContain('完整')
  expect(validateConfigInput({ ...config, clientId: 'oauth-id' })).toContain('同时')
  for (const branch of ['', '../main', 'main?test', 'feature.lock']) {
    expect(validateConfigInput({ ...config, branch })).toContain('分支')
  }
  const store = useConfigStore()
  expect(() => store.setConfig({ ...config, videoApiUrl: 'javascript:alert(1)' })).toThrow()
  expect(store.isConfigured).toBe(false)
})
