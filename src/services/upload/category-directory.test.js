import { Buffer } from 'node:buffer'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { githubService } from '@/services/github'
import { useConfigStore } from '@/stores/config'
import {
  clearUploadCategoryTreeCache,
  getUploadCategoryNodes,
  getUploadCategoryTree
} from './category-directory'
import { buildPromptWithLatestCategories } from '@/services/ai/classifier/prompts'

const notFound = { status: 404, type: 'NOT_FOUND' }
const gitTree = (...paths) => ({
  truncated: false,
  tree: paths.map(path => ({ type: 'tree', path: `wallpaper/${path}` }))
})

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  useConfigStore().setConfig({ owner: 'owner', repo: 'images', branch: 'main' })
  clearUploadCategoryTreeCache()
  vi.spyOn(githubService, 'getTree').mockResolvedValue(gitTree('desktop/动漫/新作品'))
  vi.spyOn(githubService, 'getContents').mockRejectedValue(notFound)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => vi.restoreAllMocks())

describe('远程分类同步', () => {
  it('合并 UTF-8 清单和实际新目录，树和提示词包含相同候选', async () => {
    const manifest = {
      categories: {
        desktop: [
          { label: '动漫', children: [{ label: '预设作品' }] },
          { label: '预留分类', children: [] }
        ]
      }
    }
    githubService.getContents.mockResolvedValue({
      content: Buffer.from(JSON.stringify(manifest)).toString('base64')
    })
    const tree = await getUploadCategoryTree()
    expect(tree.desktop.secondary).toEqual(expect.arrayContaining(['动漫', '预留分类']))
    expect(tree.desktop.third['动漫']).toEqual(expect.arrayContaining(['新作品', '预设作品']))
    expect(tree.desktop.secondary).not.toContain('风景')
    const nodes = await getUploadCategoryNodes('desktop', '动漫')
    expect(nodes.map(node => node.path)).toContain('wallpaper/desktop/动漫/新作品')
    const prompt = await buildPromptWithLatestCategories('default', 'desktop')
    expect(prompt).toContain('新作品')
    expect(prompt).toContain('预设作品')
    expect(githubService.getTree).toHaveBeenCalledTimes(1)
  })

  it('新增目录清缓存后立即进入下一次分析，删除目录也不会残留', async () => {
    await getUploadCategoryTree()
    githubService.getTree.mockResolvedValue(gitTree('desktop/科技/机器人'))
    clearUploadCategoryTreeCache()
    const prompt = await buildPromptWithLatestCategories('default', 'desktop')
    expect(prompt).toContain('科技：机器人')
    expect(prompt).not.toContain('新作品')
  })

  it('按仓库和分支隔离缓存', async () => {
    await getUploadCategoryTree()
    useConfigStore().setConfig({ repo: 'another', branch: 'feature/new' })
    githubService.getTree.mockResolvedValue(gitTree('mobile/游戏/新游戏'))
    const tree = await getUploadCategoryTree()
    expect(tree.mobile.third['游戏']).toEqual(['新游戏'])
    expect(tree.desktop.secondary).toEqual([])
    expect(githubService.getTree).toHaveBeenLastCalledWith('owner', 'another', 'feature/new')
  })

  it('并发分析共用请求，返回副本；强制刷新和过期缓存会重新读取', async () => {
    const [first, second] = await Promise.all([getUploadCategoryTree(), getUploadCategoryTree()])
    first.desktop.secondary.push('本地修改')
    expect(second.desktop.secondary).not.toContain('本地修改')
    expect(githubService.getTree).toHaveBeenCalledTimes(1)
    await getUploadCategoryTree({ force: true })
    expect(githubService.getTree).toHaveBeenCalledTimes(2)
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 5 * 60 * 1000 + 1)
    await getUploadCategoryTree()
    expect(githubService.getTree).toHaveBeenCalledTimes(3)
  })

  it('刷新前的慢请求不能覆盖刷新后的分类缓存', async () => {
    let finishOld
    githubService.getTree.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finishOld = resolve
        })
    )
    const oldRequest = getUploadCategoryTree()
    clearUploadCategoryTreeCache()
    githubService.getTree.mockResolvedValue(gitTree('desktop/科技/机器人'))
    await getUploadCategoryTree()
    finishOld(gitTree('desktop/旧分类'))
    await oldRequest
    expect((await getUploadCategoryTree()).desktop.secondary).toEqual(['科技'])
  })

  it('Git 树截断时逐层读取，忽略图片和更深的非分类目录', async () => {
    githubService.getTree.mockResolvedValue({ truncated: true, tree: [] })
    githubService.getContents.mockImplementation(async (_owner, _repo, path) => {
      if (path === 'wallpaper/desktop')
        return [
          { type: 'dir', name: '科技' },
          { type: 'file', name: '封面.jpg' }
        ]
      if (path === 'wallpaper/desktop/科技') return [{ type: 'dir', name: '机器人' }]
      throw notFound
    })
    expect((await getUploadCategoryTree()).desktop).toEqual({
      secondary: ['科技'],
      third: { 科技: ['机器人'] }
    })
  })

  it('远程失败使用本地兜底但不缓存成最新数据，下次恢复后重试', async () => {
    githubService.getTree.mockRejectedValueOnce(new Error('offline'))
    githubService.getContents.mockRejectedValue(new Error('offline'))
    expect((await getUploadCategoryTree()).desktop.secondary).toContain('风景')
    githubService.getContents.mockRejectedValue(notFound)
    const recovered = await getUploadCategoryTree()
    expect(recovered.desktop.secondary).toEqual(['动漫'])
    expect(githubService.getTree).toHaveBeenCalledTimes(2)
  })
})
