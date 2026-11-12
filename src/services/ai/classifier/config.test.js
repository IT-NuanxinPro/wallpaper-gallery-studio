import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('本地 AI 默认模型', () => {
  it('按环境配置选择 sub2api 模型，并同步 Provider', async () => {
    vi.stubEnv('VITE_AI_DEFAULT_MODEL', 'sub2api-gpt-6.1-sol')
    vi.resetModules()
    const { CLASSIFIER_CONFIG, ASSISTANT_CONFIG, getModelByKey } = await import('./config')
    expect(CLASSIFIER_CONFIG.defaultProvider).toBe('sub2api')
    expect(CLASSIFIER_CONFIG.defaultModel).toBe('sub2api-gpt-6.1-sol')
    expect(ASSISTANT_CONFIG.defaultProvider).toBe('sub2api')
    expect(getModelByKey(CLASSIFIER_CONFIG.defaultModel).id).toBe('gpt-6.1-sol')
  })

  it('无效的默认模型配置仍回退到已有 GLM 默认值', async () => {
    vi.stubEnv('VITE_AI_DEFAULT_MODEL', 'missing-model')
    vi.resetModules()
    const { CLASSIFIER_CONFIG } = await import('./config')
    expect(CLASSIFIER_CONFIG.defaultProvider).toBe('zhipu')
    expect(CLASSIFIER_CONFIG.defaultModel).toBe('zhipu-glm-4v-flash')
  })
})
