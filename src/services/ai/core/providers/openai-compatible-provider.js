import { BaseAIProvider } from './base-provider'
import { normalizeModelId } from '../../model'
import {
  DEFAULT_AI_BASE_URL,
  normalizeAiBaseUrl,
  aiConnectionError
} from '../../session-credentials'

function sessionCancelled() {
  return Object.assign(new Error('AI 会话配置已变更，请重新分析'), { name: 'AbortError' })
}

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
    return typeof credentials?.apiKey === 'string' && !!credentials.apiKey.trim()
  }

  async analyze({ imageBase64, prompt, credentials }) {
    if (!this.validateCredentials(credentials)) {
      throw new Error(`${this.providerName} 凭证无效`)
    }
    const model = normalizeModelId(credentials.model)
    if (!model) throw new Error('请先从远程列表选择 AI 模型')

    const {
      apiKey,
      timeoutMs = Number(import.meta.env.VITE_SUB2API_TIMEOUT_MS) || 120000,
      signal
    } = credentials

    if (signal?.aborted) throw sessionCancelled()
    const baseUrl = normalizeAiBaseUrl(credentials.baseUrl || this.baseUrl || DEFAULT_AI_BASE_URL)

    let imageUrl = imageBase64
    if (imageBase64 && !imageBase64.startsWith('data:')) {
      imageUrl = `data:image/jpeg;base64,${imageBase64}`
    }

    const controller = new globalThis.AbortController()
    let timedOut = false
    const abortSession = () => controller.abort()
    signal?.addEventListener('abort', abortSession, { once: true })
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)

    let response
    try {
      response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
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
                ...(imageUrl ? [{ type: 'image_url', image_url: { url: imageUrl } }] : [])
              ]
            }
          ]
        })
      })
      if (signal?.aborted) throw sessionCancelled()
      if (!response.ok) {
        // 服务端正文可能回显 Authorization；只使用已知 HTTP 状态生成错误。
        let message = `AI 服务请求失败（HTTP ${response.status}），请稍后重试`
        if (response.status === 401 || response.status === 403) {
          message = 'API Key 无效或已过期，请检查当前标签页配置'
        } else if (response.status === 429) {
          message = 'AI 请求频率超限，请稍后重试'
        }
        throw Object.assign(new Error(message), { code: 'AI_HTTP_ERROR' })
      }
      const data = await response.json()
      if (signal?.aborted) throw sessionCancelled()
      const content = data.choices?.[0]?.message?.content
      if (typeof content !== 'string') throw new Error('Invalid AI content')
      // 只解析业务字段，既不保留整段响应，也不允许响应回显当前 Key。
      return this.parseResponse({ choices: [{ message: { content } }] }, apiKey)
    } catch (error) {
      if (signal?.aborted) throw sessionCancelled()
      if (timedOut) {
        throw new Error(`${this.providerName} 请求超时（${Math.round(timeoutMs / 1000)} 秒）`)
      }
      if (error.code === 'AI_HTTP_ERROR') throw error
      throw new Error(response ? 'AI 返回内容无法解析，请重试' : aiConnectionError(baseUrl))
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abortSession)
    }
  }

  parseResponse(data, apiKey = '') {
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

    // reviver 从内向外遍历；解码后同时处理字符串值和对象键，覆盖嵌套及转义回显。
    const parsed = JSON.parse(jsonMatch[0], (_key, value) => {
      if (!apiKey) return value
      if (typeof value === 'string') return value.replaceAll(apiKey, '[已隐藏]')
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.fromEntries(
          Object.entries(value).map(([key, nested]) => [key.replaceAll(apiKey, '[已隐藏]'), nested])
        )
      }
      return value
    })

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
    let cleanThird = parsed.third ?? ''
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
      reasoning: parsed.reasoning || null
    }
  }
}

/**
 * sub2api Provider
 * 地址优先使用当前会话配置，未覆盖时使用公开默认地址。
 */
export class Sub2apiProvider extends OpenAICompatibleProvider {
  constructor(config = {}) {
    super({
      name: 'AI',
      baseUrl: DEFAULT_AI_BASE_URL,
      ...config
    })
  }
}
