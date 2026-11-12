import { File } from 'node:buffer'
import { createHash } from 'node:crypto'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUploadStore } from './upload'
import { hashWorker } from '@/utils/hashWorker'
import { previewManager } from '@/utils/previewManager'

// 本组验证文件入列与重复检测，不触发外部模型调用。
vi.mock('./credentials', () => ({
  useCredentialsStore: () => ({ hasCredentials: false })
}))

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  vi.stubGlobal('crypto', {})
  vi.spyOn(hashWorker, 'computeHash').mockRejectedValue(new Error('Worker unavailable'))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('局域网 HTTP 的文件哈希与入列', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad']
  ])('缺少 Web Crypto 时仍返回标准 SHA-256：%s', async (content, expected) => {
    const hash = await useUploadStore().computeFileHash(new File([content], 'sample.png'))
    expect(hash).toBe(expected)
  })

  it('二进制文件在不同浏览器能力下使用同一种内容哈希', async () => {
    const bytes = Uint8Array.from({ length: 262145 }, (_, index) => index % 251)
    const expected = createHash('sha256').update(bytes).digest('hex')
    const hash = await useUploadStore().computeFileHash(new File([bytes], 'binary.png'))
    expect(hash).toBe(expected)
  })

  it('AI 模式选图后正常加入列表，保留内容哈希用于缓存和重复检测', async () => {
    vi.spyOn(previewManager, 'createPreview').mockReturnValue('blob:test-preview')
    const store = useUploadStore()
    const files = [
      new File(['abc'], 'first.png', { type: 'image/png' }),
      new File(['abc'], 'same-content.png', { type: 'image/png' }),
      new File(['different'], 'different.png', { type: 'image/png' })
    ]
    await store.addFiles(files)
    expect(store.files.map(file => file.name)).toEqual(files.map(file => file.name))
    expect(store.files[0].fileHash).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
    expect(store.files[1].fileHash).toBe(store.files[0].fileHash)
    expect(store.files[2].fileHash).not.toBe(store.files[0].fileHash)
  })
})
