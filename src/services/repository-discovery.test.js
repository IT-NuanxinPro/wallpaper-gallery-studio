import { afterEach, expect, it, vi } from 'vitest'
import { fetchRepositories } from './repository-discovery'
afterEach(() => vi.unstubAllGlobals())
it('获取账号本人、协作与组织仓库，只返回选择所需字段和默认分支', async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    headers: new globalThis.Headers({
      Link: '<https://api.github.com/user/repos?page=2>; rel="next"'
    }),
    json: async () => [
      {
        id: 1,
        name: 'wallpapers',
        owner: { login: 'team' },
        default_branch: 'release',
        permissions: { push: true },
        private: true,
        clone_url: 'unused'
      },
      {
        id: 2,
        name: 'archived',
        owner: { login: 'me' },
        permissions: { admin: true },
        archived: true
      }
    ]
  })
  vi.stubGlobal('fetch', fetch)
  const result = await fetchRepositories({ token: 'dummy-github-token' })
  expect(new URL(fetch.mock.calls[0][0]).searchParams.get('affiliation')).toContain(
    'organization_member'
  )
  expect(result).toEqual({
    repositories: [
      {
        id: 1,
        name: 'wallpapers',
        owner: 'team',
        fullName: 'team/wallpapers',
        defaultBranch: 'release',
        permission: 'write',
        private: true,
        archived: false
      },
      {
        id: 2,
        name: 'archived',
        owner: 'me',
        fullName: 'me/archived',
        defaultBranch: 'main',
        permission: 'admin',
        private: false,
        archived: true
      }
    ],
    hasMore: true
  })
})
it('失败正文不读，不向用户回显token', async () => {
  const json = vi.fn()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json }))
  await expect(fetchRepositories({ token: 'secret' })).rejects.toThrow('重新登录')
  expect(json).not.toHaveBeenCalled()
})
it('取消后的迟到数据不会进入仓库选择列表', async () => {
  const controller = new globalThis.AbortController()
  let resolve
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(done => (resolve = done)))
  )
  const pending = fetchRepositories({ token: 'test', signal: controller.signal })
  controller.abort()
  resolve({ ok: true, json: async () => [], headers: new globalThis.Headers() })
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
})
