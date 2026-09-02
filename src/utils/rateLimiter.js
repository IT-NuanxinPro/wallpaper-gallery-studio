/**
 * 速率限制器
 * 用于控制 API 请求频率，避免触发速率限制
 */

export class RateLimiter {
  constructor(options = {}) {
    this.maxRequests = options.maxRequests || 10 // 最大并发请求数
    this.minInterval = options.minInterval || 1000 // 最小请求间隔（毫秒）
    this.retryAttempts = options.retryAttempts || 3 // 重试次数
    this.retryDelay = options.retryDelay || 2000 // 重试延迟（毫秒）

    this.queue = []
    this.activeRequests = 0
    this.lastRequestTime = 0
  }

  /**
   * 执行请求（带速率限制）
   * @param {Function} fn - 要执行的异步函数
   * @param {Object} context - 上下文信息（用于日志）
   * @returns {Promise} 执行结果
   */
  async execute(fn, context = {}) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, context, resolve, reject, attempts: 0 })
      this.processQueue()
    })
  }

  /**
   * 处理队列
   */
  async processQueue() {
    // 如果达到最大并发数，等待
    if (this.activeRequests >= this.maxRequests) {
      return
    }

    // 如果队列为空，返回
    if (this.queue.length === 0) {
      return
    }

    // 检查距离上次请求的时间间隔
    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime
    if (timeSinceLastRequest < this.minInterval) {
      // 等待到达最小间隔
      setTimeout(() => this.processQueue(), this.minInterval - timeSinceLastRequest)
      return
    }

    // 取出队列中的第一个请求
    const task = this.queue.shift()
    this.activeRequests++
    this.lastRequestTime = Date.now()

    try {
      const result = await task.fn()
      task.resolve(result)
    } catch (error) {
      // 检查是否是速率限制错误
      if (this.isRateLimitError(error) && task.attempts < this.retryAttempts) {
        // 重试
        task.attempts++

        // 尝试从错误消息中解析服务端提示的重试等待时间（如 "Please try again in 15.014s"）
        const suggestedDelay = this.parseRetryAfter(error)
        // 优先用服务器建议的等待时间，否则用指数退避
        const delay = suggestedDelay > 0 ? suggestedDelay : this.retryDelay * task.attempts

        console.warn(
          `[RateLimiter] 速率限制，${(delay / 1000).toFixed(1)}s 后重试 ${task.attempts}/${this.retryAttempts}:`,
          task.context
        )

        // 延迟后重新加入队列
        setTimeout(() => {
          this.queue.unshift(task) // 放回队列开头
          this.processQueue()
        }, delay)
      } else {
        task.reject(error)
      }
    } finally {
      this.activeRequests--
      // 继续处理队列
      setTimeout(() => this.processQueue(), this.minInterval)
    }
  }

  /**
   * 判断是否是速率限制错误
   * @param {Error} error - 错误对象
   * @returns {boolean}
   */
  isRateLimitError(error) {
    const message = error.message || ''
    const errorStr = error.toString().toLowerCase()

    return (
      message.includes('rate limit') ||
      message.includes('Rate limit reached') ||
      message.includes('429') ||
      message.includes('too many requests') ||
      message.includes('频率超限') ||
      errorStr.includes('rate_limit_exceeded')
    )
  }

  /**
   * 从错误消息中解析服务端建议的等待时间
   * 例如："Please try again in 15.014999999s" → 16000ms（多等 1s 留余量）
   * @param {Error} error - 错误对象
   * @returns {number} 毫秒数，未识别时返回 0
   */
  parseRetryAfter(error) {
    const message = error.message || ''
    const match = message.match(/try again in\s+([\d.]+)\s*s/i)
    if (match) {
      const seconds = parseFloat(match[1])
      if (!isNaN(seconds) && seconds > 0) {
        return Math.ceil(seconds * 1000) + 1000 // 多等 1 秒保险
      }
    }
    return 0
  }

  /**
   * 获取队列状态
   * @returns {Object}
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      activeRequests: this.activeRequests,
      maxRequests: this.maxRequests
    }
  }

  /**
   * 清空队列
   */
  clear() {
    this.queue = []
    this.activeRequests = 0
  }
}

/**
 * 创建 Groq 专用的速率限制器
 * qwen/qwen3.6-27b 免费层限额：8000 TPM
 * 单次请求约 4500 tokens（图片+长提示词），约 1.7 req/min
 * 配置为：并发 1，间隔 35 秒，刚好压在 TPM 内
 */
export function createGroqRateLimiter() {
  return new RateLimiter({
    maxRequests: 1, // 严格串行，避免 tokens 叠加
    minInterval: 35000, // 35 秒/请求（8000 TPM ÷ 4600 tokens/req ≈ 1.7 req/min）
    retryAttempts: 5, // 多给几次重试机会
    retryDelay: 16000 // 基础重试延迟 16 秒（Groq 通常提示 15s 后重试）
  })
}

/**
 * 创建智谱 GLM 视觉请求专用队列。
 * GLM 图片分析在上传工作台中按单请求串行执行，用户可以一次选择很多张图片，
 * 后续请求会在本地排队；若触发 429/1302，则自动退避后重试。
 */
export function createZhipuRateLimiter() {
  return new RateLimiter({
    maxRequests: 1,
    minInterval: 1500,
    retryAttempts: 5,
    retryDelay: 5000
  })
}
