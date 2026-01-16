import { BaseAIProvider } from './base-provider'

/**
 * 豆包 AI Provider
 */
export class DoubaoProvider extends BaseAIProvider {
  constructor(config = {}) {
    super(config)
    this.endpoint = config.endpoint || 'https://ark.cn-beijing.volces.com/api/v3/responses'
  }

  validateCredentials(credentials) {
    return !!(credentials?.apiKey && credentials?.model)
  }

  async analyze({ imageBase64, prompt, credentials }) {
    if (!this.validateCredentials(credentials)) {
      throw new Error('Doubao credentials are invalid')
    }

    const { apiKey, model } = credentials

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_image',
                image_url: imageBase64
              },
              {
                type: 'input_text',
                text: prompt
              }
            ]
          }
        ]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Doubao API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    return this.parseResponse(data)
  }

  parseResponse(data) {
    const outputMessage = data.output?.find(item => item.type === 'message')
    const textContent = outputMessage?.content?.find(c => c.type === 'output_text')
    const aiText = textContent?.text || ''

    // 尝试提取 JSON
    const jsonMatch = aiText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in Doubao response')
    }

    const parsed = JSON.parse(jsonMatch[0])

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

    return {
      secondary: parsed.secondary || '通用',
      third: parsed.third || '通用',
      keywords: parsed.keywords || [],
      filenameSuggestions,
      description: parsed.description || '无描述',
      confidence: 0.9,
      // 新增字段
      display_title: parsed.display_title || null,
      is_perfect_match: parsed.is_perfect_match !== undefined ? parsed.is_perfect_match : null,
      new_category_proposal: parsed.new_category_proposal || null,
      reasoning: parsed.reasoning || null,
      raw: data
    }
  }
}
