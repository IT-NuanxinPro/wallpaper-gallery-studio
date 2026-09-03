import { BaseAIProvider } from './base-provider'

/**
 * OpenAI 兼容协议 Provider
 * 复用统一的视觉请求与响应解析逻辑。
 */
export class OpenAICompatibleProvider extends BaseAIProvider {
  constructor(config = {}) {
    super(config)
    this.baseUrl = config.baseUrl || ''
    this.providerName = config.name || 'OpenAI Compatible'
  }

  validateCredentials(credentials) {
    return !!(credentials?.apiKey && credentials?.model)
  }

  async analyze({ imageBase64, prompt, credentials }) {
    if (!this.validateCredentials(credentials)) {
      throw new Error(`${this.providerName} 凭证无效`)
    }

    const {
      apiKey,
      model,
      maxTokens = 4096,
      temperature = 0.7,
      timeoutMs = Number(import.meta.env.VITE_SUB2API_TIMEOUT_MS) || 120000
    } = credentials

    let imageUrl = imageBase64
    if (!imageBase64.startsWith('data:')) {
      imageUrl = `data:image/jpeg;base64,${imageBase64}`
    }

    const controller = new globalThis.AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    let response
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: imageUrl } }
              ]
            }
          ],
          temperature,
          max_tokens: maxTokens
        })
      })
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`${this.providerName} 请求超时（${Math.round(timeoutMs / 1000)} 秒）`)
      }
      throw new Error(`${this.providerName} 连接失败：${error.message}`)
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      let errorMessage = `${this.providerName} API error: ${response.status}`
      try {
        const error = await response.json()
        errorMessage = error.error?.message || error.message || errorMessage
        console.error(`${this.providerName} API Error Details:`, error)
      } catch {
        const text = await response.text().catch(() => '')
        if (text) errorMessage += ` - ${text}`
      }

      if (response.status === 401 || response.status === 403) {
        errorMessage = `${this.providerName} API Key 无效或已过期，请检查配置。`
      } else if (response.status === 429) {
        errorMessage = `API 请求频率超限: ${errorMessage}`
      }

      throw new Error(errorMessage)
    }

    const data = await response.json()
    return this.parseResponse(data)
  }

  parseResponse(data) {
    let aiText = data.choices?.[0]?.message?.content || ''

    if (!aiText) {
      throw new Error(`No content in ${this.providerName} response`)
    }

    // reasoning 模型会输出 <think>...</think> 块，先剥离避免干扰 JSON 提取
    aiText = aiText.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

    const jsonMatch = aiText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error(`No JSON found in ${this.providerName} response`)
    }

    const parsed = JSON.parse(jsonMatch[0])

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

    // 清理 third 字段：包含路径分隔符时只保留最后一级
    let cleanThird = parsed.third || '通用'
    if (cleanThird.includes('/')) {
      cleanThird = cleanThird.split('/').pop().trim()
    }

    return {
      secondary: parsed.secondary || '通用',
      third: cleanThird,
      keywords: parsed.keywords || [],
      filenameSuggestions,
      description: parsed.description || '无描述',
      confidence: 0.9,
      displayTitle: parsed.displayTitle || parsed.display_title || null,
      is_perfect_match: parsed.is_perfect_match !== undefined ? parsed.is_perfect_match : null,
      new_category_proposal: parsed.new_category_proposal || null,
      reasoning: parsed.reasoning || null,
      raw: data
    }
  }
}

/**
 * sub2api Provider
 * 开发环境通过 Vite 同源代理访问本地 Docker，生产环境直连远程 API。
 */
export class Sub2apiProvider extends OpenAICompatibleProvider {
  constructor(config = {}) {
    const defaultBaseUrl = import.meta.env.DEV ? '/sub2api/v1' : 'https://api.061129.xyz/v1'

    super({
      name: 'Grok',
      baseUrl: import.meta.env.VITE_SUB2API_BASE_URL || defaultBaseUrl,
      ...config
    })
  }
}
