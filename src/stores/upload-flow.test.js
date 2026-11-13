import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUploadStore } from './upload'
import { useCredentialsStore } from './credentials'
import { useAiTasksStore } from './ai-tasks'
import { hashWorker } from '@/utils/hashWorker'
import { previewManager } from '@/utils/previewManager'
import { analyzeImage } from '@/services/ai/classifier'
import { resumeAiTaskQueue } from '@/services/ai/task-runner'

const state = vi.hoisted(() => ({ records: [] }))
vi.mock('@/services/ai/task-storage', () => ({
  listAiTaskRecords: async () => state.records,
  putAiTaskRecord: async record => {
    state.records = [...state.records.filter(item => item.id !== record.id), record]
  },
  deleteAiTaskRecord: async () => {},
  clearAiTaskRecords: async () => {},
  formatTaskStorageError: () => '任务存储失败'
}))
vi.mock('@/services/ai/classifier', async importOriginal => ({
  ...(await importOriginal()),
  analyzeImage: vi.fn()
}))

beforeEach(async () => {
  setActivePinia(createPinia())
  localStorage.clear()
  sessionStorage.clear()
  state.records = []
  vi.spyOn(hashWorker, 'computeHash').mockResolvedValue('image-hash')
  vi.spyOn(previewManager, 'createPreview').mockReturnValue('blob:preview')
  analyzeImage.mockResolvedValue({ secondary: '风景', third: '山川', description: 'AI 结果' })
  await useAiTasksStore().initialize()
})

afterEach(() => vi.restoreAllMocks())

describe('图片 AI 入列与上传门槛', () => {
  it('无Key也持久入列，填写Key后恢复同一任务', async () => {
    const store = useUploadStore()
    await store.addFiles([new globalThis.File(['image'], 'wallpaper.png', { type: 'image/png' })])
    await vi.waitFor(() => expect(useAiTasksStore().tasks).toHaveLength(1))
    await resumeAiTaskQueue()
    const taskId = useAiTasksStore().tasks[0].id
    expect(state.records[0]).toMatchObject({ id: taskId, status: 'queued', attempts: 0 })
    expect(analyzeImage).not.toHaveBeenCalled()
    expect(store.canStartUpload()).toBe(false)
    useCredentialsStore().saveCredentials({ apiKey: 'test-key' })
    await resumeAiTaskQueue()
    expect(useAiTasksStore().tasks[0]).toMatchObject({ id: taskId, status: 'completed' })
    expect(store.files[0].aiMetadata.description).toBe('AI 结果')
    expect(store.canStartUpload()).toBe(true)
  })

  it('旧会话仅有目标目录时必须等待AI，已编辑结果可继续上传', async () => {
    const store = useUploadStore()
    store.files = [
      {
        id: 'old-file',
        status: 'pending',
        targetPath: 'wallpaper/desktop/风景/山川',
        aiMetadata: null
      }
    ]
    expect(store.canStartUpload()).toBe(false)
    await expect(store.uploadAll()).rejects.toThrow('AI')
    store.setFileAiMetadata('old-file', {
      series: 'desktop',
      secondary: '风景',
      third: '山川',
      description: '保留校正内容'
    })
    store.updateFileTarget('old-file', 'desktop', '摄影', '雪山')
    expect(store.canStartUpload()).toBe(true)
    expect(store.files[0]).toMatchObject({
      targetPath: 'wallpaper/desktop/摄影/雪山',
      aiMetadata: { description: '保留校正内容' }
    })
  })
})
