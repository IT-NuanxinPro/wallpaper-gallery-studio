import { BaseAIProvider } from './base-provider'

/**
 * Groq AI Provider
 * 使用 Groq 的 Llama 4 Scout 视觉模型进行图片分析
 */
export class GroqProvider extends BaseAIProvider {
  constructor(config = {}) {
    super(config)
    this.baseUrl = config.baseUrl || 'https://api.groq.com/openai/v1'
  }

  validateCredentials(credentials) {
    return !!(credentials?.apiKey && credentials?.model)
  }

  async analyze({ imageBase64, prompt, credentials }) {
    if (!this.validateCredentials(credentials)) {
      throw new Error('Groq credentials are invalid')
    }

    const { apiKey, model } = credentials

    // 处理 base64 数据：如果已经包含 data URL 前缀，直接使用；否则添加前缀
    let imageUrl = imageBase64
    if (!imageBase64.startsWith('data:')) {
      imageUrl = `data:image/jpeg;base64,${imageBase64}`
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl
                }
              }
            ]
          }
        ],
        temperature: 1,
        max_completion_tokens: 1024
      })
    })

    if (!response.ok) {
      let errorMessage = `Groq API error: ${response.status}`
      try {
        const error = await response.json()
        errorMessage = error.error?.message || error.message || errorMessage
        console.error('Groq API Error Details:', error)
      } catch {
        const text = await response.text().catch(() => '')
        console.error('Groq API Error Text:', text)
        if (text) errorMessage += ` - ${text}`
      }

      if (response.status === 403 || response.status === 401) {
        errorMessage = 'Groq API Key 无效或已过期。请检查您的 API Key 是否正确配置。'
      } else if (response.status === 429) {
        errorMessage = 'API 请求频率超限，请稍后再试。'
      }

      throw new Error(errorMessage)
    }

    const data = await response.json()
    return this.parseResponse(data)
  }

  parseResponse(data) {
    const aiText = data.choices?.[0]?.message?.content || ''

    if (!aiText) {
      throw new Error('No content in Groq response')
    }

    // 尝试提取 JSON
    const jsonMatch = aiText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in Groq response')
    }

    const parsed = JSON.parse(jsonMatch[0])

    console.log('[Groq] 原始 AI 返回:', { secondary: parsed.secondary, third: parsed.third })

    // 直接使用 AI 返回的文件名数组
    let filenameSuggestions = parsed.filenames || []

    // 如果 AI 返回的是单个 filename（兼容旧格式）
    if (!filenameSuggestions.length && parsed.filename) {
      filenameSuggestions = [parsed.filename]
    }

    // 如果没有文件名，使用描述或关键词生成
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
      console.log('[Groq] 清理 third 字段: "%s" → "%s"', parsed.third, cleanThird)
    }

    const result = {
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

    console.log('[Groq] 清理后返回:', { secondary: result.secondary, third: result.third })

    return result
  }
}
