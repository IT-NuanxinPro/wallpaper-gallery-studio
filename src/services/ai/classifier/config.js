/**
 * 分类服务配置
 * 独立于 AI 助手的配置
 */

import { AI_PROVIDER, AI_MODEL_KEY, AI_MODEL_ID } from '../model'

/**
 * 分类服务的模型配置
 */
export const CLASSIFIER_MODELS = {
  [AI_MODEL_KEY]: {
    id: AI_MODEL_ID,
    name: 'GPT-6.1 Sol',
    provider: AI_PROVIDER,
    description: '通过 sub2api 识别壁纸内容，生成分类、描述和文件名',
    speed: 'fast',
    accuracy: 'high',
    cost: 'medium',
    maxTokens: 4096,
    temperature: 0.7,
    reasoningEffort: 'low',
    recommended: true
  }
}

/**
 * 分类服务默认配置
 */
const defaultModel = AI_MODEL_KEY

export const CLASSIFIER_CONFIG = {
  // 所有功能使用同一固定模型，忽略旧环境和本地选择。
  defaultProvider: CLASSIFIER_MODELS[defaultModel].provider,

  // 默认模型
  defaultModel,

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
 * AI 助手默认配置（与分类服务共享模型列表）
 */
export const ASSISTANT_CONFIG = {
  defaultProvider: CLASSIFIER_CONFIG.defaultProvider,
  defaultModel,
  defaultSystemPrompt: 'default',
  conversation: {
    maxHistory: 20
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
