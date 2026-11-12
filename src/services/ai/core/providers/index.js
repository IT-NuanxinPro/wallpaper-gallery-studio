import { Sub2apiProvider } from './openai-compatible-provider'
import { AI_PROVIDER } from '../../model'

export const AI_PROVIDERS = Object.freeze({ SUB2API: AI_PROVIDER })

const providers = Object.freeze({ [AI_PROVIDER]: Sub2apiProvider })

/** 仅开放当前支持的模型服务，不允许历史选项重新注册已下架服务。 */
export class AIProviderFactory {
  static create(type, config = {}) {
    if (type !== AI_PROVIDER) throw new Error('AI 服务已下架，请使用 GPT-6.1 Sol')
    return new providers[type](config)
  }

  static getSupportedTypes() {
    return Object.keys(providers)
  }
}

export const PROVIDER_DISPLAY = {
  [AI_PROVIDER]: {
    name: 'GPT-6.1 Sol',
    icon: '🤖',
    color: '#13C2C2',
    description: '识别壁纸内容，生成分类、描述和文件名',
    credentialFields: [{ key: 'apiKey', label: 'API Key', type: 'password', required: true }]
  }
}

export { BaseAIProvider } from './base-provider'
export { Sub2apiProvider, OpenAICompatibleProvider } from './openai-compatible-provider'
