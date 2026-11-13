import { AI_PROVIDER, normalizeModelId } from '../model'

export const CLASSIFIER_CONFIG = {
  defaultProvider: AI_PROVIDER,
  defaultPromptTemplate: 'default',
  image: {
    maxSize: 1024,
    quality: 0.9,
    format: 'image/jpeg'
  }
}

export function getModelByKey(modelKey) {
  const id = normalizeModelId(modelKey)
  return id ? { id, key: id, name: id, provider: AI_PROVIDER } : null
}
