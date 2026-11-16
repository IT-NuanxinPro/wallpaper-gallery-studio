import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
const state = vi.hoisted(() => ({ discover: vi.fn(), github: { token: 'token' } }))
vi.mock('@/services/repository-connections', () => ({
  discoverRepositoryConnections: state.discover
}))
vi.mock('@/services/github', () => ({ githubService: state.github }))
import { useConfigStore } from './config'
beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  state.discover.mockReset()
  state.github.token = 'token'
})
it('恢复缺少的关联并持久化，保留AI视频和现有手动配置', async () => {
  const store = useConfigStore()
  store.setConfig({
    owner: 'team',
    repo: 'data',
    branch: 'main',
    videoApiUrl: 'https://video.example',
    frontendOwner: 'custom',
    frontendRepo: 'site',
    workflowOwner: '',
    workflowRepo: ''
  })
  state.discover.mockResolvedValue({
    connections: { workflowOwner: 'team', workflowRepo: 'pipeline' }
  })
  await store.connectMissingRepositories()
  expect(store.config).toMatchObject({
    workflowOwner: 'team',
    workflowRepo: 'pipeline',
    frontendOwner: 'custom',
    frontendRepo: 'site',
    videoApiUrl: 'https://video.example'
  })
  expect(JSON.parse(localStorage.getItem('wallpaper_admin_config')).workflowRepo).toBe('pipeline')
})
it('换仓库后新请求可运行，旧响应不污染新目标', async () => {
  const store = useConfigStore()
  store.setConfig({
    owner: 'team',
    repo: 'first',
    branch: 'main',
    workflowOwner: '',
    workflowRepo: '',
    frontendOwner: '',
    frontendRepo: ''
  })
  let finish
  state.discover
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve
        })
    )
    .mockResolvedValue({ connections: { workflowOwner: 'team', workflowRepo: 'second-pipeline' } })
  const old = store.connectMissingRepositories()
  store.setConfig({ repo: 'second' })
  await store.connectMissingRepositories()
  finish({ connections: { workflowOwner: 'team', workflowRepo: 'first-pipeline' } })
  await old
  expect(store.config.repo).toBe('second')
  expect(store.config.workflowRepo).toBe('second-pipeline')
})
it('请求失败只提示可重试，不阻止使用当前仓库', async () => {
  const store = useConfigStore()
  store.setConfig({
    owner: 'team',
    repo: 'data',
    branch: 'main',
    workflowOwner: '',
    workflowRepo: '',
    frontendOwner: '',
    frontendRepo: ''
  })
  state.discover.mockRejectedValue(new Error('网络暂不可用'))
  await expect(store.connectMissingRepositories()).resolves.toBeUndefined()
  expect(store.connectionError).toBe('网络暂不可用')
  expect(store.config.workflowRepo).toBe('')
})
