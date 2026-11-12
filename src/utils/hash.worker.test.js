// @vitest-environment node
import { webcrypto } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('文件哈希 Worker', () => {
  it.each([
    ['安全上下文', webcrypto],
    ['局域网 HTTP', {}]
  ])('%s 的 Worker 返回相同的标准哈希，并关联正确任务', async (_name, crypto) => {
    const replies = []
    vi.stubGlobal('crypto', crypto)
    vi.stubGlobal('onmessage', undefined)
    vi.stubGlobal('postMessage', message => replies.push(message))
    await import('./hash.worker')
    await Promise.all([
      globalThis.onmessage({ data: { id: 'empty', fileData: new ArrayBuffer(0) } }),
      globalThis.onmessage({
        data: { id: 'abc', fileData: new Uint8Array([97, 98, 99]).buffer }
      })
    ])
    expect(replies).toEqual(
      expect.arrayContaining([
        {
          id: 'empty',
          success: true,
          hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        },
        {
          id: 'abc',
          success: true,
          hash: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
        }
      ])
    )
    expect(replies).toHaveLength(2)
  })
})
