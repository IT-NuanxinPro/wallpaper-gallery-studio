import { Sub2apiProvider } from './openai-compatible-provider'
import { AI_PROVIDER } from '../../model'

export const AI_PROVIDERS = Object.freeze({ SUB2API: AI_PROVIDER })

const providers = Object.freeze({ [AI_PROVIDER]: Sub2apiProvider })

/** 共用 OpenAI 兼容连接，模型由当前会话选择。 */
export class AIProviderFactory {
  static create(type, config = {}) {
    if (type !== AI_PROVIDER) throw new Error('请使用当前配置的 OpenAI 兼容服务')
    return new providers[type](config)
  }

  static getSupportedTypes() {
    return Object.keys(providers)
  }
}

export const PROVIDER_DISPLAY = {
  [AI_PROVIDER]: {
    name: 'OpenAI 兼容服务',
    icon: '🤖',
    color: '#13C2C2',
    description: '识别壁纸内容，生成分类、描述和文件名',
    credentialFields: [{ key: 'apiKey', label: 'API Key', type: 'password', required: true }]
  }
}

export { BaseAIProvider } from './base-provider'
export { Sub2apiProvider, OpenAICompatibleProvider } from './openai-compatible-provider'
