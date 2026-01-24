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
        console.warn(
          `[RateLimiter] 速率限制，重试 ${task.attempts}/${this.retryAttempts}:`,
          task.context
        )

        // 延迟后重新加入队列
        setTimeout(() => {
          this.queue.unshift(task) // 放回队列开头
          this.processQueue()
        }, this.retryDelay * task.attempts) // 指数退避
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
      message.includes('429') ||
      message.includes('too many requests') ||
      message.includes('频率超限') ||
      errorStr.includes('rate_limit_exceeded')
    )
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
 * 根据 Groq 免费版限制：30000 TPM, 14400 RPD
 */
export function createGroqRateLimiter() {
  return new RateLimiter({
    maxRequests: 3, // 最多 3 个并发请求
    minInterval: 2000, // 每个请求间隔 2 秒
    retryAttempts: 3, // 重试 3 次
    retryDelay: 3000 // 重试延迟 3 秒
  })
}

/**
 * 创建豆包专用的速率限制器
 */
export function createDoubaoRateLimiter() {
  return new RateLimiter({
    maxRequests: 5, // 最多 5 个并发请求
    minInterval: 1000, // 每个请求间隔 1 秒
    retryAttempts: 3,
    retryDelay: 2000
  })
}
