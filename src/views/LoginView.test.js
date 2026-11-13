import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus from 'element-plus'
import LoginView from './LoginView.vue'

const state = vi.hoisted(() => ({
  config: null,
  auth: null,
  getCurrentUser: vi.fn(),
  checkRepoAccess: vi.fn(),
  setServiceToken: vi.fn()
}))
vi.mock('@/stores/config', () => ({ useConfigStore: () => state.config }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => state.auth }))
vi.mock('@/stores/upload-session', () => ({
  useUploadSessionStore: () => ({
    uploading: false,
    metadataStatus: 'idle',
    metadataRetryFileIds: [],
    files: []
  })
}))
vi.mock('@/services/github', () => ({
  githubService: {
    setToken: state.setServiceToken,
    getCurrentUser: state.getCurrentUser,
    checkRepoAccess: state.checkRepoAccess
  }
}))
vi.mock('@/config/oauth', () => ({
  getAuthUrl: vi.fn(() => 'https://github.com/login/oauth/authorize')
}))
vi.mock('@/components/settings/RepositoryPicker.vue', () => ({
  default: {
    name: 'RepositoryPicker',
    props: ['token', 'selectedId'],
    emits: ['select'],
    template: '<div data-testid="repository-picker" />'
  }
}))
const repo = {
  id: 1,
  owner: 'alice',
  name: 'gallery',
  fullName: 'alice/gallery',
  defaultBranch: 'trunk'
}
beforeEach(() => {
  vi.clearAllMocks()
  state.config = reactive({
    config: { owner: '', repo: '', branch: 'main', clientId: '', oauthWorkerUrl: '' },
    isConfigured: false,
    isOAuthConfigured: false,
    configRevision: 0,
    validateConfigInput: vi.fn(() => null),
    validateConfig: vi.fn().mockResolvedValue(true),
    setConfig: vi.fn(value => {
      state.config.config = value
      state.config.isConfigured = true
      state.config.configRevision++
    }),
    setConnectionConfig: vi.fn()
  })
  state.auth = reactive({
    token: null,
    user: null,
    permissionLevel: 'none',
    permissionChecked: false,
    isAuthenticated: false,
    setToken: vi.fn(value => {
      state.auth.token = value
    }),
    setUser: vi.fn(value => {
      state.auth.user = value
      state.auth.isAuthenticated = true
    }),
    logout: vi.fn(() => {
      state.auth.token = null
      state.auth.user = null
      state.auth.isAuthenticated = false
    }),
    validateToken: vi.fn().mockResolvedValue(true)
  })
  state.getCurrentUser.mockResolvedValue({ login: 'alice', name: 'Alice' })
  state.checkRepoAccess.mockResolvedValue('write')
})
async function mountLogin(path = '/login') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', component: LoginView },
      { path: '/upload', component: { template: '<div>上传</div>' } },
      { path: '/video-upload', component: { template: '<div>视频</div>' } }
    ]
  })
  await router.push(path)
  const panel = mount(
    { template: '<router-view />' },
    { global: { plugins: [ElementPlus, router] } }
  )
  await flushPromises()
  return { panel, router }
}
async function login(panel) {
  await panel.get('input[aria-label="GitHub Token"]').setValue('test-github-token')
  await panel.get('[data-testid="token-login"]').trigger('submit')
  await flushPromises()
}
async function select(panel, repository = repo) {
  panel.getComponent({ name: 'RepositoryPicker' }).vm.$emit('select', repository)
  await flushPromises()
}
function authenticated() {
  state.auth.token = 'existing-token'
  state.auth.user = { login: 'alice' }
  state.auth.isAuthenticated = true
}

describe('先登录后发现仓库', () => {
  it('无仓库配置也能先登录，身份验证后直接显示仓库选择而不检查空目标', async () => {
    const { panel } = await mountLogin()
    expect(panel.findComponent({ name: 'RepositoryConfigForm' }).exists()).toBe(false)
    await login(panel)
    expect(state.getCurrentUser).toHaveBeenCalledOnce()
    expect(state.auth.setToken).toHaveBeenCalledWith('test-github-token')
    expect(state.checkRepoAccess).not.toHaveBeenCalled()
    expect(panel.getComponent({ name: 'RepositoryPicker' }).props('token')).toBe(
      'test-github-token'
    )
    expect(state.config.setConfig).not.toHaveBeenCalled()
    panel.unmount()
  })
  it('选择远程仓库自动带默认分支，通过目标权限验证才保存并进入', async () => {
    const { panel, router } = await mountLogin('/login?redirect=/video-upload')
    await login(panel)
    await select(panel)
    expect(panel.get('input[aria-label="使用分支"]').element.value).toBe('trunk')
    await panel.get('[data-testid="use-repository"]').trigger('submit')
    await flushPromises()
    expect(state.checkRepoAccess).toHaveBeenCalledWith('alice', 'gallery')
    expect(state.config.setConfig.mock.invocationCallOrder[0]).toBeGreaterThan(
      state.checkRepoAccess.mock.invocationCallOrder[0]
    )
    expect(state.config.setConfig).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'alice', repo: 'gallery', branch: 'trunk' })
    )
    expect(router.currentRoute.value.path).toBe('/video-upload')
    panel.unmount()
  })
  it.each(['none', 'throw'])('仓库验证%s不写配置，保留身份供重选仓库', async permission => {
    if (permission === 'throw') state.checkRepoAccess.mockRejectedValue(new Error('network'))
    else state.checkRepoAccess.mockResolvedValue(permission)
    const { panel, router } = await mountLogin()
    await login(panel)
    await select(panel)
    await panel.get('[data-testid="use-repository"]').trigger('submit')
    await flushPromises()
    expect(state.config.setConfig).not.toHaveBeenCalled()
    expect(state.auth.isAuthenticated).toBe(true)
    expect(router.currentRoute.value.path).toBe('/login')
    expect(panel.text()).not.toContain('test-github-token')
    panel.unmount()
  })
  it('分支格式正确但远端不存在时不保存目标或进入工作台', async () => {
    state.config.validateConfig.mockResolvedValue(false)
    const { panel, router } = await mountLogin()
    await login(panel)
    await select(panel)
    await panel.get('[data-testid="use-repository"]').trigger('submit')
    await flushPromises()
    expect(state.config.setConfig).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/login')
    expect(panel.text()).toContain('所选分支不存在')
    panel.unmount()
  })
  it('身份验证失败清空临时凭据，不进入仓库选择', async () => {
    state.getCurrentUser.mockRejectedValue(new Error('invalid'))
    const { panel } = await mountLogin()
    await login(panel)
    expect(state.auth.setToken).not.toHaveBeenCalled()
    expect(state.auth.logout).toHaveBeenCalled()
    expect(state.setServiceToken).toHaveBeenLastCalledWith(null)
    expect(panel.find('[data-testid="repository-picker"]').exists()).toBe(false)
    panel.unmount()
  })
  it('只读确认进入，外站 redirect被忽略', async () => {
    state.checkRepoAccess.mockResolvedValue('read')
    const { panel, router } = await mountLogin('/login?redirect=https://outside.test')
    await login(panel)
    await select(panel)
    await panel.get('[data-testid="use-repository"]').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/login')
    await panel.get('[data-testid="enter-readonly"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/upload')
    panel.unmount()
  })
  it('已有身份和配置仍显示仓库选择与继续上次按钮，不自动跳转', async () => {
    authenticated()
    state.config.config = { owner: 'alice', repo: 'gallery', branch: 'main' }
    state.config.isConfigured = true
    const { panel, router } = await mountLogin('/login?select_repo=1')
    expect(state.auth.validateToken).toHaveBeenCalledOnce()
    expect(state.checkRepoAccess).not.toHaveBeenCalled()
    expect(panel.find('[data-testid="repository-picker"]').exists()).toBe(true)
    expect(panel.text()).toContain('继续上次仓库')
    expect(router.currentRoute.value.path).toBe('/login')
    panel.unmount()
  })
  it('新仓库清理旧依附服务，但保留部署级 OAuth 配置', async () => {
    authenticated()
    state.config.config = {
      owner: 'old',
      repo: 'old-repo',
      branch: 'main',
      workflowOwner: 'old',
      workflowRepo: 'pipeline',
      frontendOwner: 'old',
      frontendRepo: 'site',
      videoApiUrl: '/old-video',
      clientId: 'client',
      oauthWorkerUrl: '/oauth'
    }
    state.config.isConfigured = true
    const { panel } = await mountLogin()
    await select(panel)
    await panel.get('[data-testid="use-repository"]').trigger('submit')
    await flushPromises()
    expect(state.config.setConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowOwner: '',
        workflowRepo: '',
        frontendOwner: '',
        frontendRepo: '',
        videoApiUrl: '',
        clientId: 'client',
        oauthWorkerUrl: '/oauth'
      })
    )
    panel.unmount()
  })
  it('未选仓库时可以单独保存 OAuth 连接，不需要目标仓库', async () => {
    const { panel } = await mountLogin()
    await panel
      .findAll('button')
      .find(button => button.text() === '配置 GitHub OAuth')
      .trigger('click')
    await panel.get('input[aria-label="OAuth Client ID"]').setValue('client')
    await panel.get('input[aria-label="OAuth Worker 地址"]').setValue('/oauth')
    await panel.get('[data-testid="oauth-config"]').trigger('submit')
    expect(state.config.setConnectionConfig).toHaveBeenCalledWith({
      clientId: 'client',
      oauthWorkerUrl: '/oauth'
    })
    expect(state.config.setConfig).not.toHaveBeenCalled()
    panel.unmount()
  })

  it('选择同一仓库保留既有服务连接，已归档仓库强制只读', async () => {
    authenticated()
    state.config.config = {
      owner: 'alice',
      repo: 'gallery',
      branch: 'main',
      workflowOwner: 'alice',
      workflowRepo: 'pipeline',
      frontendOwner: 'alice',
      frontendRepo: 'site',
      videoApiUrl: '/video'
    }
    state.config.isConfigured = true
    state.checkRepoAccess.mockResolvedValue('admin')
    const { panel, router } = await mountLogin()
    await select(panel, { ...repo, archived: true })
    expect(panel.text()).toContain('此仓库已归档')
    await panel.get('[data-testid="use-repository"]').trigger('submit')
    await flushPromises()
    expect(state.config.setConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowRepo: 'pipeline',
        frontendRepo: 'site',
        videoApiUrl: '/video'
      })
    )
    expect(state.auth.permissionLevel).toBe('read')
    expect(panel.find('[data-testid="enter-readonly"]').exists()).toBe(true)
    expect(router.currentRoute.value.path).toBe('/login')
    panel.unmount()
  })
})
