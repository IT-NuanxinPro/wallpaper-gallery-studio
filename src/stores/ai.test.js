import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { AIProviderFactory } from '@/services/ai/core'
import { useAIStore } from './ai'
import { useUploadWorkspaceStore } from './upload-workspace'

const state = vi.hoisted(() => ({ credentials: null }))
vi.mock('./credentials', () => ({
  useCredentialsStore: () => ({
    hasCredentials: true,
    getCredentialsByProvider: provider => (provider === 'sub2api' ? state.credentials : null)
  })
}))
vi.mock('@/services/ai/core/image-processor', () => ({
  compressImage: async () => 'data:image/png;base64,test',
  IMAGE_CONFIG: {}
}))
vi.mock('@/services/ai/classifier/prompts', () => ({
  buildPromptWithLatestCategories: async () => '分析图片'
}))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.restoreAllMocks()
  state.credentials = { apiKey: 'session-key', signal: new globalThis.AbortController().signal }
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:preview' })
})

afterEach(() => vi.unstubAllGlobals())

describe('工坊与上传的固定模型', () => {
  it('旧Provider/模型选择不能重新启用已下架模型', async () => {
    const analyze = vi.fn().mockResolvedValue({ secondary: '科技' })
    vi.spyOn(AIProviderFactory, 'create').mockReturnValue({ analyze })
    const store = useAIStore()
    store.setProvider('zhipu')
    store.setModel('zhipu-glm-4v-flash')
    const result = await store.analyzeImage(new globalThis.File(['x'], 'wallpaper.png'), 'desktop')
    expect(result).toMatchObject({ provider: 'sub2api', model: 'sub2api-gpt-6.1-sol' })
    expect(analyze.mock.calls[0][0].credentials.model).toBe('gpt-6.1-sol')
    const workspace = useUploadWorkspaceStore()
    workspace.setAiModel('sub2api-grok-4.6')
    expect(workspace.selectedModelKey).toBe('sub2api-gpt-6.1-sol')
  })

  it('凭据切换后拒绝写入旧工坊结果', async () => {
    const controller = new globalThis.AbortController()
    state.credentials.signal = controller.signal
    vi.spyOn(AIProviderFactory, 'create').mockReturnValue({
      analyze: async () => {
        controller.abort()
        return { description: '旧结果' }
      }
    })
    const store = useAIStore()
    await expect(
      store.analyzeImage(new globalThis.File(['x'], 'wallpaper.png'), 'desktop')
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(store.results).toHaveLength(0)
  })
})
