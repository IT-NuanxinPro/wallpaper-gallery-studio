/**
 * AI 模型配置
 * 集中管理所有 AI 服务商和模型
 */

export const AI_PROVIDERS = {
  CLOUDFLARE: 'cloudflare',
  DOUBAO: 'doubao'
}

export const AI_MODELS = {
  // Cloudflare Workers AI 模型
  cloudflare: [
    {
      id: '@cf/meta/llama-3.2-11b-vision-instruct',
      name: 'Llama 3.2 11B Vision',
      provider: AI_PROVIDERS.CLOUDFLARE,
      description: 'Meta 的视觉理解模型',
      maxTokens: 2048,
      recommended: true
    },
    {
      id: '@cf/meta/llama-3.2-90b-vision-instruct',
      name: 'Llama 3.2 90B Vision',
      provider: AI_PROVIDERS.CLOUDFLARE,
      description: 'Meta 的大型视觉模型',
      maxTokens: 4096,
      recommended: false
    }
  ],

  // 豆包 AI 模型
  doubao: [
    {
      id: 'doubao-seed-1-6-vision-250815',
      name: 'Doubao Seed 1.6 Vision',
      provider: AI_PROVIDERS.DOUBAO,
      description: '豆包视觉模型 1.6 版本',
      maxTokens: 4096,
      recommended: true
    },
    {
      id: 'doubao-seed-1-8-251228',
      name: 'Doubao Seed 1.8',
      provider: AI_PROVIDERS.DOUBAO,
      description: '豆包最新 1.8 版本',
      maxTokens: 4096,
      recommended: true
    }
  ]
}

/**
 * 获取所有模型列表
 * @returns {Array}
 */
export function getAllModels() {
  return [...AI_MODELS.cloudflare, ...AI_MODELS.doubao]
}

/**
 * 根据 Provider 获取模型列表
 * @param {string} provider - Provider 类型
 * @returns {Array}
 */
export function getModelsByProvider(provider) {
  return AI_MODELS[provider] || []
}

/**
 * 根据 ID 获取模型信息
 * @param {string} modelId - 模型 ID
 * @returns {Object|null}
 */
export function getModelById(modelId) {
  const allModels = getAllModels()
  return allModels.find(m => m.id === modelId) || null
}

/**
 * 获取推荐模型
 * @param {string} provider - Provider 类型（可选）
 * @returns {Array}
 */
export function getRecommendedModels(provider = null) {
  const allModels = getAllModels()
  let models = allModels.filter(m => m.recommended)

  if (provider) {
    models = models.filter(m => m.provider === provider)
  }

  return models
}

/**
 * Provider 显示配置
 */
export const PROVIDER_DISPLAY = {
  [AI_PROVIDERS.CLOUDFLARE]: {
    name: 'Cloudflare Workers AI',
    icon: '☁️',
    color: '#F38020',
    credentialFields: [
      { key: 'accountId', label: 'Account ID', type: 'text', required: true },
      { key: 'apiToken', label: 'API Token', type: 'password', required: true }
    ]
  },
  [AI_PROVIDERS.DOUBAO]: {
    name: '豆包 AI',
    icon: '🫘',
    color: '#00C4CC',
    credentialFields: [{ key: 'apiKey', label: 'API Key', type: 'password', required: true }]
  }
}
