import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createUploadSessionCache } from './create-upload-session-cache'

beforeEach(() => localStorage.clear())

describe('图片缓存按目标仓库隔离', () => {
  it('A的上传和AI结果不能用于B，同一仓库不同分支也隔离，返回A可恢复', () => {
    let target = { owner: 'alice', repo: 'gallery-a', branch: 'main' }
    const cache = createUploadSessionCache({ getRepositoryContext: () => target, debounceMs: 0 })
    cache.addUploadedHash('done', 'done.png', 'wallpaper/done.png')
    cache.addPendingUploadedHash('pending', 'pending.png', 'wallpaper/pending.png')
    cache.setCachedAiMetadata('ai', { secondary: 'A分类' })
    target = { owner: 'alice', repo: 'gallery-b', branch: 'main' }
    expect(cache.isHashUploaded('done')).toBeNull()
    expect(cache.getPendingUploadedHash('pending')).toBeNull()
    expect(cache.getCachedAiMetadata('ai')).toBeNull()
    target = { owner: 'alice', repo: 'gallery-a', branch: 'draft' }
    expect(cache.getPendingUploadedHash('pending')).toBeNull()
    target = { owner: 'alice', repo: 'gallery-a', branch: 'main' }
    expect(cache.isHashUploaded('done')).toMatchObject({ filename: 'done.png' })
    expect(cache.getPendingUploadedHash('pending')).toMatchObject({ filename: 'pending.png' })
    expect(cache.getCachedAiMetadata('ai')).toEqual({ secondary: 'A分类' })
  })

  it('旧无归属缓存不采用，延迟保存仍写入创建时的仓库空间', async () => {
    vi.useFakeTimers()
    try {
      localStorage.setItem(
        'pending_uploaded_hashes',
        JSON.stringify({ legacy: { filename: 'old.png', time: Date.now() } })
      )
      let target = { owner: 'alice', repo: 'a', branch: 'main' }
      const cache = createUploadSessionCache({
        getRepositoryContext: () => target,
        debounceMs: 100
      })
      expect(cache.getPendingUploadedHash('legacy')).toBeNull()
      cache.addPendingUploadedHash('same-hash', 'a.png', 'wallpaper/a.png')
      target = { owner: 'alice', repo: 'b', branch: 'main' }
      cache.addPendingUploadedHash('same-hash', 'b.png', 'wallpaper/b.png')
      await vi.runAllTimersAsync()
      const restored = createUploadSessionCache({ getRepositoryContext: () => target })
      expect(restored.getPendingUploadedHash('same-hash').filename).toBe('b.png')
      target = { owner: 'alice', repo: 'a', branch: 'main' }
      expect(restored.getPendingUploadedHash('same-hash').filename).toBe('a.png')
    } finally {
      vi.useRealTimers()
    }
  })
})
