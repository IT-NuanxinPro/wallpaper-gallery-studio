import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('固定 AI 模型', () => {
  it.each(['sub2api-grok-4.6', 'zhipu-glm-4v-flash', 'missing-model'])(
    '旧配置 %s 不会恢复已下架模型',
    async previousModel => {
      vi.stubEnv('VITE_AI_DEFAULT_MODEL', previousModel)
      vi.resetModules()
      const { CLASSIFIER_CONFIG, getModelByKey, getModelList } = await import('./config')
      expect(CLASSIFIER_CONFIG.defaultProvider).toBe('sub2api')
      expect(CLASSIFIER_CONFIG.defaultModel).toBe('sub2api-gpt-6.1-sol')
      expect(getModelByKey(CLASSIFIER_CONFIG.defaultModel).id).toBe('gpt-6.1-sol')
      expect(getModelList().map(model => model.key)).toEqual(['sub2api-gpt-6.1-sol'])
      expect(getModelByKey(previousModel)).toBeNull()
    }
  )

  it('工厂拒绝所有已下架服务', async () => {
    const { AIProviderFactory } = await import('../core')
    expect(AIProviderFactory.getSupportedTypes()).toEqual(['sub2api'])
    for (const provider of ['zhipu', 'groq', 'cloudflare', 'doubao']) {
      expect(() => AIProviderFactory.create(provider)).toThrow()
    }
  })
})
