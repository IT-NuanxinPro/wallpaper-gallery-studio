import { describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/previewManager', () => ({
  previewManager: {
    createPreview: vi.fn(() => 'blob:restored-preview')
  }
}))

import { restoreFileFromTask } from './upload-session'

describe('upload session recovery', () => {
  it('刷新恢复时保留手动目录，同时保留 AI 元数据', () => {
    const blob = new globalThis.Blob(['image'], { type: 'image/jpeg' })
    const restored = restoreFileFromTask({
      id: 'task-manual',
      fileId: 'file-manual',
      fileName: 'manual.jpg',
      fileType: 'image/jpeg',
      fileLastModified: 1,
      blob,
      series: 'desktop',
      status: 'completed',
      attempts: 1,
      result: {
        series: 'desktop',
        category: 'AI 推荐',
        subcategory: '默认'
      },
      manualTarget: {
        series: 'mobile',
        l1: '手动分类',
        l2: '精选',
        path: 'wallpaper/mobile/手动分类/精选'
      }
    })

    expect(restored).toMatchObject({
      targetPath: 'wallpaper/mobile/手动分类/精选',
      targetSeries: 'mobile',
      targetL1: '手动分类',
      targetL2: '精选',
      targetSource: 'manual',
      aiMetadata: {
        category: 'AI 推荐'
      }
    })
  })
})
