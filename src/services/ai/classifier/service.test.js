import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AIProviderFactory } from '../core'
import { getUploadCategoryTree } from '@/services/upload/category-directory'
import { analyzeImage } from './service'
import { OpenAICompatibleProvider } from '../core/providers/openai-compatible-provider'

vi.mock('@/services/upload/category-directory', () => ({ getUploadCategoryTree: vi.fn() }))

beforeEach(() => {
  vi.restoreAllMocks()
  getUploadCategoryTree.mockResolvedValue({
    desktop: { secondary: ['科技'], third: { 科技: ['机器人'] } }
  })
})

describe('上传分析的实际 Provider 请求', () => {
  it('缺少模型时不调用分类Provider', async () => {
    const analyze = vi.fn()
    vi.spyOn(AIProviderFactory, 'create').mockReturnValue({ analyze })
    await expect(
      analyzeImage({
        imageBase64: 'data:image/png;base64,test',
        series: 'desktop',
        credentials: { apiKey: 'test' }
      })
    ).rejects.toThrow('模型')
    expect(analyze).not.toHaveBeenCalled()
  })

  it('OpenAI 兼容 Provider 不再把无三级分类填成通用', () => {
    const response = new OpenAICompatibleProvider().parseResponse({
      choices: [{ message: { content: JSON.stringify({ secondary: '科技', third: '' }) } }]
    })
    expect(response).toMatchObject({ secondary: '科技', third: '' })
  })

  it.each(['vision-alpha', 'vendor/vision-beta'])(
    '最新目录和当前会话模型 %s 一起传给Provider',
    async model => {
      const analyze = vi.fn().mockResolvedValue({ secondary: '科技', third: '机器人' })
      vi.spyOn(AIProviderFactory, 'create').mockReturnValue({ analyze })
      const result = await analyzeImage({
        imageBase64: 'data:image/png;base64,test',
        series: 'desktop',
        providerType: 'sub2api',
        credentials: { apiKey: 'test', model },
        modelKey: 'old-model-ignored'
      })
      expect(analyze).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('科技：机器人'),
          credentials: expect.objectContaining({ model })
        })
      )
      expect(result).toMatchObject({ secondary: '科技', third: '机器人', meta: { model } })
    }
  )
})
