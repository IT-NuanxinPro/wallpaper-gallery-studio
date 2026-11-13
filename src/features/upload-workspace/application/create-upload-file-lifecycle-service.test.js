import { describe, expect, it } from 'vitest'
import { createUploadFileLifecycleService } from './create-upload-file-lifecycle-service'

function makeService(metadata = null) {
  const cached = new Map(metadata ? [['same-image-hash', metadata]] : [])
  return createUploadFileLifecycleService({
    sessionCache: {
      getCachedAiMetadata: hash => cached.get(hash),
      setCachedAiMetadata: (hash, value) => cached.set(hash, value)
    },
    imageCompressor: {},
    previewManager: { createPreview: id => `blob:${id}` },
    hashComputer: async () => 'same-image-hash'
  })
}

async function prepare(service, options = {}) {
  return service.prepareFiles(
    [new globalThis.File(['image'], 'wallpaper.png', { type: 'image/png' })],
    {
      target: { series: 'desktop', l1: '旧目录', l2: '旧子目录' },
      validateFile: () => ({ valid: true }),
      generateId: () => 'file-one',
      ...options
    }
  )
}

describe('图片统一 AI 准备流程', () => {
  it('旧手动参数仍计算哈希并恢复已有 AI 元数据', async () => {
    const metadata = {
      series: 'desktop',
      secondary: '风景',
      third: '山川',
      description: '已有结果'
    }
    const [file] = await prepare(makeService(metadata), { uploadMode: 'manual' })
    expect(file.fileHash).toBe('same-image-hash')
    expect(file.aiMetadata).toEqual(metadata)
    expect(file.aiTaskStatus).toBe('completed')
  })

  it('未分析图片不会继承旧手动目录绕过分类', async () => {
    const [file] = await prepare(makeService(), { uploadMode: 'manual' })
    expect(file).toMatchObject({
      targetSeries: 'desktop',
      targetPath: '',
      targetL1: '',
      targetL2: '',
      aiMetadata: null
    })
  })

  it('已有 AI 结果仍允许编辑分类和描述并复用修正缓存', async () => {
    const service = makeService()
    const [file] = await prepare(service)
    service.applyAiMetadata(file, {
      series: 'desktop',
      secondary: '风景',
      third: '山川',
      description: '原描述'
    })
    service.updateFileTarget([file], file.id, 'desktop', '摄影', '雪山')
    service.applyAiMetadata(
      file,
      { series: 'desktop', secondary: '摄影', third: '雪山', description: '人工校正描述' },
      false
    )
    expect(file).toMatchObject({
      targetPath: 'wallpaper/desktop/摄影/雪山',
      aiMetadata: { description: '人工校正描述' }
    })
    const [restored] = await prepare(service)
    expect(restored.aiMetadata).toMatchObject({
      secondary: '摄影',
      third: '雪山',
      description: '人工校正描述'
    })
  })
})
