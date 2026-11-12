export const SESSION_CREDENTIALS_KEY = 'studio_ai_session_v1'
export const DEFAULT_AI_BASE_URL =
  import.meta.env.VITE_SUB2API_BASE_URL || 'https://api.061129.xyz/v1'

export function normalizeAiBaseUrl(value) {
  const input = String(value || '')
    .trim()
    .replace(/\/+$/, '')
  const invalid = () => new Error('API 地址需为 HTTPS 地址或同源路径，不能包含账号、查询参数或片段')
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
  const localHttp =
    url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    (!localHttp && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw invalid()
  return url.href.replace(/\/+$/, '')
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
      if (typeof value?.apiKey !== 'string' || !value.apiKey.trim() || value.apiKey.length > 8192)
        throw new Error('Invalid session')
      return { apiKey: value.apiKey.trim(), baseUrl: normalizeAiBaseUrl(value.baseUrl) }
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
        JSON.stringify({ apiKey: value.apiKey, baseUrl: value.baseUrl })
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
