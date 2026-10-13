import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getUploadCategoryTree } from '@/services/upload/category-directory'
import { buildPrompt, buildPromptWithLatestCategories, previewPrompt } from './prompts'

vi.mock('@/services/upload/category-directory', () => ({ getUploadCategoryTree: vi.fn() }))

const categories = {
  desktop: { secondary: ['科技', '动漫', '极简'], third: { 科技: ['机器人'], 动漫: ['新作品$&'] } },
  mobile: { secondary: ['游戏'], third: { 游戏: ['远程新游戏'] } },
  avatar: { secondary: ['IP形象'], third: { IP形象: ['远程新角色'] } }
}

beforeEach(() => {
  vi.clearAllMocks()
  getUploadCategoryTree.mockResolvedValue(categories)
})

describe('动态分类提示词', () => {
  it.each(['desktop', 'mobile', 'avatar'])(
    '所有 %s 模板使用同一批分类且约束父子关系',
    async series => {
      for (const provider of ['sub2api', 'cloudflare']) {
        const prompt = await buildPromptWithLatestCategories('default', series, '', provider)
        for (const name of categories[series].secondary) expect(prompt).toContain(name)
        for (const names of Object.values(categories[series].third)) {
          for (const name of names) expect(prompt).toContain(name)
        }
        expect(prompt).toContain('禁止跨父分类拼接')
        expect(prompt).not.toContain('动漫/二次元')
        expect(prompt).not.toContain('{{thirdHints}}')
      }
    }
  )

  it('无三级分类使用空字符串说明，特殊字符不会被替换语法吞掉', async () => {
    const prompt = await buildPromptWithLatestCategories('default', 'desktop')
    expect(prompt).toContain('极简：（无三级分类，third 返回空字符串）')
    expect(prompt).toContain('新作品$&')
  })

  it('自定义提示词可重复引用动态变量，原有纯文本保持不变', async () => {
    const custom =
      '请分析 {{ primaryCategory }}：{{secondaryList}}\n{{ thirdHints }}\n{{secondaryList}}'
    const prompt = await buildPromptWithLatestCategories('custom', 'desktop', custom)
    expect(prompt).toContain('请分析 desktop：科技、动漫、极简')
    expect(prompt).toContain('新作品$&')
    expect(prompt.match(/科技、动漫、极简/g)).toHaveLength(2)
    expect(buildPrompt('custom', 'desktop', '这是我的自定义分析要求')).toBe(
      '这是我的自定义分析要求'
    )
  })

  it('仅命名和无分类变量的自定义模板不请求远程目录', async () => {
    await buildPromptWithLatestCategories('filenameOnly', 'desktop')
    await buildPromptWithLatestCategories('custom', 'desktop', '仅描述 {{primaryCategory}} 图片')
    expect(getUploadCategoryTree).not.toHaveBeenCalled()
  })

  it('预览与实际发送内容一致，支持强制刷新和对应 Provider 模板', async () => {
    const preview = await previewPrompt('default', 'mobile', '', 'cloudflare', { force: true })
    expect(getUploadCategoryTree).toHaveBeenLastCalledWith({ force: true })
    expect(preview.success).toBe(true)
    expect(preview.prompt).toBe(
      await buildPromptWithLatestCategories('default', 'mobile', '', 'cloudflare')
    )
  })
})
