import { afterEach, describe, expect, it, vi } from 'vitest'
import { ZhipuProvider } from './zhipu-provider'

afterEach(() => vi.unstubAllGlobals())

describe('GLM 上传图片分析', () => {
  it('使用调用方的输出预算，为思考和最终分类都保留空间', async () => {
    let payload
    vi.stubGlobal('fetch', async (_url, options) => {
      payload = JSON.parse(options.body)
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: '<think>观察图片</think><answer>{"secondary":"动漫","third":""}</answer>'
              }
            }
          ]
        })
      }
    })
    const result = await new ZhipuProvider().requestAnalysis({
      imageBase64: 'data:image/png;base64,test',
      prompt: '分析图片',
      apiKey: 'test',
      model: 'glm-4.1v-thinking-flash',
      maxTokens: 8192,
      temperature: 0.3
    })
    expect(payload.max_tokens).toBe(8192)
    expect(payload.temperature).toBe(0.3)
    expect(result).toMatchObject({ secondary: '动漫', third: '' })
  })

  it('明确报告被输出额度截断的响应，不把部分 JSON 当作成功结果', () => {
    expect(() =>
      new ZhipuProvider().parseResponse({
        choices: [{ finish_reason: 'length', message: { content: '{"secondary":"动漫"}' } }]
      })
    ).toThrow(/截断/)
  })
})
