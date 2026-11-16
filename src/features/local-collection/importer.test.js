import { describe, expect, it, vi } from 'vitest'
import { importCollectorBatch } from './importer'
const digest = 'a'.repeat(64)
function fixture() {
  const batch = {
    id: 'batch-a',
    series: 'desktop',
    status: 'ready',
    items: [
      { sourceItemId: 'one', sha256: digest, filename: 'one.jpg' },
      { sourceItemId: 'two', sha256: digest, filename: 'two.jpg' }
    ]
  }
  const api = {
    health: async () => ({ collectorId: 'local' }),
    reserveImport: async () => ({ batch }),
    image: vi.fn(async () => new Blob(['image'], { type: 'image/jpeg' }))
  }
  const files = []
  const upload = {
    files,
    validateFile: () => ({ valid: true }),
    setSeries: vi.fn(),
    addFiles: vi.fn(async input => {
      const added = input.map(file => ({ id: file.name, file, localSource: file.localSource }))
      files.push(...added)
      return added
    })
  }
  return { batch, api, upload, hash: vi.fn(async () => digest), assertCurrent: () => {} }
}
describe('本地批次导入', () => {
  it('关联其他仓库的批次在读取图片前拒绝导入', async () => {
    const f = fixture()
    f.batch.studio = { repository: { owner: 'owner', repo: 'original', branch: 'main' } }
    await expect(
      importCollectorBatch('batch-a', {
        ...f,
        repository: { owner: 'owner', repo: 'other', branch: 'main' }
      })
    ).rejects.toThrow('其他仓库')
    expect(f.api.image).not.toHaveBeenCalled()
  })

  it('顺序导入并附来源，重复导入不复制，已核验条目跳过', async () => {
    const f = fixture()
    f.batch.studio = { receipts: { one: { sourceSha256: digest } } }
    const first = await importCollectorBatch('batch-a', f)
    expect(first).toEqual({ added: 1, skipped: 1 })
    expect(f.upload.files[0].localSource).toEqual({
      collectorId: 'local',
      batchId: 'batch-a',
      sourceItemId: 'two',
      sha256: digest
    })
    expect(await importCollectorBatch('batch-a', f)).toEqual({ added: 0, skipped: 2 })
    expect(f.api.image).toHaveBeenCalledTimes(1)
  })
  it('源哈希变化或仓库切换时不添加图片', async () => {
    const f = fixture()
    f.hash.mockResolvedValue('different')
    await expect(importCollectorBatch('batch-a', f)).rejects.toThrow('内容已变化')
    expect(f.upload.addFiles).not.toHaveBeenCalled()
    f.hash.mockResolvedValue(digest)
    f.assertCurrent = () => {
      throw new Error('仓库已切换')
    }
    await expect(importCollectorBatch('batch-a', f)).rejects.toThrow('仓库已切换')
    expect(f.api.image).toHaveBeenCalledTimes(1)
  })
  it('不支持图片及取消保留本地原图，整批无删除请求', async () => {
    const f = fixture()
    f.upload.validateFile = () => ({ valid: false, error: '超过 25MB' })
    await expect(importCollectorBatch('batch-a', f)).rejects.toThrow('25MB')
    expect(f.upload.addFiles).not.toHaveBeenCalled()
    const controller = new globalThis.AbortController()
    controller.abort()
    await expect(
      importCollectorBatch('batch-a', { ...fixture(), signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
