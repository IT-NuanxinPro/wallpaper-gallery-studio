/**
 * GitHub API 服务
 * 处理认证、仓库内容、文件操作等
 */

const API_BASE = 'https://api.github.com'
const MAX_RETRIES = 3
const RETRY_DELAY = 1000

/**
 * GitHub 服务类
 */
class GitHubService {
  constructor() {
    this.token = null
    // API 配额信息
    this.rateLimit = {
      limit: 5000,
      remaining: 5000,
      reset: null,
      used: 0
    }
  }

  /**
   * 获取当前配额信息
   */
  getRateLimit() {
    return { ...this.rateLimit }
  }

  /**
   * 设置访问令牌
   */
  setToken(token) {
    this.token = token
  }

  /**
   * 获取请求头
   */
  getHeaders() {
    const headers = {
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    }
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }
    return headers
  }

  /**
   * 基础请求封装，支持重试
   */
  async request(endpoint, options = {}, retries = MAX_RETRIES) {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.getHeaders(),
          ...options.headers
        }
      })

      // 更新配额信息
      const limit = response.headers.get('X-RateLimit-Limit')
      const remaining = response.headers.get('X-RateLimit-Remaining')
      const resetTime = response.headers.get('X-RateLimit-Reset')
      const used = response.headers.get('X-RateLimit-Used')

      if (limit) this.rateLimit.limit = parseInt(limit)
      if (remaining) this.rateLimit.remaining = parseInt(remaining)
      if (resetTime) this.rateLimit.reset = new Date(parseInt(resetTime) * 1000)
      if (used) this.rateLimit.used = parseInt(used)

      if (response.status === 403 && remaining === '0') {
        const resetDate = new Date(parseInt(resetTime) * 1000)
        throw {
          type: 'RATE_LIMITED',
          message: 'API 请求过于频繁',
          resetTime: resetDate
        }
      }

      // 检查 token 过期
      if (response.status === 401) {
        throw {
          type: 'TOKEN_EXPIRED',
          message: '登录已过期，请重新登录'
        }
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))

        // 403 权限不足
        if (response.status === 403 && remaining !== '0') {
          throw {
            type: 'PERMISSION_DENIED',
            message: '权限不足，您没有该仓库的写入权限',
            status: response.status
          }
        }

        // 404 资源不存在
        if (response.status === 404) {
          throw {
            type: 'NOT_FOUND',
            message: error.message || '资源不存在',
            status: response.status
          }
        }

        throw {
          type: 'API_ERROR',
          message: error.message || `请求失败: ${response.status}`,
          status: response.status
        }
      }

      // 204 No Content
      if (response.status === 204) {
        return null
      }

      return await response.json()
    } catch (error) {
      // 网络错误重试
      if (error.name === 'TypeError' && retries > 0) {
        await this.delay(RETRY_DELAY)
        return this.request(endpoint, options, retries - 1)
      }

      // 已处理的错误直接抛出
      if (error.type) {
        throw error
      }

      throw {
        type: 'NETWORK_ERROR',
        message: '网络连接失败，请检查网络',
        original: error
      }
    }
  }

  /**
   * 延迟函数
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // ============ OAuth 认证 ============

  /**
   * 构建 OAuth 授权 URL
   */
  getAuthUrl(clientId, redirectUri, scope = 'repo') {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scope
    })
    return `https://github.com/login/oauth/authorize?${params.toString()}`
  }

  /**
   * 使用 code 交换 token（需要后端代理）
   * 注意：由于 CORS 限制，这个请求需要通过后端代理
   */
  async exchangeCodeForToken(_code, _clientId, _clientSecret, _redirectUri) {
    // 这里需要后端代理，前端无法直接调用
    // 返回格式: { access_token, token_type, scope }
    throw new Error('需要后端代理实现 token 交换')
  }

  // ============ 用户信息 ============

  /**
   * 获取当前用户信息
   */
  async getCurrentUser() {
    return this.request('/user')
  }

  /**
   * 检查用户对仓库的权限
   */
  async checkRepoAccess(owner, repo) {
    try {
      const data = await this.request(`/repos/${owner}/${repo}`)

      console.log('[GitHub] 仓库权限检查:', {
        repo: `${owner}/${repo}`,
        permissions: data.permissions
      })

      if (data.permissions) {
        if (data.permissions.admin) {
          console.log('[GitHub] 检测到管理员权限')
          return 'admin'
        }
        if (data.permissions.push) {
          console.log('[GitHub] 检测到写入权限')
          return 'write'
        }
        if (data.permissions.pull) {
          console.log('[GitHub] 检测到读取权限')
          return 'read'
        }
        console.log('[GitHub] 无权限')
        return 'none'
      }

      console.log('[GitHub] 无 permissions 字段，默认为读取权限')
      return 'read'
    } catch (error) {
      if (error.status === 404) {
        console.log('[GitHub] 仓库不存在或无访问权限')
        return 'none'
      }
      throw error
    }
  }

  // ============ 仓库内容 ============

  /**
   * 获取目录内容
   */
  async getContents(owner, repo, path = '', branch = 'main') {
    const endpoint = `/repos/${owner}/${repo}/contents/${path}`
    const params = branch ? `?ref=${branch}` : ''
    return this.request(endpoint + params)
  }

  /**
   * 获取完整目录树
   */
  async getTree(owner, repo, sha, recursive = true) {
    const endpoint = `/repos/${owner}/${repo}/git/trees/${sha}`
    const params = recursive ? '?recursive=1' : ''
    return this.request(endpoint + params)
  }

  /**
   * 检查文件是否存在
   */
  async checkFileExists(owner, repo, path, branch = 'main') {
    try {
      await this.request(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`)
      return true
    } catch (error) {
      if (error.status === 404) {
        return false
      }
      throw error
    }
  }

  // ============ 文件操作 ============

  /**
   * 创建或更新文件
   */
  async createFile(owner, repo, path, content, message, branch = 'main', sha = null) {
    const endpoint = `/repos/${owner}/${repo}/contents/${path}`

    const body = {
      message,
      content: this.toBase64(content),
      branch
    }

    // 如果是更新文件，需要提供 sha
    if (sha) {
      body.sha = sha
    }

    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body)
    })
  }

  /**
   * 上传图片文件
   */
  async uploadImage(owner, repo, path, file, message, branch = 'main') {
    const content = await this.fileToBase64(file)

    // 检查文件是否存在
    let sha = null
    try {
      const existing = await this.request(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`)
      sha = existing.sha
    } catch {
      // 文件不存在，正常创建
    }

    const endpoint = `/repos/${owner}/${repo}/contents/${path}`
    const body = {
      message,
      content,
      branch
    }

    if (sha) {
      body.sha = sha
    }

    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body)
    })
  }

  /**
   * 删除文件
   */
  async deleteFile(owner, repo, path, sha, message, branch = 'main') {
    const endpoint = `/repos/${owner}/${repo}/contents/${path}`

    return this.request(endpoint, {
      method: 'DELETE',
      body: JSON.stringify({
        message,
        sha,
        branch
      })
    })
  }

  // ============ Workflow ============

  /**
   * 获取仓库的所有 tags
   */
  async getTags(owner, repo, perPage = 10) {
    const endpoint = `/repos/${owner}/${repo}/tags?per_page=${perPage}`
    return this.request(endpoint)
  }

  /**
   * 获取 stats.json 统计文件
   */
  async getStats(owner, repo, branch = 'main') {
    try {
      const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/stats.json?t=${Date.now()}`
      const response = await fetch(url)
      if (!response.ok) return null
      return await response.json()
    } catch {
      return null
    }
  }

  /**
   * 获取最新的 tag（包含详细信息）
   */
  async getLatestTag(owner, repo) {
    try {
      const tags = await this.getTags(owner, repo, 1)
      if (!tags[0]) return null

      const tag = tags[0]
      // 获取 tag 对应的 commit 详情
      const commit = await this.request(`/repos/${owner}/${repo}/commits/${tag.commit.sha}`)

      return {
        name: tag.name,
        sha: tag.commit.sha,
        date: commit.commit.committer.date,
        author: commit.commit.author.name,
        message: commit.commit.message
      }
    } catch {
      return null
    }
  }

  /**
   * 对比两个 commit/tag 之间的差异
   */
  async compareCommits(owner, repo, base, head) {
    // 添加时间戳避免缓存
    const endpoint = `/repos/${owner}/${repo}/compare/${base}...${head}`
    return this.request(endpoint)
  }

  /**
   * 获取待处理的新图片（基于最新 tag 到 HEAD 的 diff）
   */
  async getPendingImages(owner, repo, branch = 'main') {
    try {
      const latestTag = await this.getLatestTag(owner, repo)

      if (!latestTag) {
        // 没有 tag，返回空（首次需要手动处理）
        return {
          pendingCount: 0,
          pendingFiles: [],
          latestTag: null,
          latestTagInfo: null,
          message: '没有找到版本标签，请先手动运行工作流'
        }
      }

      // 先获取最新的 branch HEAD commit
      const branchRef = await this.request(`/repos/${owner}/${repo}/git/ref/heads/${branch}`)
      const headSha = branchRef.object.sha

      // 使用 commit SHA 而不是 branch 名称，确保获取最新数据
      const comparison = await this.compareCommits(owner, repo, latestTag.sha, headSha)

      // 筛选新增的图片文件
      const imageExtensions = /\.(jpg|jpeg|png)$/i
      const pendingFiles = (comparison.files || [])
        .filter(
          f =>
            f.status === 'added' &&
            f.filename.startsWith('wallpaper/') &&
            imageExtensions.test(f.filename)
        )
        .map(f => ({
          filename: f.filename,
          status: f.status,
          // 解析路径信息
          series: f.filename.split('/')[1], // desktop/mobile/avatar
          category: f.filename.split('/').slice(2, -1).join('/')
        }))

      return {
        pendingCount: pendingFiles.length,
        pendingFiles,
        latestTag: latestTag.name,
        latestTagInfo: latestTag,
        totalCommits: comparison.total_commits,
        aheadBy: comparison.ahead_by
      }
    } catch (error) {
      console.error('Failed to get pending images:', error)
      return {
        pendingCount: 0,
        pendingFiles: [],
        latestTag: null,
        latestTagInfo: null,
        error: error.message
      }
    }
  }

  /**
   * 触发 GitHub Actions workflow (repository_dispatch)
   * 注意：需要对目标仓库有写入权限
   */
  async triggerWorkflow(owner, repo, eventType = 'process-wallpapers', payload = {}) {
    const endpoint = `/repos/${owner}/${repo}/dispatches`

    try {
      return await this.request(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          event_type: eventType,
          client_payload: payload
        })
      })
    } catch (error) {
      // 404 通常表示没有权限访问该仓库
      if (error.status === 404 || error.type === 'NOT_FOUND') {
        throw {
          type: 'WORKFLOW_PERMISSION_DENIED',
          message: `无法触发工作流：您没有 ${owner}/${repo} 仓库的写入权限。请确保您的 GitHub 账号对该仓库有 push 权限。`
        }
      }
      throw error
    }
  }

  /**
   * 删除 tag
   */
  async deleteTag(owner, repo, tagName) {
    const endpoint = `/repos/${owner}/${repo}/git/refs/tags/${tagName}`
    return this.request(endpoint, { method: 'DELETE' })
  }

  /**
   * 删除 release
   */
  async deleteRelease(owner, repo, releaseId) {
    const endpoint = `/repos/${owner}/${repo}/releases/${releaseId}`
    return this.request(endpoint, { method: 'DELETE' })
  }

  /**
   * 获取 tag 对应的 release
   */
  async getReleaseByTag(owner, repo, tagName) {
    try {
      const endpoint = `/repos/${owner}/${repo}/releases/tags/${tagName}`
      return await this.request(endpoint)
    } catch {
      return null
    }
  }

  /**
   * 回滚到上一个 tag（触发工作流进行完整回滚）
   * 会删除该 tag 新增的文件、更新 timestamps、删除 tag 和 release
   */
  async rollbackToLastTag(owner, repo, workflowOwner, workflowRepo, tagName = '') {
    // 如果没有指定 tag，获取最新的
    if (!tagName) {
      const tags = await this.getTags(owner, repo, 2)
      if (tags.length < 1) {
        throw { type: 'ROLLBACK_ERROR', message: '没有 tag 可以回滚' }
      }
      tagName = tags[0].name
    }

    // 触发回滚工作流
    await this.triggerWorkflow(workflowOwner, workflowRepo, 'rollback-release', {
      tag: tagName
    })

    return {
      deletedTag: tagName,
      message: '回滚工作流已触发，请等待完成'
    }
  }

  /**
   * 获取最近的工作流运行状态
   */
  async getWorkflowRuns(owner, repo, perPage = 5) {
    const endpoint = `/repos/${owner}/${repo}/actions/runs?per_page=${perPage}`
    return this.request(endpoint)
  }

  /**
   * 检查是否有正在运行的工作流
   */
  async hasRunningWorkflow(owner, repo) {
    try {
      const data = await this.getWorkflowRuns(owner, repo, 5)
      const runs = data.workflow_runs || []

      // 检查是否有 queued 或 in_progress 状态的运行
      const running = runs.find(run => run.status === 'queued' || run.status === 'in_progress')

      return {
        hasRunning: !!running,
        runningWorkflow: running || null,
        latestRun: runs[0] || null
      }
    } catch (error) {
      // 如果查询失败，允许触发（避免阻塞用户）
      console.warn('Failed to check workflow status:', error)
      return { hasRunning: false, runningWorkflow: null, latestRun: null }
    }
  }

  /**
   * 触发 GitHub Actions workflow (workflow_dispatch)
   * @deprecated 使用 triggerWorkflow 代替
   */
  async dispatchWorkflow(owner, repo, workflowId, ref = 'main', inputs = {}) {
    const endpoint = `/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`

    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        ref,
        inputs
      })
    })
  }

  /**
   * 通过工作流文件名触发 workflow_dispatch
   * @param {string} owner - 仓库所有者
   * @param {string} repo - 仓库名
   * @param {string} workflowFileName - 工作流文件名，如 'deploy.yml'
   * @param {string} ref - 分支名，默认 'main'
   * @param {object} inputs - 输入参数
   */
  async dispatchWorkflowByName(owner, repo, workflowFileName, ref = 'main', inputs = {}) {
    const endpoint = `/repos/${owner}/${repo}/actions/workflows/${workflowFileName}/dispatches`

    try {
      return await this.request(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          ref,
          inputs
        })
      })
    } catch (error) {
      if (error.status === 404 || error.type === 'NOT_FOUND') {
        throw {
          type: 'WORKFLOW_PERMISSION_DENIED',
          message: `无法触发工作流：您没有 ${owner}/${repo} 仓库的写入权限，或工作流文件 ${workflowFileName} 不存在。`
        }
      }
      throw error
    }
  }

  // ============ 工具方法 ============

  /**
   * 字符串转 Base64
   */
  toBase64(str) {
    return btoa(unescape(encodeURIComponent(str)))
  }

  /**
   * 文件转 Base64
   */
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        // 移除 data:xxx;base64, 前缀
        const base64 = reader.result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }
}

// 导出单例
export const githubService = new GitHubService()
export default githubService
