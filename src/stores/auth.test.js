import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from './auth'
import { githubService } from '@/services/github'

vi.mock('@/services/github', () => ({
  githubService: {
    setToken: vi.fn(),
    checkRepoAccess: vi.fn(),
    getCurrentUser: vi.fn()
  }
}))
vi.mock('@/services/localStorage', () => ({
  localStorageService: { init: vi.fn(), cleanup: vi.fn() }
}))

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  setActivePinia(createPinia())
  vi.resetAllMocks()
})

function login(token = 'token-a', user = { id: 1, login: 'account-a' }) {
  const store = useAuthStore()
  store.setToken(token)
  store.setUser(user)
  return store
}

describe('仓库权限与登录身份绑定', () => {
  it('同一身份和仓库可复用缓存，切换owner/repo重新请求', async () => {
    const store = login()
    githubService.checkRepoAccess
      .mockResolvedValueOnce('write')
      .mockResolvedValueOnce('read')
      .mockResolvedValueOnce('none')
    expect(await store.checkPermission('owner-a', 'repo-a')).toBe('write')
    expect(await store.checkPermission('owner-a', 'repo-a')).toBe('write')
    expect(await store.checkPermission('owner-b', 'repo-a')).toBe('read')
    expect(await store.checkPermission('owner-b', 'repo-b')).toBe('none')
    expect(githubService.checkRepoAccess.mock.calls).toEqual([
      ['owner-a', 'repo-a'],
      ['owner-b', 'repo-a'],
      ['owner-b', 'repo-b']
    ])
  })

  it('换token不复用同一仓库旧权限或无身份session缓存', async () => {
    const store = login()
    githubService.checkRepoAccess.mockResolvedValueOnce('admin').mockResolvedValueOnce('read')
    await store.checkPermission('owner', 'repo')
    sessionStorage.setItem(
      'permission_owner_repo',
      JSON.stringify({ level: 'admin', timestamp: Date.now() })
    )
    store.setToken('token-b')
    expect(store.permissionLevel).toBe('none')
    expect(store.permissionChecked).toBe(false)
    expect(await store.checkPermission('owner', 'repo')).toBe('read')
    expect(store.canUpload).toBe(false)
    expect(githubService.checkRepoAccess).toHaveBeenCalledTimes(2)
  })

  it('切换仓库后旧请求晚到不能覆盖新仓库权限', async () => {
    const store = login()
    const old = deferred()
    githubService.checkRepoAccess.mockReturnValueOnce(old.promise).mockResolvedValueOnce('read')
    const pending = store.checkPermission('old-owner', 'old-repo')
    await store.checkPermission('new-owner', 'new-repo')
    old.resolve('admin')
    expect(await pending).toBe('none')
    expect(store.permissionLevel).toBe('read')
    expect(store.permissionChecked).toBe(true)
    expect(store.canUpload).toBe(false)
  })

  it('换账号后旧token请求不能覆盖新账号权限', async () => {
    const store = login()
    const old = deferred()
    githubService.checkRepoAccess.mockReturnValueOnce(old.promise).mockResolvedValueOnce('none')
    const pending = store.checkPermission('owner', 'repo')
    store.setToken('token-b')
    store.setUser({ id: 2, login: 'account-b' })
    await store.checkPermission('owner', 'repo')
    old.resolve('admin')
    expect(await pending).toBe('none')
    expect(store.permissionLevel).toBe('none')
  })

  it('失效权限时保留登录身份且阻止尚未完成的旧检查写回', async () => {
    const store = login()
    const old = deferred()
    githubService.checkRepoAccess.mockReturnValue(old.promise)
    const pending = store.checkPermission('owner', 'repo')
    store.invalidatePermission()
    old.resolve('admin')
    await pending
    expect(store).toMatchObject({
      token: 'token-a',
      user: { id: 1 },
      permissionLevel: 'none',
      permissionChecked: false
    })
  })

  it('旧token验证晚到401不能退出后来登录的新身份', async () => {
    const store = login()
    const old = deferred()
    githubService.getCurrentUser.mockReturnValue(old.promise)
    const pending = store.validateToken()
    store.setToken('token-b')
    store.setUser({ id: 2, login: 'account-b' })
    old.reject({ status: 401 })
    expect(await pending).toBe(false)
    expect(store.token).toBe('token-b')
    expect(store.user.id).toBe(2)
  })

  it('当前token验证401仍清除登录', async () => {
    const store = login()
    githubService.getCurrentUser.mockRejectedValue({ type: 'TOKEN_EXPIRED' })
    expect(await store.validateToken()).toBe(false)
    expect(store.token).toBeNull()
    expect(store.user).toBeNull()
    expect(store.permissionChecked).toBe(false)
  })

  it('旧token验证成功也不能覆盖后来登录的账号信息', async () => {
    const store = login()
    const old = deferred()
    githubService.getCurrentUser.mockReturnValue(old.promise)
    const pending = store.validateToken()
    store.setToken('token-b')
    store.setUser({ id: 2, login: 'account-b' })
    old.resolve({ id: 1, login: 'old-account' })
    expect(await pending).toBe(false)
    expect(store.user).toMatchObject({ id: 2, login: 'account-b' })
  })
})
