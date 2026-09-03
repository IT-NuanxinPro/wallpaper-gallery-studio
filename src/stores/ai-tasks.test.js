import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const storage = vi.hoisted(() => ({
  clear: vi.fn(),
  deleteMany: vi.fn(),
  list: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  putMany: vi.fn()
}))

const runtime = vi.hoisted(() => ({
  cancel: vi.fn(),
  cancelMany: vi.fn()
}))

vi.mock('@/services/ai/task-storage', () => ({
  clearAiTaskRecords: storage.clear,
  deleteAiTaskRecords: storage.deleteMany,
  formatTaskStorageError: error => error.message,
  listAiTaskRecords: storage.list,
  patchAiTaskRecord: storage.patch,
  putAiTaskRecord: storage.put,
  putAiTaskRecords: storage.putMany
}))

vi.mock('@/services/ai/task-runtime', () => ({
  cancelAiTaskRun: runtime.cancel,
  cancelAiTaskRuns: runtime.cancelMany
}))

import { AI_TASK_STATUS, useAiTasksStore } from './ai-tasks'

function createRecord(overrides) {
  return {
    id: overrides.id,
    fileId: `file-${overrides.id}`,
    fileName: `${overrides.id}.jpg`,
    batchId: 'batch-test',
    createdAt: 1,
    updatedAt: 1,
    attempts: 1,
    maxAttempts: 3,
    retryAt: null,
    ...overrides
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  storage.clear.mockResolvedValue(true)
  storage.deleteMany.mockResolvedValue([])
  storage.patch.mockImplementation(async (_id, record) => record)
  storage.put.mockImplementation(async record => record)
  storage.putMany.mockImplementation(async records => records)
})

describe('AI task recovery', () => {
  it('批量文件使用一次事务写入任务记录', async () => {
    storage.list.mockResolvedValue([])
    const store = useAiTasksStore()
    await store.initialize()

    const files = ['one', 'two'].map(
      name => new globalThis.File([name], `${name}.jpg`, { type: 'image/jpeg' })
    )
    await store.createTasks(
      files.map((file, index) => ({
        fileId: `file-${index}`,
        file,
        series: 'desktop',
        provider: 'zhipu',
        modelKey: 'zhipu-glm-4v-flash'
      })),
      'batch-atomic'
    )

    expect(storage.putMany).toHaveBeenCalledOnce()
    expect(storage.putMany.mock.calls[0][0]).toHaveLength(2)
    expect(store.tasks).toHaveLength(2)
  })

  it('刷新后保留 retryAt，仅把被中断的 analyzing 重新排队', async () => {
    const retryAt = Date.now() + 20_000
    storage.list.mockResolvedValue([
      createRecord({ id: 'running', status: AI_TASK_STATUS.ANALYZING }),
      createRecord({ id: 'retrying', status: AI_TASK_STATUS.RETRYING, retryAt })
    ])

    const store = useAiTasksStore()
    await store.initialize()

    expect(store.tasks.find(task => task.id === 'running')).toMatchObject({
      status: AI_TASK_STATUS.QUEUED,
      retryAt: null
    })
    expect(store.tasks.find(task => task.id === 'retrying')).toMatchObject({
      status: AI_TASK_STATUS.RETRYING,
      retryAt
    })
  })

  it('持久化删除失败时保留内存任务，避免页面假删除', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    storage.list.mockResolvedValue([
      createRecord({ id: 'failed-delete', status: AI_TASK_STATUS.FAILED })
    ])
    storage.deleteMany.mockRejectedValue(new Error('delete failed'))

    const store = useAiTasksStore()
    await store.initialize()

    await expect(store.removeTasksByFileIds(['file-failed-delete'])).rejects.toThrow(
      'delete failed'
    )
    expect(store.tasks.map(task => task.id)).toContain('failed-delete')
    warning.mockRestore()
  })

  it('手动分类会写回任务记录供刷新恢复', async () => {
    storage.list.mockResolvedValue([
      createRecord({ id: 'manual', status: AI_TASK_STATUS.COMPLETED })
    ])

    const store = useAiTasksStore()
    await store.initialize()
    await store.saveManualTarget('file-manual', {
      series: 'desktop',
      l1: '风景',
      l2: '城市',
      path: 'wallpaper/desktop/风景/城市'
    })

    expect(store.getTaskByFileId('file-manual').manualTarget).toMatchObject({
      series: 'desktop',
      l1: '风景',
      l2: '城市',
      path: 'wallpaper/desktop/风景/城市'
    })
    expect(storage.patch).toHaveBeenCalledOnce()
  })
})
