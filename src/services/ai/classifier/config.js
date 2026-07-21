/**
 * 分类服务配置
 * 独立于 AI 助手的配置
 */

import { AI_PROVIDERS } from '../core'

/**
 * 分类服务的模型配置
 */
export const CLASSIFIER_MODELS = {
  // Groq AI 模型
  // 注：Groq 已下线 llama-4-scout / llama-4-maverick（2026-07），
  // 目前唯一在线的视觉模型是 qwen/qwen3.6-27b
  // 免费层限额 8000 TPM，约 1.7 张图/分钟
  'groq-qwen3.6-27b': {
    id: 'qwen/qwen3.6-27b',
    name: 'Qwen3.6 27B Vision (Groq)',
    provider: AI_PROVIDERS.GROQ,
    description: 'Groq 视觉模型，131K 上下文。免费层每分钟仅 ~1.7 张图',
    speed: 'fast',
    accuracy: 'high',
    cost: 'low',
    maxTokens: 4096,
    temperature: 0.7,
    recommended: false
  },

  // 智谱 GLM 视觉模型（免费层可用，推荐）
  // 注意：glm-4v-flash 免费模型 max_tokens 上限为 1024
  'zhipu-glm-4v-flash': {
    id: 'glm-4v-flash',
    name: 'GLM-4V Flash (免费)',
    provider: AI_PROVIDERS.ZHIPU,
    description: '智谱免费视觉模型，直接回答无推理，速度快',
    speed: 'fast',
    accuracy: 'high',
    cost: 'low',
    maxTokens: 1024,
    temperature: 0.7,
    recommended: true
  },

  'zhipu-glm-4.1v-thinking-flash': {
    id: 'glm-4.1v-thinking-flash',
    name: 'GLM-4.1V Thinking Flash (免费)',
    provider: AI_PROVIDERS.ZHIPU,
    description: '智谱免费推理视觉模型，带 <think> 推理过程，分析更深入',
    speed: 'medium',
    accuracy: 'high',
    cost: 'low',
    maxTokens: 1024,
    temperature: 0.7,
    recommended: false
  },

  // Cloudflare Workers AI
  'cloudflare-llama-3.2': {
    id: '@cf/meta/llama-3.2-11b-vision-instruct',
    name: 'Llama 3.2 11B Vision (CF)',
    provider: AI_PROVIDERS.CLOUDFLARE,
    description: 'Cloudflare 托管的 Llama 3.2 视觉模型',
    speed: 'medium',
    accuracy: 'high',
    cost: 'low',
    maxTokens: 10000,
    temperature: 0.3,
    recommended: false
  },

  'cloudflare-llava-1.5': {
    id: '@cf/llava-hf/llava-1.5-7b-hf',
    name: 'LLaVA 1.5 7B (CF)',
    provider: AI_PROVIDERS.CLOUDFLARE,
    description: 'Cloudflare 托管的 LLaVA 视觉模型',
    speed: 'medium',
    accuracy: 'medium',
    cost: 'low',
    maxTokens: 2048,
    temperature: 0.3,
    recommended: false
  }
}

/**
 * 分类服务默认配置
 */
export const CLASSIFIER_CONFIG = {
  // 默认 Provider（智谱 GLM 免费层无限流，优先于 Groq）
  defaultProvider: AI_PROVIDERS.ZHIPU,

  // 默认模型
  defaultModel: 'zhipu-glm-4v-flash',

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
  defaultProvider: AI_PROVIDERS.ZHIPU,
  defaultModel: 'zhipu-glm-4v-flash',
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
