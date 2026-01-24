import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { githubService } from '@/services/github'
import { localStorageService } from '@/services/localStorage'

const STORAGE_KEYS = {
  TOKEN: 'wallpaper_admin_token',
  USER: 'wallpaper_admin_user'
}

export const useAuthStore = defineStore('auth', () => {
  // 状态
  const token = ref(localStorage.getItem(STORAGE_KEYS.TOKEN) || null)
  const user = ref(JSON.parse(localStorage.getItem(STORAGE_KEYS.USER) || 'null'))
  const permissionLevel = ref('none') // admin | write | read | none
  const permissionChecked = ref(false) // 权限是否已检查完成
  const loading = ref(false)

  // 计算属性
  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const canUpload = computed(() => ['admin', 'write'].includes(permissionLevel.value))

  // 设置 token
  function setToken(newToken) {
    token.value = newToken
    if (newToken) {
      localStorage.setItem(STORAGE_KEYS.TOKEN, newToken)
      githubService.setToken(newToken)
      // 初始化本地存储
      localStorageService.init()
    } else {
      localStorage.removeItem(STORAGE_KEYS.TOKEN)
      githubService.setToken(null)
      localStorageService.cleanup()
    }
  }

  // 设置用户信息
  function setUser(newUser) {
    user.value = newUser
    if (newUser) {
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(newUser))
    } else {
      localStorage.removeItem(STORAGE_KEYS.USER)
    }
  }

  // 登录 - 跳转到 GitHub OAuth
  function login(clientId, redirectUri) {
    const authUrl = githubService.getAuthUrl(clientId, redirectUri)
    window.location.href = authUrl
  }

  // 处理 OAuth 回调
  async function handleCallback(code, clientId, clientSecret, redirectUri) {
    loading.value = true
    try {
      // 注意：实际项目中需要后端代理
      const tokenData = await githubService.exchangeCodeForToken(
        code,
        clientId,
        clientSecret,
        redirectUri
      )
      setToken(tokenData.access_token)

      // 获取用户信息
      const userData = await githubService.getCurrentUser()
      setUser(userData)

      return true
    } catch (error) {
      console.error('OAuth callback failed:', error)
      return false
    } finally {
      loading.value = false
    }
  }

  // 验证 token 有效性
  async function validateToken() {
    if (!token.value) return false

    loading.value = true
    try {
      githubService.setToken(token.value)
      const userData = await githubService.getCurrentUser()
      setUser(userData)
      return true
    } catch (error) {
      // Token 无效，清除
      if (error.type === 'TOKEN_EXPIRED' || error.status === 401) {
        logout()
      }
      return false
    } finally {
      loading.value = false
    }
  }

  // 检查仓库权限
  async function checkPermission(owner, repo) {
    // 如果已经检查过且不超过 5 分钟，直接返回缓存结果
    const cacheKey = `permission_${owner}_${repo}`
    const cached = sessionStorage.getItem(cacheKey)
    if (cached && permissionChecked.value) {
      const { level, timestamp } = JSON.parse(cached)
      const now = Date.now()
      // 缓存 5 分钟
      if (now - timestamp < 5 * 60 * 1000) {
        console.log('[Auth] 使用缓存的权限:', level)
        permissionLevel.value = level
        return level
      }
    }

    permissionChecked.value = false

    if (!token.value) {
      console.log('[Auth] 未登录，权限为 none')
      permissionLevel.value = 'none'
      permissionChecked.value = true
      return 'none'
    }

    try {
      const level = await githubService.checkRepoAccess(owner, repo)
      console.log('[Auth] 权限检查结果:', level)
      permissionLevel.value = level
      // 缓存结果
      sessionStorage.setItem(cacheKey, JSON.stringify({ level, timestamp: Date.now() }))
      return level
    } catch (error) {
      console.error('[Auth] 权限检查失败:', error)
      permissionLevel.value = 'none'
      return 'none'
    } finally {
      permissionChecked.value = true
      console.log(
        '[Auth] permissionChecked 设置为 true, canUpload:',
        ['admin', 'write'].includes(permissionLevel.value)
      )
    }
  }

  // 登出
  function logout() {
    setToken(null)
    setUser(null)
    permissionLevel.value = 'none'
    permissionChecked.value = false
  }

  // 初始化时设置 token
  if (token.value) {
    githubService.setToken(token.value)
    // 初始化本地存储
    localStorageService.init()
  }

  return {
    // 状态
    token,
    user,
    permissionLevel,
    permissionChecked,
    loading,
    // 计算属性
    isAuthenticated,
    canUpload,
    // 方法
    setToken,
    setUser,
    login,
    handleCallback,
    validateToken,
    checkPermission,
    logout
  }
})
