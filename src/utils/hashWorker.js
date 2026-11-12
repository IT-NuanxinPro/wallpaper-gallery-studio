/**
 * Hash Worker 管理器
 * 管理Web Worker的生命周期和任务调度
 */
class HashWorker {
  constructor() {
    this.worker = null
    this.pending = new Map()
  }

  /**
   * 初始化Worker
   */
  init() {
    if (this.worker) return

    // eslint-disable-next-line no-undef
    this.worker = new Worker(new URL('./hash.worker.js', import.meta.url), { type: 'module' })
    this.worker.onmessage = e => {
      const { id, hash, success, error } = e.data
      const pending = this.pending.get(id)

      if (pending) {
        if (success) {
          pending.resolve(hash)
        } else {
          pending.reject(new Error(error))
        }
        this.pending.delete(id)
      }
    }

    this.worker.onerror = error => {
      console.error('Hash Worker错误:', error)
      // 清理所有待处理的任务
      this.pending.forEach(pending => {
        pending.reject(new Error('Worker执行失败'))
      })
      this.pending.clear()
    }
  }

  /**
   * 计算文件哈希值
   * @param {File} file - 要计算哈希的文件
   * @returns {Promise<string>} 哈希值
   */
  async computeHash(file) {
    this.init()

    const id = Date.now().toString(36) + Math.random().toString(36).substr(2)
    const fileData = await file.arrayBuffer()

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      // 使用Transferable Objects优化性能
      this.worker.postMessage({ id, fileData }, [fileData])
    })
  }

  /**
   * 终止Worker并清理资源
   */
  terminate() {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    this.pending.clear()
  }

  /**
   * 获取当前待处理任务数量
   */
  get pendingCount() {
    return this.pending.size
  }
}

// 导出单例
export const hashWorker = new HashWorker()
