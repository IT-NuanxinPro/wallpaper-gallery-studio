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
  let permissionCache = null
  let permissionSequence = 0
  let validationSequence = 0
  let identityRevision = 0

  function userIdentity(value = user.value) {
    return value?.id ?? value?.login ?? null
  }

  function invalidatePermission() {
    permissionSequence++
    permissionCache = null
    permissionLevel.value = 'none'
    permissionChecked.value = false
  }

  // 计算属性
  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const canUpload = computed(() => ['admin', 'write'].includes(permissionLevel.value))

  // 设置 token
  function setToken(newToken) {
    if (token.value !== newToken) {
      identityRevision++
      validationSequence++
      loading.value = false
      invalidatePermission()
    }
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
    if (userIdentity() !== userIdentity(newUser)) {
      identityRevision++
      invalidatePermission()
    }
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
    } catch {
      return false
    } finally {
      loading.value = false
    }
  }

  // 验证 token 有效性
  async function validateToken() {
    if (!token.value) return false

    const checkedToken = token.value
    const revision = identityRevision
    const sequence = ++validationSequence
    const isCurrent = () =>
      sequence === validationSequence &&
      revision === identityRevision &&
      checkedToken === token.value
    loading.value = true
    try {
      githubService.setToken(checkedToken)
      const userData = await githubService.getCurrentUser()
      if (!isCurrent()) return false
      setUser(userData)
      return true
    } catch (error) {
      if (isCurrent() && (error.type === 'TOKEN_EXPIRED' || error.status === 401)) logout()
      return false
    } finally {
      if (sequence === validationSequence) loading.value = false
    }
  }

  // 权限缓存只存在内存中，并绑定当前账号、Token 和仓库。
  async function checkPermission(owner, repo) {
    const snapshot = {
      owner,
      repo,
      token: token.value,
      user: userIdentity(),
      revision: identityRevision
    }
    const sequence = ++permissionSequence
    const isCurrent = () =>
      sequence === permissionSequence &&
      snapshot.revision === identityRevision &&
      snapshot.token === token.value &&
      snapshot.user === userIdentity()
    permissionLevel.value = 'none'
    permissionChecked.value = false

    if (!snapshot.token || !owner || !repo) {
      permissionChecked.value = true
      return 'none'
    }

    if (
      permissionCache &&
      permissionCache.owner === owner &&
      permissionCache.repo === repo &&
      permissionCache.token === snapshot.token &&
      permissionCache.user === snapshot.user &&
      Date.now() - permissionCache.timestamp < 5 * 60 * 1000
    ) {
      permissionLevel.value = permissionCache.level
      permissionChecked.value = true
      return permissionCache.level
    }

    try {
      githubService.setToken(snapshot.token)
      const response = await githubService.checkRepoAccess(owner, repo)
      if (!isCurrent()) return 'none'
      const level = ['admin', 'write', 'read'].includes(response) ? response : 'none'
      permissionLevel.value = level
      permissionCache = { ...snapshot, level, timestamp: Date.now() }
      return level
    } catch {
      if (isCurrent()) permissionLevel.value = 'none'
      return 'none'
    } finally {
      if (isCurrent()) permissionChecked.value = true
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
    invalidatePermission,
    logout
  }
})
