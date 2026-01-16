/**
 * AI 模型配置
 * 支持多个 AI Provider（Cloudflare、豆包等）
 */

/**
 * AI Provider 类型
 */
export const AI_PROVIDERS = {
  CLOUDFLARE: 'cloudflare',
  DOUBAO: 'doubao'
}

/**
 * AI 模型配置
 */
export const AI_MODELS = {
  // 豆包 AI 模型（默认推荐）
  'doubao-1.6': {
    id: 'doubao-seed-1-6-vision-250815',
    name: 'Doubao Seed 1.6 Vision',
    provider: AI_PROVIDERS.DOUBAO,
    description: '豆包视觉模型 1.6 版本，速度快，准确度高',
    speed: 'fast',
    accuracy: 'high',
    cost: 'low',
    parser: 'doubao',
    maxTokens: 4096,
    temperature: 0.3,
    recommended: true
  },

  'doubao-1.8': {
    id: 'doubao-seed-1-8-251228',
    name: 'Doubao Seed 1.8',
    provider: AI_PROVIDERS.DOUBAO,
    description: '豆包最新 1.8 版本，性能更强',
    speed: 'fast',
    accuracy: 'high',
    cost: 'low',
    parser: 'doubao',
    maxTokens: 4096,
    temperature: 0.3,
    recommended: false
  },

  // Cloudflare Workers AI 模型
  'llama-3.2': {
    id: '@cf/meta/llama-3.2-11b-vision-instruct',
    name: 'Llama 3.2 11B Vision',
    provider: AI_PROVIDERS.CLOUDFLARE,
    description: '最强大，准确度高，速度中等',
    speed: 'medium',
    accuracy: 'high',
    cost: 'medium',
    parser: 'llama',
    maxTokens: 10000,
    temperature: 0.3,
    recommended: false
  }
}

/**
 * Provider 显示配置
 */
export const PROVIDER_DISPLAY = {
  [AI_PROVIDERS.DOUBAO]: {
    name: '豆包 AI',
    icon: '🫘',
    color: '#00C4CC',
    description: '字节跳动豆包 AI 服务'
  },
  [AI_PROVIDERS.CLOUDFLARE]: {
    name: 'Cloudflare Workers AI',
    icon: '☁️',
    color: '#F38020',
    description: 'Cloudflare 提供的 AI 服务'
  }
}

/**
 * 默认配置
 */
export const AI_CONFIG = {
  // 默认 Provider
  defaultProvider: AI_PROVIDERS.DOUBAO,

  // 默认模型
  defaultModel: 'doubao-1.6',

  // 默认提示词模板
  defaultPromptTemplate: 'default',

  // 图片处理配置
  image: {
    maxSize: 1024,
    quality: 0.9,
    format: 'image/jpeg'
  },

  // Worker URL (Cloudflare)
  workerUrl: 'https://ai-proxy.han1569250882.workers.dev',

  // 豆包 API Endpoint
  doubaoEndpoint: 'https://ark.cn-beijing.volces.com/api/v3/responses'
}

/**
 * 获取模型列表
 * @param {string} provider - Provider 类型（可选）
 * @returns {Array} 模型列表
 */
export function getModelList(provider = null) {
  let models = Object.entries(AI_MODELS).map(([key, model]) => ({
    key,
    ...model
  }))

  if (provider) {
    models = models.filter(m => m.provider === provider)
  }

  return models
}

/**
 * 根据 key 获取模型配置
 * @param {string} modelKey - 模型 key
 * @returns {Object|null} 模型配置
 */
export function getModelByKey(modelKey) {
  return AI_MODELS[modelKey] || null
}

/**
 * 获取推荐模型
 * @param {string} provider - Provider 类型（可选）
 * @returns {Object} 推荐模型配置
 */
export function getRecommendedModel(provider = null) {
  const models = getModelList(provider)
  const recommended = models.find(m => m.recommended)
  return recommended || models[0] || null
}

/**
 * 根据 Provider 获取模型列表
 * @param {string} provider - Provider 类型
 * @returns {Array} 模型列表
 */
export function getModelsByProvider(provider) {
  return getModelList(provider)
}

/**
 * 验证模型配置是否有效
 * @param {Object} model - 模型配置
 * @returns {boolean} 是否有效
 */
export function isValidModel(model) {
  return (
    model &&
    typeof model.id === 'string' &&
    typeof model.name === 'string' &&
    typeof model.parser === 'string' &&
    typeof model.provider === 'string'
  )
}

/**
 * 速度等级映射
 */
export const SPEED_LEVELS = {
  fast: { label: '快', value: 3, color: '#67c23a' },
  medium: { label: '中等', value: 2, color: '#e6a23c' },
  slow: { label: '慢', value: 1, color: '#f56c6c' }
}

/**
 * 准确度等级映射
 */
export const ACCURACY_LEVELS = {
  high: { label: '高', value: 3, color: '#67c23a' },
  medium: { label: '中等', value: 2, color: '#e6a23c' },
  low: { label: '低', value: 1, color: '#f56c6c' }
}

/**
 * 成本等级映射
 */
export const COST_LEVELS = {
  low: { label: '低', value: 1, color: '#67c23a' },
  medium: { label: '中等', value: 2, color: '#e6a23c' },
  high: { label: '高', value: 3, color: '#f56c6c' }
}
