import { describe, expect, it, vi } from 'vitest'
import { createUploadSessionService } from './create-upload-session-service'

function makeService() {
  const repository = {
    getContext: () => ({ owner: 'owner', repo: 'gallery', branch: 'main' }),
    uploadImage: vi.fn(),
    createFile: vi.fn()
  }
  return {
    repository,
    service: createUploadSessionService({
      repository,
      sessionCache: {
        isHashUploaded: () => null,
        getPendingUploadedHash: () => null,
        addPendingUploadedHash: () => {}
      },
      historyStore: { addRecord: () => {} }
    })
  }
}

describe('图片上传必须携带真实AI结果', () => {
  it('只设置目录不能直接调用上传服务绕过AI分析', async () => {
    const { service, repository } = makeService()
    const file = {
      name: 'wallpaper.png',
      file: new globalThis.File(['image'], 'wallpaper.png'),
      aiMetadata: null
    }
    const result = await service.uploadFile(file, {
      targetPath: 'wallpaper/desktop/风景',
      series: 'desktop',
      computeFileHash: async () => 'hash'
    })
    expect(result).toMatchObject({ success: false, errorType: 'AI_REQUIRED' })
    expect(repository.uploadImage).not.toHaveBeenCalled()
  })

  it('缺失AI结果不生成伪造元数据，已有校正结果原样输出', async () => {
    const { service, repository } = makeService()
    const file = {
      name: 'wallpaper.png',
      targetPath: 'wallpaper/desktop/摄影/雪山',
      targetSeries: 'desktop',
      size: 10,
      aiMetadata: null
    }
    const options = {
      getExtension: () => 'png',
      extractKeywordsFromFilename: () => ['旧回退关键词']
    }
    expect(await service.generatePendingMetadata([file], options)).toMatchObject({ success: false })
    expect(repository.createFile).not.toHaveBeenCalled()
    file.aiMetadata = {
      secondary: '摄影',
      third: '雪山',
      description: '人工校正结果',
      keywords: ['雪山']
    }
    expect(await service.generatePendingMetadata([file], options)).toMatchObject({ success: true })
    const saved = JSON.parse(repository.createFile.mock.calls[0][1])
    expect(saved.images[0]).toMatchObject({
      category: '摄影',
      subcategory: '雪山',
      ai: file.aiMetadata
    })
  })
})
