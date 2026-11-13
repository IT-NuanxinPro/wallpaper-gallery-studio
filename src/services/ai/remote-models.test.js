import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRemoteModels } from './remote-models'

const config = { apiKey: 'private-test-key', baseUrl: 'https://gateway.example/v1/' }
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('远程模型列表', () => {
  it('普通HTTP网关直接请求models，不再强制HTTPS', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'vision-http' }] })
    })
    vi.stubGlobal('fetch', fetch)
    expect(
      await fetchRemoteModels({ ...config, baseUrl: 'http://gateway.example:8080/v1' })
    ).toEqual([{ id: 'vision-http' }])
    expect(fetch.mock.calls[0][0]).toBe('http://gateway.example:8080/v1/models')
  })
  it('请求当前地址models并只接收去重的合法id，不保留额外字段', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'vision-b', owned_by: config.apiKey },
          { id: 'vision-a' },
          { id: 'vision-a' },
          { id: 'bad id' },
          { id: '' },
          { id: config.apiKey },
          { name: 'not-a-model' }
        ]
      })
    })
    vi.stubGlobal('fetch', fetch)
    expect(await fetchRemoteModels(config)).toEqual([{ id: 'vision-a' }, { id: 'vision-b' }])
    expect(fetch).toHaveBeenCalledWith(
      'https://gateway.example/v1/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer private-test-key', Accept: 'application/json' },
        redirect: 'error',
        cache: 'no-store'
      })
    )
  })

  it.each([401, 403, 404, 429, 500])(
    'HTTP %s只显示安全提示，不读取可能回显Key的正文',
    async status => {
      const body = vi.fn(() => config.apiKey)
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: false, status, text: body, json: body })
      )
      await expect(fetchRemoteModels(config)).rejects.not.toThrow(config.apiKey)
      expect(body).not.toHaveBeenCalled()
    }
  )

  it.each([{ data: [] }, { error: { message: 'private-test-key' } }])(
    '拒绝空或错误格式的列表',
    async body => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }))
      await expect(fetchRemoteModels(config)).rejects.not.toThrow(config.apiKey)
    }
  )

  it('外部取消后即使旧请求返回也不能使用其模型列表', async () => {
    const controller = new globalThis.AbortController()
    let resolve
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise(done => {
            resolve = done
          })
      )
    )
    const request = fetchRemoteModels({ ...config, signal: controller.signal })
    controller.abort()
    resolve({ ok: true, json: async () => ({ data: [{ id: 'old-model' }] }) })
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('超时错误不泄露网络异常正文', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, { signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error(config.apiKey)))
          })
      )
    )
    const request = fetchRemoteModels({ ...config, timeoutMs: 20 })
    const rejection = expect(request).rejects.toThrow('超时')
    await vi.advanceTimersByTimeAsync(21)
    await rejection
  })
})
