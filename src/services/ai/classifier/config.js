/**
 * 分类服务配置
 * 独立于 AI 助手的配置
 */

import { AI_PROVIDERS } from '../core'

/**
 * 分类服务的模型配置
 */
export const CLASSIFIER_MODELS = {
  // 豆包 AI 模型（默认推荐）
  'doubao-1.6': {
    id: 'doubao-seed-1-6-vision-250815',
    name: 'Doubao Seed 1.6 Vision',
    provider: AI_PROVIDERS.DOUBAO,
    description: '豆包视觉模型 1.6 版本，速度快，准确度高',
    speed: 'fast',
    accuracy: 'high',
    cost: 'low',
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
    maxTokens: 4096,
    temperature: 0.3,
    recommended: false
  },

  // Cloudflare Workers AI 模型
  'llama-3.2': {
    id: '@cf/meta/llama-3.2-11b-vision-instruct',
    name: 'Llama 3.2 11B Vision',
    provider: AI_PROVIDERS.CLOUDFLARE,
    description: 'Meta 的视觉理解模型，准确度高',
    speed: 'medium',
    accuracy: 'high',
    cost: 'medium',
    maxTokens: 10000,
    temperature: 0.3,
    recommended: false
  }
}

/**
 * 分类服务默认配置
 */
export const CLASSIFIER_CONFIG = {
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
  }
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

/**
 * 获取模型列表
 * @param {string} provider - Provider 类型（可选）
 * @returns {Array} 模型列表
 */
export function getModelList(provider = null) {
  let models = Object.entries(CLASSIFIER_MODELS).map(([key, model]) => ({
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
  return CLASSIFIER_MODELS[modelKey] || null
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
