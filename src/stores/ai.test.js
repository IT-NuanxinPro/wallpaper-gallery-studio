import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { AIProviderFactory } from '@/services/ai/core'
import { useAIStore } from './ai'
import { useUploadWorkspaceStore } from './upload-workspace'

const state = vi.hoisted(() => ({ credentials: null }))
vi.mock('./credentials', () => ({
  useCredentialsStore: () => ({
    hasCredentials: true,
    get hasModelReady() {
      return !!state.credentials?.model
    },
    get selectedModel() {
      return state.credentials?.model || ''
    },
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
  state.credentials = {
    apiKey: 'session-key',
    model: 'vision-alpha',
    signal: new globalThis.AbortController().signal
  }
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:preview' })
})

afterEach(() => vi.unstubAllGlobals())

describe('工坊与上传共用当前会话模型', () => {
  it.each(['vision-alpha', 'vendor/vision-beta'])('请求与结果都记录当前模型 %s', async model => {
    state.credentials.model = model
    const analyze = vi.fn().mockResolvedValue({ secondary: '科技' })
    vi.spyOn(AIProviderFactory, 'create').mockReturnValue({ analyze })
    const store = useAIStore()
    const result = await store.analyzeImage(new globalThis.File(['x'], 'wallpaper.png'), 'desktop')
    expect(result).toMatchObject({ provider: 'sub2api', model })
    expect(analyze.mock.calls[0][0].credentials.model).toBe(model)
    expect(useUploadWorkspaceStore().selectedModelKey).toBe(model)
  })

  it('未选模型时不发起分析且不写入结果', async () => {
    state.credentials.model = ''
    const analyze = vi.fn()
    vi.spyOn(AIProviderFactory, 'create').mockReturnValue({ analyze })
    const store = useAIStore()
    await expect(
      store.analyzeImage(new globalThis.File(['x'], 'wallpaper.png'), 'desktop')
    ).rejects.toThrow('模型')
    expect(analyze).not.toHaveBeenCalled()
    expect(store.results).toEqual([])
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
