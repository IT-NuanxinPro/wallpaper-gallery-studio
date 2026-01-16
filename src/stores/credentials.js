/**
 * API 凭证管理 Store
 * 负责管理多个 AI Provider 的凭证存储、加密和验证
 * 支持从环境变量读取凭证（本地 .env.local 或线上环境变量）
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { AI_CONFIG, AI_PROVIDERS } from '@/config/ai-config'

const STORAGE_KEY = 'ai_credentials'
const ENCRYPTION_KEY = 'ai_credentials_encryption_key'

export const useCredentialsStore = defineStore('credentials', () => {
  // State
  const mode = ref('env') // 'env' | 'manual' - 默认使用环境变量

  // Cloudflare 凭证
  const accountId = ref('')
  const apiToken = ref('')
  const workerUrl = ref(AI_CONFIG.workerUrl)

  // 豆包凭证
  const doubaoApiKey = ref('')

  const encrypted = ref(true)
  const lastVerified = ref(null)
  const loading = ref(false)
  const loaded = ref(false)

  // Computed
  // 是否为生产环境
  const isProduction = computed(() => {
    return import.meta.env.PROD
  })

  // 环境变量中是否有 Cloudflare 凭证
  const hasCloudflareEnvCredentials = computed(() => {
    const envAccountId = import.meta.env.VITE_CLOUDFLARE_ACCOUNT_ID
    const envApiToken = import.meta.env.VITE_CLOUDFLARE_API_TOKEN
    return !!(envAccountId && envApiToken)
  })

  // 环境变量中是否有豆包凭证
  const hasDoubaoEnvCredentials = computed(() => {
    const envApiKey = import.meta.env.VITE_DOUBAO_API_KEY
    return !!envApiKey
  })

  // 是否有任何凭证
  const hasCredentials = computed(() => {
    return (
      hasCloudflareEnvCredentials.value ||
      hasDoubaoEnvCredentials.value ||
      !!(accountId.value && apiToken.value) ||
      !!doubaoApiKey.value
    )
  })

  // 获取 Cloudflare 凭证
  const cloudflareCredentials = computed(() => {
    // 优先使用环境变量
    if (hasCloudflareEnvCredentials.value) {
      return {
        accountId: import.meta.env.VITE_CLOUDFLARE_ACCOUNT_ID,
        apiToken: import.meta.env.VITE_CLOUDFLARE_API_TOKEN,
        workerUrl: import.meta.env.VITE_WORKER_URL || workerUrl.value
      }
    }
    // 否则使用手动输入的
    return {
      accountId: accountId.value,
      apiToken: apiToken.value,
      workerUrl: workerUrl.value
    }
  })

  // 获取豆包凭证
  const doubaoCredentials = computed(() => {
    // 优先使用环境变量
    if (hasDoubaoEnvCredentials.value) {
      return {
        apiKey: import.meta.env.VITE_DOUBAO_API_KEY
      }
    }
    // 否则使用手动输入的
    return {
      apiKey: doubaoApiKey.value
    }
  })

  // 根据 Provider 获取凭证
  function getCredentialsByProvider(provider) {
    if (provider === AI_PROVIDERS.CLOUDFLARE) {
      return cloudflareCredentials.value
    } else if (provider === AI_PROVIDERS.DOUBAO) {
      return doubaoCredentials.value
    }
    return null
  }

  const credentialsSource = computed(() => {
    if (hasCloudflareEnvCredentials.value || hasDoubaoEnvCredentials.value) {
      return '环境变量'
    }
    return '手动输入'
  })

  /**
   * 生成加密密钥
   * 使用 Web Crypto API 生成 AES-GCM 密钥
   */
  async function generateEncryptionKey() {
    try {
      const key = await window.crypto.subtle.generateKey(
        {
          name: 'AES-GCM',
          length: 256
        },
        true,
        ['encrypt', 'decrypt']
      )

      // 导出密钥并存储
      const exportedKey = await window.crypto.subtle.exportKey('jwk', key)
      localStorage.setItem(ENCRYPTION_KEY, JSON.stringify(exportedKey))

      return key
    } catch (error) {
      console.error('[Credentials] Failed to generate encryption key:', error)
      throw new Error('生成加密密钥失败')
    }
  }

  /**
   * 获取加密密钥
   */
  async function getEncryptionKey() {
    try {
      const storedKey = localStorage.getItem(ENCRYPTION_KEY)

      if (!storedKey) {
        return await generateEncryptionKey()
      }

      const keyData = JSON.parse(storedKey)
      return await window.crypto.subtle.importKey(
        'jwk',
        keyData,
        {
          name: 'AES-GCM',
          length: 256
        },
        true,
        ['encrypt', 'decrypt']
      )
    } catch (error) {
      console.error('[Credentials] Failed to get encryption key:', error)
      // 如果获取失败，生成新密钥
      return await generateEncryptionKey()
    }
  }

  /**
   * 加密数据
   * @param {string} data - 要加密的数据
   * @returns {Promise<string>} 加密后的数据（Base64）
   */
  async function encryptData(data) {
    try {
      const key = await getEncryptionKey()
      const iv = window.crypto.getRandomValues(new Uint8Array(12))
      // eslint-disable-next-line no-undef
      const encodedData = new TextEncoder().encode(data)

      const encryptedData = await window.crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        key,
        encodedData
      )

      // 将 IV 和加密数据组合
      const combined = new Uint8Array(iv.length + encryptedData.byteLength)
      combined.set(iv, 0)
      combined.set(new Uint8Array(encryptedData), iv.length)

      // 转换为 Base64
      return btoa(String.fromCharCode(...combined))
    } catch (error) {
      console.error('[Credentials] Encryption failed:', error)
      throw new Error('加密失败')
    }
  }

  /**
   * 解密数据
   * @param {string} encryptedData - 加密的数据（Base64）
   * @returns {Promise<string>} 解密后的数据
   */
  async function decryptData(encryptedData) {
    try {
      const key = await getEncryptionKey()

      // 从 Base64 解码
      const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0))

      // 分离 IV 和加密数据
      const iv = combined.slice(0, 12)
      const data = combined.slice(12)

      const decryptedData = await window.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        key,
        data
      )

      // eslint-disable-next-line no-undef
      return new TextDecoder().decode(decryptedData)
    } catch (error) {
      console.error('[Credentials] Decryption failed:', error)
      throw new Error('解密失败')
    }
  }

  /**
   * 保存凭证
   * @param {Object} credentials - 凭证对象
   * @param {string} credentials.accountId - Cloudflare Account ID
   * @param {string} credentials.apiToken - Cloudflare API Token
   * @param {string} credentials.doubaoApiKey - 豆包 API Key
   */
  async function saveCredentials(credentials) {
    try {
      if (credentials.accountId) accountId.value = credentials.accountId
      if (credentials.apiToken) apiToken.value = credentials.apiToken
      if (credentials.doubaoApiKey) doubaoApiKey.value = credentials.doubaoApiKey

      const encryptedData = {}

      if (credentials.accountId) {
        encryptedData.accountId = await encryptData(credentials.accountId)
      }
      if (credentials.apiToken) {
        encryptedData.apiToken = await encryptData(credentials.apiToken)
      }
      if (credentials.doubaoApiKey) {
        encryptedData.doubaoApiKey = await encryptData(credentials.doubaoApiKey)
      }

      const encryptedCredentials = {
        ...encryptedData,
        workerUrl: workerUrl.value,
        encrypted: true,
        lastVerified: lastVerified.value
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(encryptedCredentials))

      return true
    } catch (error) {
      console.error('[Credentials] Failed to save credentials:', error)
      throw new Error('保存凭证失败')
    }
  }

  /**
   * 加载凭证
   * 优先从环境变量加载，否则从本地存储加载
   */
  async function loadCredentials() {
    // 防止重复加载
    if (loaded.value || loading.value) {
      return hasCredentials.value
    }

    loading.value = true

    try {
      // 1. 从环境变量加载
      const envCloudflareAccountId = import.meta.env.VITE_CLOUDFLARE_ACCOUNT_ID
      const envCloudflareApiToken = import.meta.env.VITE_CLOUDFLARE_API_TOKEN
      const envWorkerUrl = import.meta.env.VITE_WORKER_URL
      const envDoubaoApiKey = import.meta.env.VITE_DOUBAO_API_KEY

      if (envCloudflareAccountId && envCloudflareApiToken) {
        console.log('[Credentials] Loading Cloudflare credentials from environment')
        accountId.value = envCloudflareAccountId
        apiToken.value = envCloudflareApiToken
        workerUrl.value = envWorkerUrl || AI_CONFIG.workerUrl
        mode.value = 'env'
      }

      if (envDoubaoApiKey) {
        console.log('[Credentials] Loading Doubao credentials from environment')
        doubaoApiKey.value = envDoubaoApiKey
        mode.value = 'env'
      }

      // 如果环境变量中有凭证，直接返回
      if (hasCloudflareEnvCredentials.value || hasDoubaoEnvCredentials.value) {
        encrypted.value = false
        loaded.value = true
        return true
      }

      // 2. 从本地存储加载（手动输入的凭证）
      const stored = localStorage.getItem(STORAGE_KEY)

      if (!stored) {
        console.log('[Credentials] No credentials found')
        loaded.value = true
        return false
      }

      const credentials = JSON.parse(stored)

      // 解密凭证
      if (credentials.encrypted) {
        if (credentials.accountId) {
          accountId.value = await decryptData(credentials.accountId)
        }
        if (credentials.apiToken) {
          apiToken.value = await decryptData(credentials.apiToken)
        }
        if (credentials.doubaoApiKey) {
          doubaoApiKey.value = await decryptData(credentials.doubaoApiKey)
        }
      } else {
        // 兼容旧版本未加密的数据
        if (credentials.accountId) accountId.value = credentials.accountId
        if (credentials.apiToken) apiToken.value = credentials.apiToken
        if (credentials.doubaoApiKey) doubaoApiKey.value = credentials.doubaoApiKey
      }

      mode.value = 'manual'
      workerUrl.value = credentials.workerUrl || AI_CONFIG.workerUrl
      lastVerified.value = credentials.lastVerified || null

      console.log('[Credentials] Loaded from local storage')
      loaded.value = true
      return true
    } catch (error) {
      console.error('[Credentials] Failed to load credentials:', error)
      // 如果解密失败，清除存储
      clearCredentials()
      loaded.value = true
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * 测试连接
   * 验证凭证是否有效
   */
  async function testConnection() {
    if (!hasCredentials.value) {
      throw new Error('请先配置 API 凭证')
    }

    try {
      // 使用一个简单的测试图片（1x1 透明 PNG）
      const testImage =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

      const response = await fetch(workerUrl.value, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          accountId: accountId.value,
          aiToken: apiToken.value,
          image: testImage,
          prompt: 'Test connection',
          model: '@cf/meta/llama-3.2-11b-vision-instruct',
          maxTokens: 10,
          temperature: 0.3
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))

        if (errorData.errors && errorData.errors[0]) {
          const error = errorData.errors[0]

          // 401 错误表示凭证无效
          if (error.code === 401 || response.status === 401) {
            throw new Error('API 凭证无效，请检查 Account ID 和 API Token')
          }

          // 5016 错误表示需要同意协议（但凭证是有效的）
          if (error.code === 5016) {
            lastVerified.value = Date.now()
            await saveCredentials(accountId.value, apiToken.value, mode.value)
            return {
              success: true,
              message: '凭证有效（需要同意模型协议）'
            }
          }

          throw new Error(`连接失败: ${error.message}`)
        }

        throw new Error(`连接失败: ${response.status}`)
      }

      // 连接成功
      lastVerified.value = Date.now()
      await saveCredentials(accountId.value, apiToken.value, mode.value)

      return {
        success: true,
        message: '连接成功！'
      }
    } catch (error) {
      console.error('[Credentials] Test connection failed:', error)
      throw error
    }
  }

  /**
   * 清除凭证
   */
  function clearCredentials() {
    accountId.value = ''
    apiToken.value = ''
    mode.value = 'manual'
    lastVerified.value = null
    loaded.value = false

    localStorage.removeItem(STORAGE_KEY)
  }

  /**
   * 设置 Worker URL
   * @param {string} url - Worker URL
   */
  function setWorkerUrl(url) {
    workerUrl.value = url
  }

  /**
   * 获取凭证对象
   * @returns {Object} 凭证对象
   */
  function getCredentials() {
    return {
      mode: mode.value,
      accountId: accountId.value,
      apiToken: apiToken.value,
      workerUrl: workerUrl.value
    }
  }

  return {
    // State
    mode,
    accountId,
    apiToken,
    doubaoApiKey,
    workerUrl,
    encrypted,
    lastVerified,
    loading,
    loaded,

    // Computed
    hasCredentials,
    hasCloudflareEnvCredentials,
    hasDoubaoEnvCredentials,
    cloudflareCredentials,
    doubaoCredentials,
    credentialsSource,
    isProduction,

    // Actions
    saveCredentials,
    loadCredentials,
    testConnection,
    clearCredentials,
    setWorkerUrl,
    getCredentials,
    getCredentialsByProvider
  }
})
