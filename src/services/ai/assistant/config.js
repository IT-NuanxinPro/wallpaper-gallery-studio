/**
 * AI 助手服务配置
 * 独立于分类服务的配置
 */

import { AI_PROVIDERS } from '../core'

/**
 * 助手服务的模型配置
 */
export const ASSISTANT_MODELS = {
  'doubao-1.6': {
    id: 'doubao-seed-1-6-vision-250815',
    name: 'Doubao Seed 1.6 Vision',
    provider: AI_PROVIDERS.DOUBAO,
    description: '豆包视觉模型 1.6 版本',
    maxTokens: 4096,
    temperature: 0.7,
    recommended: true
  },
  'doubao-1.8': {
    id: 'doubao-seed-1-8-251228',
    name: 'Doubao Seed 1.8',
    provider: AI_PROVIDERS.DOUBAO,
    description: '豆包最新 1.8 版本',
    maxTokens: 4096,
    temperature: 0.7,
    recommended: false
  },
  'llama-3.2': {
    id: '@cf/meta/llama-3.2-11b-vision-instruct',
    name: 'Llama 3.2 11B Vision',
    provider: AI_PROVIDERS.CLOUDFLARE,
    description: 'Meta 的视觉理解模型',
    maxTokens: 10000,
    temperature: 0.7,
    recommended: false
  }
}

/**
 * 助手服务默认配置
 */
export const ASSISTANT_CONFIG = {
  defaultProvider: AI_PROVIDERS.DOUBAO,
  defaultModel: 'doubao-1.6',
  defaultSystemPrompt: 'default',
  conversation: {
    maxHistory: 20
  }
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
