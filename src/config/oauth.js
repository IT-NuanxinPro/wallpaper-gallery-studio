// GitHub OAuth 配置
const appOrigin = globalThis.location?.origin || 'http://localhost:5173'
const CONFIG_STORAGE_KEY = 'wallpaper_admin_config'

function getStoredConfig() {
  try {
    const raw = globalThis.localStorage?.getItem(CONFIG_STORAGE_KEY)
    const value = raw ? JSON.parse(raw) : {}
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

export const oauthConfig = {
  get clientId() {
    const stored = getStoredConfig()
    return typeof stored.clientId === 'string'
      ? stored.clientId
      : import.meta.env.VITE_GITHUB_CLIENT_ID || ''
  },
  // Worker 地址
  get tokenEndpoint() {
    const stored = getStoredConfig()
    return typeof stored.oauthWorkerUrl === 'string'
      ? stored.oauthWorkerUrl
      : import.meta.env.VITE_OAUTH_WORKER_URL || ''
  },
  // 授权地址
  authorizeUrl: 'https://github.com/login/oauth/authorize',
  // 回调地址
  redirectUri: `${appOrigin}/callback`,
  // 请求的权限范围
  scope: 'repo'
}

// 生成授权 URL
export function getAuthUrl() {
  if (!oauthConfig.clientId || !oauthConfig.tokenEndpoint) {
    throw new Error('请先在登录页配置 OAuth，或使用 Token 登录')
  }

  const params = new URLSearchParams({
    client_id: oauthConfig.clientId,
    redirect_uri: oauthConfig.redirectUri,
    scope: oauthConfig.scope,
    state: generateState()
  })
  return `${oauthConfig.authorizeUrl}?${params}`
}

// 生成随机 state 防止 CSRF
function generateState() {
  const state = globalThis.crypto.randomUUID()
  sessionStorage.setItem('oauth_state', state)
  return state
}

// 验证 state
export function verifyState(state) {
  const saved = sessionStorage.getItem('oauth_state')
  sessionStorage.removeItem('oauth_state')
  return typeof state === 'string' && !!state && saved === state
}

// 用 code 换 token
export async function exchangeToken(code) {
  if (!oauthConfig.tokenEndpoint) {
    throw new Error('请先在登录页配置 OAuth 服务地址')
  }

  const response = await fetch(oauthConfig.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  })

  if (!response.ok) {
    let errorMessage = '获取 Token 失败'
    try {
      const error = await response.json()
      errorMessage = error.error || errorMessage
    } catch {
      // ignore non-json response body
    }
    throw new Error(errorMessage)
  }

  const data = await response.json()
  return data.access_token
}
