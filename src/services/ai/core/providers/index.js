import { CloudflareProvider } from './cloudflare-provider'
import { GroqProvider } from './groq-provider'
import { ZhipuProvider } from './zhipu-provider'
import { Sub2apiProvider } from './openai-compatible-provider'

/**
 * AI Provider 类型
 */
export const AI_PROVIDERS = {
  CLOUDFLARE: 'cloudflare',
  GROQ: 'groq',
  ZHIPU: 'zhipu',
  SUB2API: 'sub2api'
}

/**
 * Provider 工厂
 * 根据类型创建对应的 Provider 实例
 */
export class AIProviderFactory {
  static providers = {
    cloudflare: CloudflareProvider,
    groq: GroqProvider,
    zhipu: ZhipuProvider,
    sub2api: Sub2apiProvider
  }

  /**
   * 创建 Provider 实例
   * @param {string} type - Provider 类型 (cloudflare, groq, zhipu)
   * @param {Object} config - Provider 配置
   * @returns {BaseAIProvider}
   */
  static create(type, config = {}) {
    const ProviderClass = this.providers[type]
    if (!ProviderClass) {
      throw new Error(`Unknown AI provider type: ${type}`)
    }
    return new ProviderClass(config)
  }

  /**
   * 获取所有支持的 Provider 类型
   * @returns {string[]}
   */
  static getSupportedTypes() {
    return Object.keys(this.providers)
  }

  /**
   * 注册新的 Provider
   * @param {string} type - Provider 类型
   * @param {Class} ProviderClass - Provider 类
   */
  static register(type, ProviderClass) {
    this.providers[type] = ProviderClass
  }
}

/**
 * Provider 显示配置
 */
export const PROVIDER_DISPLAY = {
  [AI_PROVIDERS.ZHIPU]: {
    name: '智谱 GLM',
    icon: '🧠',
    color: '#3B5BFD',
    description: '智谱 GLM-4V 视觉模型，提供免费层',
    credentialFields: [{ key: 'apiKey', label: 'API Key', type: 'password', required: true }]
  },
  [AI_PROVIDERS.GROQ]: {
    name: 'Groq AI',
    icon: '⚡',
    color: '#F55036',
    description: 'Groq 超快速 AI 推理服务（免费层每分钟仅 ~1.7 张图）',
    credentialFields: [{ key: 'apiKey', label: 'API Key', type: 'password', required: true }]
  },
  [AI_PROVIDERS.CLOUDFLARE]: {
    name: 'Cloudflare Workers AI',
    icon: '☁️',
    color: '#F38020',
    description: 'Cloudflare 提供的 AI 服务',
    disabled: true,
    credentialFields: [
      { key: 'accountId', label: 'Account ID', type: 'text', required: true },
      { key: 'apiToken', label: 'API Token', type: 'password', required: true }
    ]
  },
  [AI_PROVIDERS.SUB2API]: {
    name: 'Grok',
    icon: '🤖',
    color: '#13C2C2',
    description: 'Grok 视觉模型，支持图片分类与元数据生成',
    credentialFields: [{ key: 'apiKey', label: 'API Key', type: 'password', required: true }]
  }
}

export { BaseAIProvider } from './base-provider'
export { CloudflareProvider, GroqProvider, ZhipuProvider }
export { Sub2apiProvider, OpenAICompatibleProvider } from './openai-compatible-provider'
