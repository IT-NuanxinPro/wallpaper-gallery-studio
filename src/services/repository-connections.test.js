import { describe, expect, it, vi } from 'vitest'
import { discoverRepositoryConnections } from './repository-connections'
const config = { owner: 'team', repo: 'images', branch: 'main' }
const repo = name => ({
  id: name,
  owner: 'team',
  name,
  fullName: 'team/' + name,
  defaultBranch: 'main'
})
function fixture(
  files = {},
  repos = [repo('wallpaper-gallery-workflow'), repo('wallpaper-gallery')]
) {
  return {
    config,
    token: 'token',
    list: vi.fn(async () => ({ repositories: repos, hasMore: false })),
    read: vi.fn(async (owner, name, path) => {
      const key = name + '/' + path
      if (!(key in files)) return null
      return files[key]
    })
  }
}
describe('仓库关联识别', () => {
  it('注释中的旧仓库引用不能建立关联，动态表达式保持未识别', async () => {
    const f = fixture({
      'wallpaper-gallery-workflow/.github/workflows/process-wallpapers.yml':
        '# IMAGE_REPO: team/images\nenv:\n  IMAGE_REPO: team/other',
      'wallpaper-gallery/.github/workflows/deploy.yml': 'run: node scripts/prepare-deploy-data.js',
      'wallpaper-gallery/scripts/prepare-deploy-data.js':
        "// repository = 'team/images'\nconst repository = 'team/other'"
    })
    expect((await discoverRepositoryConnections(f)).connections).toEqual({})
    f.read.mockImplementation(async (owner, name, path) =>
      path.endsWith('process-wallpapers.yml')
        ? "IMAGE_REPO: ${{ vars.DATA_REPO || 'team/images' }}"
        : null
    )
    expect((await discoverRepositoryConnections(f)).connections).toEqual({})
  })
  it('依据实际数据仓库引用关联工作流与网站，不靠名称直接写入', async () => {
    const f = fixture({
      'wallpaper-gallery-workflow/.github/workflows/process-wallpapers.yml':
        'on: repository_dispatch\nenv:\n  IMAGE_REPO: team/images',
      'wallpaper-gallery/.github/workflows/deploy.yml': 'run: node scripts/prepare-deploy-data.js',
      'wallpaper-gallery/scripts/prepare-deploy-data.js': "repository = 'team/images'"
    })
    expect((await discoverRepositoryConnections(f)).connections).toEqual({
      workflowOwner: 'team',
      workflowRepo: 'wallpaper-gallery-workflow',
      frontendOwner: 'team',
      frontendRepo: 'wallpaper-gallery'
    })
  })
  it('同名但指向其他数据仓库不关联，已有手工配置不覆盖', async () => {
    const f = fixture({
      'wallpaper-gallery-workflow/.github/workflows/process-wallpapers.yml':
        'IMAGE_REPO: team/other'
    })
    expect((await discoverRepositoryConnections(f)).connections).toEqual({})
    f.config = {
      ...config,
      workflowOwner: 'manual',
      workflowRepo: 'custom',
      frontendOwner: 'manual',
      frontendRepo: 'site'
    }
    expect((await discoverRepositoryConnections(f)).connections).toEqual({})
  })
  it('多个匹配候选保留选择，不擅自决定', async () => {
    const f = fixture(
      {
        'pipeline-one/.github/workflows/process-wallpapers.yml': 'IMAGE_REPO: team/images',
        'pipeline-two/.github/workflows/process-wallpapers.yml': 'IMAGE_REPO: team/images'
      },
      [repo('pipeline-one'), repo('pipeline-two')]
    )
    const result = await discoverRepositoryConnections(f)
    expect(result.connections).toEqual({})
    expect(result.candidates.workflow).toHaveLength(2)
  })
  it('显式关联清单支持非标准名称，验证可访问仓库；不复制服务地址', async () => {
    const f = fixture(
      {
        'images/.studio/repositories.json': JSON.stringify({
          version: 1,
          data: { owner: 'team', repo: 'images' },
          workflow: { owner: 'team', repo: 'processor' },
          frontend: { owner: 'team', repo: 'website' },
          videoApiUrl: 'https://untrusted.test'
        })
      },
      [repo('processor'), repo('website')]
    )
    expect((await discoverRepositoryConnections(f)).connections).toEqual({
      workflowOwner: 'team',
      workflowRepo: 'processor',
      frontendOwner: 'team',
      frontendRepo: 'website'
    })
  })
  it('仓库列表分页完整后才判断唯一，取消后不接受迟到结果', async () => {
    const f = fixture()
    f.list
      .mockResolvedValueOnce({ repositories: [repo('pipeline-one')], hasMore: true })
      .mockResolvedValueOnce({ repositories: [repo('pipeline-two')], hasMore: false })
    await discoverRepositoryConnections(f)
    expect(f.list).toHaveBeenCalledTimes(2)
    const controller = new globalThis.AbortController()
    controller.abort()
    await expect(
      discoverRepositoryConnections({ ...f, signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
