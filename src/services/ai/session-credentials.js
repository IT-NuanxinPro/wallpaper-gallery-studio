import { normalizeModelId } from './model'
import { normalizeModelList } from './model-catalog'

export const SESSION_CREDENTIALS_KEY = 'studio_ai_session_v1'
export const DEFAULT_AI_BASE_URL =
  import.meta.env.VITE_SUB2API_BASE_URL || 'https://api.061129.xyz/v1'

export function normalizeAiKey(value) {
  const key = String(value ?? '').trim()
  if (
    !key ||
    key.length > 8192 ||
    /\s/.test(key) ||
    [...key].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  ) {
    throw new Error('请输入有效的 API Key，不要包含空格或换行')
  }
  return key
}

export function normalizeAiBaseUrl(value) {
  const input = String(value || '')
    .trim()
    .replace(/\/+$/, '')
  const invalid = () => new Error('API 地址格式不正确，请填写 HTTP、HTTPS 地址或同源路径')
  if (
    !input ||
    /[\\\s?#]/.test(input) ||
    [...input].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    throw invalid()
  if (input.startsWith('/')) {
    if (input.startsWith('//')) throw invalid()
    return input
  }
  if (!/^https?:\/\//i.test(input)) throw invalid()
  let url
  try {
    url = new URL(input)
  } catch {
    throw invalid()
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw invalid()
  return url.href.replace(/\/+$/, '')
}

export function aiConnectionError(baseUrl) {
  if (
    globalThis.location?.protocol === 'https:' &&
    /^http:\/\//i.test(baseUrl) &&
    !['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseUrl).hostname)
  ) {
    return 'HTTP 地址已接受，但连接失败；当前 HTTPS 页面可能受到浏览器混合内容限制，请使用同源代理或从 HTTP 部署访问'
  }
  return '连接失败，请检查 API 地址、网络及网关的跨域设置'
}

function browserStorage(name) {
  try {
    return globalThis[name]
  } catch {
    return null
  }
}

function currentNavigationType() {
  try {
    return globalThis.performance?.getEntriesByType?.('navigation')?.[0]?.type || 'navigate'
  } catch {
    return 'navigate'
  }
}

export function createSessionCredentialStorage({
  storage = browserStorage('sessionStorage'),
  legacyStorage = browserStorage('localStorage'),
  navigationType = currentNavigationType()
} = {}) {
  let initialized = false
  let unavailable = false

  function clear() {
    try {
      storage?.removeItem(SESSION_CREDENTIALS_KEY)
    } catch {
      unavailable = true
    }
  }

  function initialize() {
    if (initialized) return
    initialized = true
    // 旧版持久凭据不迁移；GitHub登录和上传历史保持原有存储行为。
    try {
      const keys = ['ai_credentials', 'ai_credentials_encryption_key']
      for (let i = 0; i < (legacyStorage?.length || 0); i++) {
        const key = legacyStorage.key(i)
        if (key?.startsWith('ai_config_')) keys.push(key)
      }
      keys.forEach(key => legacyStorage?.removeItem(key))
    } catch {
      /* 浏览器禁止持久存储时不尝试读取旧凭据。 */
    }
    // 新标签或恢复导航不继承旧Key，仅本标签刷新恢复。
    if (navigationType !== 'reload') clear()
  }

  function read() {
    initialize()
    if (navigationType !== 'reload' || unavailable) return null
    try {
      const raw = storage?.getItem(SESSION_CREDENTIALS_KEY)
      if (!raw) return null
      const value = JSON.parse(raw)
      if (typeof value?.apiKey !== 'string') throw new Error('Invalid session')
      const apiKey = normalizeAiKey(value.apiKey)
      const models = normalizeModelList(value.models, apiKey)
      const selected = normalizeModelId(value.model)
      return {
        apiKey,
        baseUrl: normalizeAiBaseUrl(value.baseUrl),
        models,
        model: models.some(item => item.id === selected) ? selected : ''
      }
    } catch {
      clear()
      return null
    }
  }

  function write(value) {
    initialize()
    try {
      if (!storage) throw new Error('Storage unavailable')
      storage.setItem(
        SESSION_CREDENTIALS_KEY,
        JSON.stringify({
          apiKey: value.apiKey,
          baseUrl: value.baseUrl,
          model: value.model || '',
          models: normalizeModelList(value.models, value.apiKey)
        })
      )
      return true
    } catch {
      unavailable = true
      clear()
      return false
    }
  }

  return {
    read,
    write,
    clear,
    get unavailable() {
      return unavailable
    }
  }
}
