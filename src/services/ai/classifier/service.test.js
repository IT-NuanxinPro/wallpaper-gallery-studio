import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AIProviderFactory } from '../core'
import { getUploadCategoryTree } from '@/services/upload/category-directory'
import { analyzeImage } from './service'
import { CloudflareProvider } from '../core/providers/cloudflare-provider'
import { OpenAICompatibleProvider } from '../core/providers/openai-compatible-provider'

vi.mock('@/services/upload/category-directory', () => ({ getUploadCategoryTree: vi.fn() }))

beforeEach(() => {
  vi.restoreAllMocks()
  getUploadCategoryTree.mockResolvedValue({
    desktop: { secondary: ['科技'], third: { 科技: ['机器人'] } }
  })
})

describe('上传分析的实际 Provider 请求', () => {
  it('Cloudflare 从 Markdown 后的结构化结果读取分类，保留无三级的空值', () => {
    const data = { secondary: '科技', third: '', filenames: ['月光照亮的银色机器人.jpg'] }
    const response = new CloudflareProvider().parseResponse({
      result: { response: `### 分类结果\n科技\n\n\`\`\`json\n${JSON.stringify(data)}\n\`\`\`` }
    })
    expect(response).toMatchObject({ secondary: '科技', third: '' })
  })

  it('OpenAI 兼容 Provider 不再把无三级分类填成通用', () => {
    const response = new OpenAICompatibleProvider().parseResponse({
      choices: [{ message: { content: JSON.stringify({ secondary: '科技', third: '' }) } }]
    })
    expect(response).toMatchObject({ secondary: '科技', third: '' })
  })

  it('将最新目录注入 Provider 提示词并返回所选新分类', async () => {
    const analyze = vi.fn().mockResolvedValue({ secondary: '科技', third: '机器人' })
    vi.spyOn(AIProviderFactory, 'create').mockReturnValue({ analyze })
    const result = await analyzeImage({
      imageBase64: 'data:image/png;base64,test',
      series: 'desktop',
      providerType: 'sub2api',
      credentials: { apiKey: 'test' },
      modelKey: 'sub2api-grok-4.6'
    })
    expect(analyze).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('科技：机器人')
      })
    )
    expect(result).toMatchObject({ secondary: '科技', third: '机器人' })
  })
})
