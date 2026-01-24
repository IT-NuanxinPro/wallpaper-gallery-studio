import { BaseAIProvider } from './base-provider'

/**
 * Cloudflare Workers AI Provider
 * 通过 Worker 代理调用 Cloudflare AI API（避免 CORS）
 */
export class CloudflareProvider extends BaseAIProvider {
  constructor(config = {}) {
    super(config)
    // 使用 Worker 代理 URL
    this.workerUrl = config.workerUrl || 'https://ai-proxy.han1569250882.workers.dev'
  }

  validateCredentials(credentials) {
    return !!(credentials?.accountId && credentials?.apiToken)
  }

  async analyze({ imageBase64, prompt, credentials }) {
    if (!this.validateCredentials(credentials)) {
      throw new Error('Cloudflare credentials are invalid')
    }

    const { accountId, apiToken, model } = credentials

    // 通过 Worker 代理调用
    const response = await fetch(this.workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        accountId,
        aiToken: apiToken,
        model,
        image: imageBase64.replace(/^data:image\/\w+;base64,/, ''),
        prompt,
        maxTokens: 10000,
        temperature: 0.3
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Cloudflare API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    return this.parseResponse(data)
  }

  parseResponse(data) {
    const content = data.result?.response || ''

    // 尝试提取 JSON（如果 AI 真的返回了 JSON）
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        return this.buildResult(parsed, data)
      } catch {
        // JSON 解析失败，使用简单的默认值
      }
    }

    // Cloudflare 通常返回 Markdown，我们只提取基本信息用于显示
    // 完整的 Markdown 内容会在 UI 层渲染
    const result = {
      secondary: '通用',
      third: '通用',
      keywords: [],
      filenames: [],
      description: 'Cloudflare AI 分析结果（点击查看 Markdown）',
      displayTitle: null,
      reasoning: null,
      new_category_proposal: null
    }

    return this.buildResult(result, data)
  }

  /**
   * 构建统一的结果对象
   */
  buildResult(parsed, data) {
    let filenameSuggestions = parsed.filenames || []

    if (!filenameSuggestions.length && parsed.filename) {
      filenameSuggestions = [parsed.filename]
    }

    if (!filenameSuggestions.length) {
      const desc = parsed.description || ''
      const keywords = parsed.keywords || []
      if (desc.length > 0) {
        filenameSuggestions = [desc.substring(0, 10) + '.jpg']
      } else if (keywords.length > 0) {
        filenameSuggestions = [keywords.slice(0, 2).join('') + '壁纸.jpg']
      } else {
        filenameSuggestions = ['未命名壁纸.jpg']
      }
    }

    // 清理 third 字段：如果包含路径分隔符，只保留最后一级
    let cleanThird = parsed.third || '通用'
    if (cleanThird.includes('/')) {
      const parts = cleanThird.split('/')
      cleanThird = parts[parts.length - 1].trim()
    }

    return {
      secondary: parsed.secondary || '通用',
      third: cleanThird,
      keywords: parsed.keywords || [],
      filenameSuggestions,
      description: parsed.description || '无描述',
      confidence: 0.85,
      displayTitle: parsed.display_title || parsed.displayTitle || null,
      is_perfect_match: parsed.is_perfect_match !== undefined ? parsed.is_perfect_match : null,
      new_category_proposal: parsed.new_category_proposal || null,
      reasoning: parsed.reasoning || null,
      raw: data
    }
  }
}
