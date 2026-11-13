import { AI_PROVIDER, AI_MODEL_KEY, AI_MODEL_ID } from '../model'

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

const defaultModel = AI_MODEL_KEY

export const CLASSIFIER_CONFIG = {
  defaultProvider: CLASSIFIER_MODELS[defaultModel].provider,

  defaultModel,

  defaultPromptTemplate: 'default',

  image: {
    maxSize: 1024,
    quality: 0.9,
    format: 'image/jpeg'
  }
}

export const SPEED_LEVELS = {
  fast: { label: '快', value: 3, color: '#67c23a' },
  medium: { label: '中等', value: 2, color: '#e6a23c' },
  slow: { label: '慢', value: 1, color: '#f56c6c' }
}

export const ACCURACY_LEVELS = {
  high: { label: '高', value: 3, color: '#67c23a' },
  medium: { label: '中等', value: 2, color: '#e6a23c' },
  low: { label: '低', value: 1, color: '#f56c6c' }
}

export const COST_LEVELS = {
  low: { label: '低', value: 1, color: '#67c23a' },
  medium: { label: '中等', value: 2, color: '#e6a23c' },
  high: { label: '高', value: 3, color: '#f56c6c' }
}

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

export function getModelByKey(modelKey) {
  return CLASSIFIER_MODELS[modelKey] || null
}

export function getRecommendedModel(provider = null) {
  const models = getModelList(provider)
  const recommended = models.find(m => m.recommended)
  return recommended || models[0] || null
}
