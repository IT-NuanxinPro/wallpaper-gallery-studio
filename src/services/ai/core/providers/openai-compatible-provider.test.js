import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Sub2apiProvider } from './openai-compatible-provider'

const apiKey = 'test-secret-session-key'
const request = {
  imageBase64: 'data:image/png;base64,test',
  prompt: '分类',
  credentials: { apiKey, model: 'gpt-6.1-sol' }
}
const response = content => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] })
})

beforeEach(() =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ secondary: '科技', third: '' })))
)
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('当前会话的模型请求', () => {
  it('使用当前会话地址和Key，且旧model参数不能调用其他模型', async () => {
    await new Sub2apiProvider({ baseUrl: 'https://default.example/v1' }).analyze({
      ...request,
      credentials: { apiKey, model: 'grok-4.6', baseUrl: 'https://session.example/custom/v1/' }
    })
    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe('https://session.example/custom/v1/chat/completions')
    expect(options.headers.Authorization).toBe(`Bearer ${apiKey}`)
    expect(JSON.parse(options.body).model).toBe('gpt-6.1-sol')
  })

  it('没有手填Key时不读取环境Key并阻止请求', async () => {
    vi.stubEnv('VITE_SUB2API_API_KEY', 'environment-secret')
    await expect(
      new Sub2apiProvider().analyze({ ...request, credentials: { model: 'gpt-6.1-sol' } })
    ).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('服务端错误和网络异常不会把Key写入错误或日志', async () => {
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {})
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: apiKey } }),
      text: async () => apiKey
    })
    await expect(new Sub2apiProvider().analyze(request)).rejects.not.toThrow(apiKey)
    fetch.mockRejectedValueOnce(new Error(`network failed ${apiKey}`))
    await expect(new Sub2apiProvider().analyze(request)).rejects.not.toThrow(apiKey)
    expect(JSON.stringify(logger.mock.calls)).not.toContain(apiKey)
  })

  it('丢弃原始响应并屏蔽服务端在结果中回显的Key', async () => {
    fetch.mockResolvedValueOnce(
      response({ secondary: '科技', description: apiKey, keywords: [apiKey] })
    )
    const result = await new Sub2apiProvider().analyze(request)
    expect(JSON.stringify(result)).not.toContain(apiKey)
    expect(result).not.toHaveProperty('raw')
  })

  it('JSON 转义的Key回显同样不会进入业务结果', async () => {
    const content = JSON.stringify({ description: apiKey }).replaceAll('-', '\\u002d')
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content } }] })
    })
    const result = await new Sub2apiProvider().analyze(request)
    expect(JSON.stringify(result)).not.toContain(apiKey)
  })

  it('嵌套对象字段名和字段值中的Key都不会进入业务结果', async () => {
    const content = JSON.stringify({
      secondary: '科技',
      reasoning: { [apiKey]: { explanation: apiKey, normal: '保留结果' } },
      keywords: [{ nested: [{ [`prefix-${apiKey}`]: apiKey }] }],
      new_category_proposal: { reason: { [apiKey]: '分类依据' } }
    }).replaceAll('-', '\\u002d')
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content } }] })
    })
    const result = await new Sub2apiProvider().analyze(request)
    expect(JSON.stringify(result)).not.toContain(apiKey)
    expect(result.reasoning).toEqual({
      '[已隐藏]': { explanation: '[已隐藏]', normal: '保留结果' }
    })
    expect(result.keywords).toEqual([{ nested: [{ 'prefix-[已隐藏]': '[已隐藏]' }] }])
    expect(result.new_category_proposal).toEqual({ reason: { '[已隐藏]': '分类依据' } })
  })

  it('已清除的会话不会发起请求', async () => {
    const controller = new globalThis.AbortController()
    controller.abort()
    await expect(
      new Sub2apiProvider().analyze({
        ...request,
        credentials: { ...request.credentials, signal: controller.signal }
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('凭据清除中止在途请求并返回可识别的取消状态', async () => {
    const controller = new globalThis.AbortController()
    fetch.mockImplementationOnce(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () =>
            reject(new globalThis.DOMException('abort', 'AbortError'))
          )
        })
    )
    const pending = new Sub2apiProvider().analyze({
      ...request,
      credentials: { ...request.credentials, signal: controller.signal }
    })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
