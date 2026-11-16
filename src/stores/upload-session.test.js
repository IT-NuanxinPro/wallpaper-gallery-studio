import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAiTasksStore, AI_TASK_STATUS } from './ai-tasks'
import { useUploadSessionStore } from './upload-session'
import { createUploadFileLifecycleService } from '@/features/upload-workspace/application/create-upload-file-lifecycle-service'

const state = vi.hoisted(() => ({ records: [] }))
vi.mock('@/services/ai/task-storage', () => ({
  listAiTaskRecords: async () => state.records,
  putAiTaskRecord: async record => {
    state.records = [...state.records.filter(item => item.id !== record.id), { ...record }]
  },
  deleteAiTaskRecord: async () => {},
  clearAiTaskRecords: async () => {},
  formatTaskStorageError: () => '任务存储失败'
}))
vi.mock('@/services/ai/task-runner', () => ({ resumeAiTaskQueue: vi.fn(async () => {}) }))
vi.mock('@/utils/previewManager', () => ({ previewManager: { createPreview: id => 'blob:' + id } }))

const localSource = {
  collectorId: 'collector',
  batchId: 'batch-one',
  sourceItemId: 'image-one',
  sha256: 'a'.repeat(64)
}
beforeEach(() => {
  state.records = []
  setActivePinia(createPinia())
})

describe('上传任务刷新恢复', () => {
  it('本地批次经AI入队、状态更新和页面重建后保留原始身份与压缩信息', async () => {
    const file = new globalThis.File(['compressed'], 'compressed.webp', { type: 'image/webp' })
    const uploadFile = {
      id: 'local-one',
      file,
      fileHash: 'b'.repeat(64),
      localSource,
      originalSize: 23000000,
      compressed: true
    }
    const service = createUploadFileLifecycleService({})
    await service.analyzeFiles([uploadFile], { series: 'desktop' })
    const task = useAiTasksStore().tasks[0]
    await useAiTasksStore().updateTask(task.id, {
      status: AI_TASK_STATUS.COMPLETED,
      result: { secondary: '风景', third: '山川', description: '审核结果' }
    })
    expect(state.records[0]).toMatchObject({
      localSource,
      fileHash: uploadFile.fileHash,
      originalSize: 23000000,
      compressed: true
    })
    expect(state.records[0].blob).toBe(file)
    setActivePinia(createPinia())
    await useAiTasksStore().initialize()
    const session = useUploadSessionStore()
    await session.restoreAiTaskFiles()
    await session.restoreAiTaskFiles()
    expect(session.files).toHaveLength(1)
    expect(session.files[0]).toMatchObject({
      localSource,
      fileHash: uploadFile.fileHash,
      originalSize: 23000000,
      compressed: true,
      status: 'pending',
      targetPath: 'wallpaper/desktop/风景/山川',
      aiMetadata: { description: '审核结果' }
    })
  })

  it('批次来源只持久化必要身份字段，不带入额外凭据', async () => {
    const tasks = useAiTasksStore()
    await tasks.initialize()
    await tasks.createTask({
      fileId: 'safe',
      file: new globalThis.File(['image'], 'one.jpg', { type: 'image/jpeg' }),
      series: 'desktop',
      localSource: { ...localSource, apiKey: 'never-save', token: 'never-save' }
    })
    expect(state.records[0].localSource).toEqual(localSource)
    expect(JSON.stringify(state.records)).not.toContain('never-save')
    await tasks.updateTask(tasks.tasks[0].id, {
      localSource: { ...localSource, token: 'never-save' }
    })
    expect(JSON.stringify(state.records)).not.toContain('never-save')
  })

  it('旧任务无本地字段仍可恢复，不伪造批次身份', async () => {
    const file = new globalThis.File(['legacy'], 'legacy.jpg', { type: 'image/jpeg' })
    state.records = [
      {
        id: 'legacy-task',
        fileId: 'legacy-file',
        fileName: 'legacy.jpg',
        blob: file,
        series: 'desktop',
        status: AI_TASK_STATUS.COMPLETED,
        result: { secondary: '风景', description: '旧任务' }
      }
    ]
    await useAiTasksStore().initialize()
    const session = useUploadSessionStore()
    await session.restoreAiTaskFiles()
    expect(session.files[0]).toMatchObject({
      originalSize: file.size,
      compressed: false,
      fileHash: null
    })
    expect(session.files[0].localSource).toBeUndefined()
  })
})
