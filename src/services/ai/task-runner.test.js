import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAiTasksStore } from '@/stores/ai-tasks'
import { analyzeImage } from '@/services/ai/classifier'
import { resumeAiTaskQueue } from './task-runner'

const state = vi.hoisted(() => ({ records: [], files: [], credentials: null }))
vi.mock('@/stores/credentials', () => ({
  useCredentialsStore: () => ({
    loadCredentials: async () => {},
    get hasModelReady() {
      return !!state.credentials?.apiKey && !!state.credentials?.model
    },
    getCredentialsByProvider: provider => (provider === 'sub2api' ? state.credentials : null)
  })
}))
vi.mock('@/stores/upload-session', () => ({
  useUploadSessionStore: () => ({
    files: state.files,
    restoreAiTaskFiles: async () => {}
  })
}))
vi.mock('@/services/ai/classifier', () => ({ analyzeImage: vi.fn() }))
vi.mock('@/services/ai/task-storage', () => ({
  listAiTaskRecords: async () => state.records,
  putAiTaskRecord: async task => {
    // IndexedDB 使用结构化克隆，不能接收 Pinia/Vue 的响应式代理。
    const stored = globalThis.structuredClone(task)
    const index = state.records.findIndex(item => item.id === task.id)
    if (index < 0) state.records.push(stored)
    else state.records[index] = stored
  },
  patchAiTaskRecord: async (id, patch) => {
    state.records = state.records.map(record =>
      record.id === id ? { ...record, ...patch } : record
    )
  },
  deleteAiTaskRecord: async () => {},
  clearAiTaskRecords: async () => {},
  formatTaskStorageError: () => '任务存储失败'
}))

function credentials(apiKey = 'current-key', model = 'vision-alpha') {
  const controller = new globalThis.AbortController()
  return {
    apiKey,
    model,
    baseUrl: 'https://session.example/v1',
    signal: controller.signal,
    controller
  }
}

async function queueTask() {
  const file = new globalThis.File(['image'], 'wallpaper.png', { type: 'image/png' })
  state.files.push({ id: 'file-one', file, aiMetadata: null })
  const store = useAiTasksStore()
  await store.initialize()
  return store.createTask({
    fileId: 'file-one',
    file,
    series: 'desktop',
    provider: 'zhipu',
    modelKey: 'zhipu-glm-4v-flash'
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  state.records = []
  state.files = []
  state.credentials = credentials()
  vi.clearAllMocks()
  analyzeImage.mockResolvedValue({ secondary: '科技', third: '', description: '新结果' })
})

describe('AI 任务恢复与会话凭据边界', () => {
  it('恢复任务保留历史模型与次数，等待会话决定实际执行模型', async () => {
    state.records = [
      {
        id: 'pending',
        status: 'retrying',
        provider: 'zhipu',
        modelKey: 'zhipu-glm-4v-flash',
        attempts: 2,
        credentials: { apiKey: 'legacy-key' },
        baseUrl: 'https://old.example'
      },
      {
        id: 'done',
        status: 'completed',
        provider: 'groq',
        modelKey: 'groq-old',
        result: { description: '历史结果' }
      }
    ]
    const store = useAiTasksStore()
    await store.initialize()
    expect(store.tasks.find(task => task.id === 'pending')).toMatchObject({
      status: 'queued',
      provider: 'zhipu',
      modelKey: 'zhipu-glm-4v-flash',
      attempts: 2
    })
    expect(store.tasks.find(task => task.id === 'done')).toMatchObject({
      provider: 'groq',
      result: { description: '历史结果' }
    })
    expect(JSON.stringify(state.records)).not.toContain('legacy-key')
    expect(state.records[0]).not.toHaveProperty('baseUrl')
  })

  it('创建和更新任务都不接受凭据字段', async () => {
    const task = await queueTask()
    await useAiTasksStore().updateTask(task.id, {
      apiKey: 'should-not-persist',
      baseUrl: 'https://secret.example',
      credentials: state.credentials
    })
    expect(state.records[0]).toMatchObject({ provider: 'sub2api', modelKey: '' })
    expect(state.records[0]).not.toHaveProperty('credentials')
    expect(state.records[0]).not.toHaveProperty('apiKey')
    expect(state.records[0]).not.toHaveProperty('baseUrl')
  })

  it('没有Key时保持排队，配置后可恢复同一任务', async () => {
    const task = await queueTask()
    state.credentials = { apiKey: '' }
    await resumeAiTaskQueue()
    expect(useAiTasksStore().tasks[0]).toMatchObject({ id: task.id, status: 'queued', attempts: 0 })
    expect(analyzeImage).not.toHaveBeenCalled()
    state.credentials = credentials('new-key')
    await resumeAiTaskQueue()
    expect(useAiTasksStore().tasks[0]).toMatchObject({ id: task.id, status: 'completed' })
    expect(analyzeImage.mock.calls[0][0]).toMatchObject({
      providerType: 'sub2api',
      credentials: { apiKey: 'new-key', model: 'vision-alpha' }
    })
  })

  it('仅有Key没有模型时保持等待，选择模型后用该模型运行', async () => {
    const task = await queueTask()
    state.credentials = credentials('current-key', '')
    await resumeAiTaskQueue()
    expect(analyzeImage).not.toHaveBeenCalled()
    expect(useAiTasksStore().tasks[0]).toMatchObject({
      id: task.id,
      status: 'queued',
      modelKey: '',
      attempts: 0
    })
    state.credentials = credentials('current-key', 'vendor/vision-beta')
    await resumeAiTaskQueue()
    expect(useAiTasksStore().tasks[0]).toMatchObject({
      modelKey: 'vendor/vision-beta',
      result: { model: 'vendor/vision-beta' }
    })
  })

  it('切换模型丢弃旧结果并以新模型执行，完成历史不改写', async () => {
    await queueTask()
    analyzeImage.mockImplementationOnce(async () => {
      state.credentials.controller.abort()
      state.credentials = credentials('current-key', 'vendor/vision-beta')
      return { description: '旧模型结果' }
    })
    await resumeAiTaskQueue()
    expect(analyzeImage.mock.calls.map(([request]) => request.credentials.model)).toEqual([
      'vision-alpha',
      'vendor/vision-beta'
    ])
    expect(useAiTasksStore().tasks[0]).toMatchObject({
      status: 'completed',
      attempts: 1,
      modelKey: 'vendor/vision-beta',
      result: { model: 'vendor/vision-beta', description: '新结果' }
    })
    state.credentials = credentials('current-key', 'vision-alpha')
    await resumeAiTaskQueue()
    expect(useAiTasksStore().tasks[0].modelKey).toBe('vendor/vision-beta')
  })

  it('清除Key后丢弃旧在途结果，任务回到等待且不消耗失败次数', async () => {
    await queueTask()
    analyzeImage.mockImplementationOnce(async () => {
      state.credentials.controller.abort()
      state.credentials = { apiKey: '' }
      return { secondary: '旧结果', description: '不应写回' }
    })
    await resumeAiTaskQueue()
    expect(useAiTasksStore().tasks[0]).toMatchObject({
      status: 'queued',
      attempts: 0,
      result: null
    })
    expect(state.files[0].aiMetadata).toBeNull()
    state.credentials = credentials('replacement-key')
    await resumeAiTaskQueue()
    expect(useAiTasksStore().tasks[0]).toMatchObject({
      status: 'completed',
      result: { description: '新结果' }
    })
  })

  it('换Key后的重试读取新会话，不重复使用失效Key', async () => {
    await queueTask()
    analyzeImage.mockImplementationOnce(async () => {
      state.credentials.controller.abort()
      state.credentials = credentials('replacement-key')
      throw Object.assign(new Error('会话变更'), { name: 'AbortError' })
    })
    await resumeAiTaskQueue()
    expect(useAiTasksStore().tasks[0]).toMatchObject({ status: 'completed', attempts: 1 })
    expect(analyzeImage.mock.calls.map(([request]) => request.credentials.apiKey)).toEqual([
      'current-key',
      'replacement-key'
    ])
    expect(JSON.stringify(state.records)).not.toContain('replacement-key')
  })

  it('模型异常回显Key时持久任务只保存固定安全提示', async () => {
    const task = await queueTask()
    await useAiTasksStore().updateTask(task.id, { maxAttempts: 1 })
    analyzeImage.mockRejectedValueOnce(new Error('server echoed current-key'))
    await resumeAiTaskQueue()
    expect(useAiTasksStore().tasks[0].status).toBe('failed')
    expect(JSON.stringify(state.records)).not.toContain('current-key')
  })
})
