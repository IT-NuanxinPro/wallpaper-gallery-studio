import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { githubService } from '@/services/github'

const STORAGE_KEY = 'wallpaper_admin_config'
const DEFAULT_CONFIG = {
  owner: import.meta.env.VITE_GITHUB_REPO_OWNER || '',
  repo: import.meta.env.VITE_GITHUB_REPO_NAME || '',
  branch: import.meta.env.VITE_GITHUB_REPO_BRANCH || 'main',
  clientId: import.meta.env.VITE_GITHUB_CLIENT_ID || '',
  oauthWorkerUrl: import.meta.env.VITE_OAUTH_WORKER_URL || '',
  workflowOwner: import.meta.env.VITE_WORKFLOW_OWNER || '',
  workflowRepo: import.meta.env.VITE_WORKFLOW_REPO || '',
  frontendOwner: import.meta.env.VITE_FRONTEND_OWNER || '',
  frontendRepo: import.meta.env.VITE_FRONTEND_REPO || '',
  videoApiUrl: import.meta.env.VITE_VIDEO_API_URL || ''
}
const fields = Object.keys(DEFAULT_CONFIG)

export function isValidOwnerName(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(value)
}
export function isValidRepoName(value) {
  return (
    typeof value === 'string' &&
    /^[a-zA-Z0-9._-]{1,100}$/.test(value) &&
    !['.', '..'].includes(value)
  )
}
function normalizeConfig(value) {
  return Object.fromEntries(fields.map(key => [key, String(value?.[key] ?? '').trim()]))
}
function validServiceUrl(value) {
  if (!value) return true
  if (/[\s\\?#]/.test(value)) return false
  if (value.startsWith('/')) return !value.startsWith('//')
  try {
    const url = new URL(value)
    return (
      /^https?:\/\//i.test(value) &&
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}
export function validateConfigInput(input) {
  const value = normalizeConfig(input)
  if (!isValidOwnerName(value.owner)) return '请填写有效的 GitHub 用户名或组织名'
  if (!isValidRepoName(value.repo)) return '请填写有效的壁纸数据仓库名称'
  if (
    !value.branch ||
    /[\s~^:?*[\\]/.test(value.branch) ||
    value.branch.includes('..') ||
    value.branch.includes('@{') ||
    value.branch.startsWith('/') ||
    value.branch.endsWith('/') ||
    value.branch.endsWith('.') ||
    value.branch.endsWith('.lock')
  )
    return '请填写有效的默认分支'
  for (const [owner, repo, label] of [
    ['workflowOwner', 'workflowRepo', '工作流仓库'],
    ['frontendOwner', 'frontendRepo', '网站仓库']
  ]) {
    if (value[owner] || value[repo]) {
      if (!isValidOwnerName(value[owner]) || !isValidRepoName(value[repo])) {
        return `请完整填写${label}的所有者和仓库名称，或同时留空`
      }
    }
  }
  if (!validServiceUrl(value.oauthWorkerUrl)) return 'OAuth 服务地址格式不正确'
  if (!validServiceUrl(value.videoApiUrl)) return '视频服务地址格式不正确'
  if (Boolean(value.clientId) !== Boolean(value.oauthWorkerUrl))
    return 'OAuth Client ID 和服务地址需同时填写，或同时留空使用 Token 登录'
  return null
}

function loadConfig() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...DEFAULT_CONFIG }
    const merged = { ...DEFAULT_CONFIG }
    const differentRepository =
      parsed.owner &&
      parsed.repo &&
      (parsed.owner !== DEFAULT_CONFIG.owner || parsed.repo !== DEFAULT_CONFIG.repo)
    if (differentRepository) {
      for (const key of [
        'workflowOwner',
        'workflowRepo',
        'frontendOwner',
        'frontendRepo',
        'videoApiUrl'
      ])
        merged[key] = ''
    }
    for (const key of fields) {
      if (typeof parsed[key] === 'string') merged[key] = parsed[key]
    }
    return normalizeConfig(merged)
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export const useConfigStore = defineStore('config', () => {
  const config = ref(loadConfig())
  const configRevision = ref(0)
  const validating = ref(false)
  const validationError = ref(null)
  const isConfigured = computed(
    () =>
      isValidOwnerName(config.value.owner) &&
      isValidRepoName(config.value.repo) &&
      !!config.value.branch
  )
  const isOAuthConfigured = computed(() => !!config.value.clientId && !!config.value.oauthWorkerUrl)
  const repoFullName = computed(() => `${config.value.owner}/${config.value.repo}`)

  function saveConfig() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config.value))
  }
  function setConfig(input) {
    const next = normalizeConfig({ ...config.value, ...input })
    const error = validateConfigInput(next)
    if (error) throw new Error(error)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    config.value = next
    configRevision.value++
  }
  function setConnectionConfig(input) {
    const clientId = String(input?.clientId || '').trim()
    const oauthWorkerUrl = String(input?.oauthWorkerUrl || '').trim()
    if (Boolean(clientId) !== Boolean(oauthWorkerUrl)) {
      throw new Error('OAuth Client ID 和服务地址需同时填写')
    }
    if (!validServiceUrl(oauthWorkerUrl)) throw new Error('OAuth 服务地址格式不正确')
    const next = { ...config.value, clientId, oauthWorkerUrl }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    config.value = next
    configRevision.value++
  }
  function resetConfig() {
    config.value = { ...DEFAULT_CONFIG }
    saveConfig()
    configRevision.value++
  }
  async function validateConfig(input = config.value) {
    const next = normalizeConfig(input)
    const error = validateConfigInput(next)
    if (error) {
      validationError.value = error
      return false
    }
    validating.value = true
    validationError.value = null
    try {
      await githubService.getContents(next.owner, next.repo, '', next.branch)
      return true
    } catch (error) {
      validationError.value =
        error.status === 404
          ? '仓库不存在或无访问权限'
          : error.type === 'TOKEN_EXPIRED'
            ? '登录已过期，请重新登录'
            : '无法验证仓库，请检查网络与访问权限'
      return false
    } finally {
      validating.value = false
    }
  }
  return {
    config,
    configRevision,
    validating,
    validationError,
    isConfigured,
    isOAuthConfigured,
    repoFullName,
    saveConfig,
    setConfig,
    setConnectionConfig,
    resetConfig,
    validateConfig,
    validateConfigInput,
    isValidOwnerName,
    isValidRepoName
  }
})
