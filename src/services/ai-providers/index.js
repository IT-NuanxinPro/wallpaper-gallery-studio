import { CloudflareProvider } from './cloudflare-provider'
import { DoubaoProvider } from './doubao-provider'

/**
 * Provider 工厂
 * 根据类型创建对应的 Provider 实例
 */
export class AIProviderFactory {
  static providers = {
    cloudflare: CloudflareProvider,
    doubao: DoubaoProvider
  }

  /**
   * 创建 Provider 实例
   * @param {string} type - Provider 类型 (cloudflare, doubao)
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

export { CloudflareProvider, DoubaoProvider }
