/**
 * AI Provider 基类
 * 定义统一的接口规范
 */
export class BaseAIProvider {
  constructor(config = {}) {
    this.config = config
  }

  /**
   * 分析图片
   * @param {Object} params
   * @param {string} params.imageBase64 - Base64 编码的图片
   * @param {string} params.prompt - 提示词
   * @param {Object} params.credentials - 凭证信息
   * @returns {Promise<Object>} 分析结果
   */
  async analyze({ imageBase64: _imageBase64, prompt: _prompt, credentials: _credentials }) {
    throw new Error('analyze() must be implemented by subclass')
  }

  /**
   * 验证凭证
   * @param {Object} _credentials - 凭证信息
   * @returns {boolean} 是否有效
   */
  validateCredentials(_credentials) {
    throw new Error('validateCredentials() must be implemented by subclass')
  }

  /**
   * 获取 Provider 名称
   * @returns {string}
   */
  getName() {
    return this.constructor.name
  }
}
