import { describe, expect, it, vi } from 'vitest'
import { createReceiptQueue } from './receipts'
const source = {
  collectorId: 'local',
  batchId: 'batch',
  sourceItemId: 'one',
  sha256: 'a'.repeat(64)
}
const file = {
  localSource: source,
  fileHash: 'b'.repeat(64),
  uploadedPath: 'wallpaper/desktop/a.jpg',
  uploadedRepository: { owner: 'owner', repo: 'data', branch: 'main' }
}
const metadata = { success: true, path: 'metadata-pending/a.json', commitSha: 'c'.repeat(40) }
const storage = () => {
  const data = {}
  return {
    get length() {
      return Object.keys(data).length
    },
    key: i => Object.keys(data)[i],
    getItem: k => data[k],
    setItem: (k, v) => {
      data[k] = v
    },
    removeItem: k => {
      delete data[k]
    },
    data
  }
}
describe('本地上传回执', () => {
  it('未登录或连接了其他采集目录时保留本次删除待办，不误报已删除', async () => {
    const removed = { ...file, status: 'pending', uploadedPath: null }
    const queue = createReceiptQueue({
      storage: storage(),
      api: { health: async () => ({ collectorId: 'other' }) }
    })
    queue.discard([removed])
    await queue.flush()
    expect(queue.pendingDiscards([removed])).toBe(true)
    await queue.flush({ token: 'token' })
    expect(queue.pendingDiscards([removed])).toBe(true)
    expect(queue.pendingDiscards([{ localSource: { ...source, sourceItemId: 'unrelated' } }])).toBe(
      false
    )
  })
  it('移除未上传图片持久记录整批舍弃身份，已上传或待补元数据不视为舍弃', async () => {
    const cache = storage()
    const api = {
      health: async () => ({ collectorId: 'local' }),
      discard: vi.fn(async () => ({ ok: true }))
    }
    const queue = createReceiptQueue({ storage: cache, api })
    queue.discard([
      { ...file, status: 'pending', uploadedPath: null },
      { ...file, status: 'success' }
    ])
    const restored = createReceiptQueue({ storage: cache, api })
    await restored.flush({ token: 'token' })
    expect(api.discard).toHaveBeenCalledExactlyOnceWith(
      { batchId: 'batch', collectorId: 'local', items: ['one'], confirmed: true },
      'token'
    )
  })
  it('回传进行中追加的舍弃操作也会送达，不滞留到下一次打开页面', async () => {
    let finish
    const api = {
      health: async () => ({ collectorId: 'local' }),
      receipt: vi.fn(
        () =>
          new Promise(resolve => {
            finish = resolve
          })
      ),
      discard: vi.fn(async () => ({ ok: true }))
    }
    const queue = createReceiptQueue({ storage: storage(), api })
    queue.enqueue([file], metadata)
    const pending = queue.flush({ token: 'token' })
    await vi.waitFor(() => expect(api.receipt).toHaveBeenCalled())
    queue.discard([
      {
        ...file,
        uploadedPath: null,
        status: 'pending',
        localSource: { ...source, sourceItemId: 'two' }
      }
    ])
    finish({ ok: true })
    expect((await pending).pending).toBe(0)
    expect(api.discard).toHaveBeenCalledTimes(1)
  })
  it('只在元数据提交成功后记录，记录压缩前后哈希且不持久化Token', async () => {
    const cache = storage()
    const api = {
      health: async () => ({ collectorId: 'local' }),
      receipt: vi.fn(async () => ({ ok: true }))
    }
    const queue = createReceiptQueue({ storage: cache, api })
    expect(queue.enqueue([file], { success: false })).toBe(0)
    expect(queue.enqueue([file], metadata)).toBe(1)
    const result = await queue.flush({ token: 'secret' })
    expect(result).toEqual({ pending: 0, synced: 1, errors: [] })
    const body = api.receipt.mock.calls[0][0]
    expect(body.items[0]).toMatchObject({
      sourceSha256: source.sha256,
      uploadedSha256: file.fileHash
    })
    expect(api.receipt.mock.calls[0][1]).toBe('secret')
    expect(JSON.stringify(cache.data)).not.toContain('secret')
  })
  it('本地服务断开保留回执，重开去重重试；不发送到其他采集实例', async () => {
    const cache = storage()
    const api = { health: async () => ({ collectorId: 'other' }), receipt: vi.fn() }
    const queue = createReceiptQueue({ storage: cache, api })
    queue.enqueue([file], metadata)
    queue.enqueue([file], metadata)
    expect(queue.pending()).toBe(1)
    expect((await queue.flush({ token: 'token' })).pending).toBe(1)
    expect(api.receipt).not.toHaveBeenCalled()
    api.health = async () => ({ collectorId: 'local' })
    api.receipt.mockRejectedValueOnce(new Error('离线')).mockResolvedValue({ ok: true })
    const restored = createReceiptQueue({ storage: cache, api })
    expect((await restored.flush({ token: 'token' })).errors).toEqual(['离线'])
    expect((await restored.flush({ token: 'token' })).synced).toBe(1)
  })
  it('没有提交SHA的成功响应也不能授权清理，不能静默丢回执', () => {
    const queue = createReceiptQueue({ storage: storage(), api: {} })
    expect(() => queue.enqueue([file], { success: true, path: 'metadata-pending/a.json' })).toThrow(
      '提交标识'
    )
  })
})
