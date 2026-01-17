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

    // 尝试提取 JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        return this.buildResult(parsed, data)
      } catch (e) {
        // JSON 解析失败，继续尝试 Markdown 解析
      }
    }

    // 解析 Markdown 格式的响应
    const result = this.parseMarkdownResponse(content)
    return this.buildResult(result, data)
  }

  /**
   * 解析 Markdown 格式的响应
   */
  parseMarkdownResponse(content) {
    const result = {
      secondary: '通用',
      third: '通用',
      keywords: [],
      filenames: [],
      description: '',
      displayTitle: null,
      reasoning: null
    }

    // 提取 Secondary
    const secondaryMatch = content.match(/\*\*Secondary\*\*[：:]\s*(.+)/i)
    if (secondaryMatch) {
      result.secondary = secondaryMatch[1].trim()
    }

    // 提取 Third
    const thirdMatch = content.match(/\*\*Third\*\*[：:]\s*(.+)/i)
    if (thirdMatch) {
      result.third = thirdMatch[1].trim()
    }

    // 提取 displayTitle (兼容 display_title)
    const titleMatch = content.match(
      /\*\*(display_?title|displayTitle)\*\*[：:]\s*[""]?([^""\n]+)[""]?/i
    )
    if (titleMatch) {
      result.displayTitle = titleMatch[2].trim()
    }

    // 提取 filenames
    const filenamesMatch = content.match(/\*\*filenames\*\*[：:]\s*\[([^\]]+)\]/i)
    if (filenamesMatch) {
      result.filenames = filenamesMatch[1]
        .split(',')
        .map(f => f.trim().replace(/["'"]/g, ''))
        .filter(f => f)
    }

    // 提取 keywords
    const keywordsMatch = content.match(/\*\*keywords\*\*[：:]\s*\[([^\]]+)\]/i)
    if (keywordsMatch) {
      result.keywords = keywordsMatch[1]
        .split(',')
        .map(k => k.trim().replace(/["'"]/g, ''))
        .filter(k => k)
    }

    // 提取 description
    const descMatch = content.match(/\*\*description\*\*[：:]\s*[""]?([^""\n]+)[""]?/i)
    if (descMatch) {
      result.description = descMatch[1].trim()
    }

    // 提取 reasoning
    const reasoningMatch = content.match(/\*\*reasoning\*\*[：:]\s*[""]?([^""\n]+)[""]?/i)
    if (reasoningMatch) {
      result.reasoning = reasoningMatch[1].trim()
    }

    return result
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

    return {
      secondary: parsed.secondary || '通用',
      third: parsed.third || '通用',
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
