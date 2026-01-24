/**
 * AI 助手服务配置
 * 独立于分类服务的配置
 */

import { AI_PROVIDERS } from '../core'

/**
 * 助手服务的模型配置
 */
export const ASSISTANT_MODELS = {
  // Groq AI 模型（默认推荐）
  'groq-llama-4-scout': {
    id: 'meta-llama/llama-4-scout-17b-16e-instruct',
    name: 'Llama 4 Scout Vision',
    provider: AI_PROVIDERS.GROQ,
    description: 'Groq 最新视觉模型，速度极快',
    maxTokens: 1024,
    temperature: 0.7,
    recommended: true,
    speed: 'fast',
    accuracy: 'high',
    cost: 'low'
  },
  // Groq AI - Maverick 模型（更强大的上下文）
  'groq-llama-4-maverick': {
    id: 'meta-llama/llama-4-maverick-17b-128e-instruct',
    name: 'Llama 4 Maverick Vision',
    provider: AI_PROVIDERS.GROQ,
    description: 'Groq 超长上下文模型（128K），分析更深入',
    maxTokens: 2048,
    temperature: 0.7,
    recommended: false,
    speed: 'fast',
    accuracy: 'high',
    cost: 'low'
  },
  'doubao-1.8': {
    id: 'doubao-seed-1-8-251228',
    name: 'Doubao Seed 1.8',
    provider: AI_PROVIDERS.DOUBAO,
    description: '豆包最新 1.8 版本',
    maxTokens: 4096,
    temperature: 0.7,
    recommended: false,
    speed: 'fast',
    accuracy: 'high',
    cost: 'low'
  },
  // Cloudflare Workers AI - Scout 模型
  'cloudflare-llama-4-scout': {
    id: '@cf/meta/llama-4-scout-17b-16e-instruct',
    name: 'Llama 4 Scout Vision (CF)',
    provider: AI_PROVIDERS.CLOUDFLARE,
    description: 'Cloudflare 托管的 Scout 模型',
    maxTokens: 1024,
    temperature: 0.7,
    recommended: false,
    speed: 'medium',
    accuracy: 'high',
    cost: 'low'
  },
  'cloudflare-llama-3.2': {
    id: '@cf/meta/llama-3.2-11b-vision-instruct',
    name: 'Llama 3.2 11B Vision (CF)',
    provider: AI_PROVIDERS.CLOUDFLARE,
    description: 'Cloudflare 托管的 Llama 3.2 视觉模型',
    maxTokens: 10000,
    temperature: 0.7,
    recommended: false,
    speed: 'medium',
    accuracy: 'high',
    cost: 'medium'
  }
}

/**
 * 助手服务默认配置
 */
export const ASSISTANT_CONFIG = {
  defaultProvider: AI_PROVIDERS.GROQ,
  defaultModel: 'groq-llama-4-scout',
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
 */
export function getModelList(provider = null) {
  let models = Object.entries(ASSISTANT_MODELS).map(([key, model]) => ({
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
 */
export function getModelByKey(modelKey) {
  return ASSISTANT_MODELS[modelKey] || null
}

/**
 * 获取推荐模型
 */
export function getRecommendedModel(provider = null) {
  const models = getModelList(provider)
  const recommended = models.find(m => m.recommended)
  return recommended || models[0] || null
}
