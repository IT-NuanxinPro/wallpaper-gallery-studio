/**
 * 分类服务配置
 * 独立于 AI 助手的配置
 */

import { AI_PROVIDERS } from '../core'

/**
 * 分类服务的模型配置
 */
export const CLASSIFIER_MODELS = {
  // Groq AI 模型（默认推荐）
  'groq-llama-4-scout': {
    id: 'meta-llama/llama-4-scout-17b-16e-instruct',
    name: 'Llama 4 Scout Vision',
    provider: AI_PROVIDERS.GROQ,
    description: 'Groq 最新视觉模型，速度极快，准确度高',
    speed: 'fast',
    accuracy: 'high',
    cost: 'low',
    maxTokens: 1024,
    temperature: 1,
    recommended: true
  },

  // 豆包 AI 模型
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
  }
}

/**
 * 分类服务默认配置
 */
export const CLASSIFIER_CONFIG = {
  // 默认 Provider
  defaultProvider: AI_PROVIDERS.GROQ,

  // 默认模型
  defaultModel: 'groq-llama-4-scout',

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
