/** 当前标签页共用AI配置。用户Key不读取构建环境，也不写入长期本地存储。 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  createSessionCredentialStorage,
  DEFAULT_AI_BASE_URL,
  normalizeAiBaseUrl
} from '@/services/ai/session-credentials'

export const useCredentialsStore = defineStore('credentials', () => {
  const apiKey = ref('')
  const baseUrl = ref(DEFAULT_AI_BASE_URL)
  const loaded = ref(false)
  const loading = ref(false)
  const storageWarning = ref('')
  const sessionRevision = ref(0)
  const storage = createSessionCredentialStorage()
  let controller = new globalThis.AbortController()

  const hasCredentials = computed(() => !!apiKey.value)
  const defaultProvider = computed(() => 'sub2api')
  const credentialsSource = computed(() => '当前标签页')
  const availableProviders = computed(() =>
    hasCredentials.value ? [{ key: 'sub2api', name: 'GPT-6.1 Sol', source: '当前标签页' }] : []
  )

  function getCredentials() {
    return {
      apiKey: apiKey.value,
      baseUrl: baseUrl.value,
      signal: controller.signal,
      sessionRevision: sessionRevision.value
    }
  }

  function getCredentialsByProvider(provider) {
    return provider === 'sub2api' ? getCredentials() : null
  }

  function renewSession() {
    controller.abort()
    controller = new globalThis.AbortController()
    sessionRevision.value++
  }

  function loadCredentials() {
    if (loaded.value) return hasCredentials.value
    loading.value = true
    try {
      const value = storage.read()
      if (value) {
        apiKey.value = value.apiKey
        baseUrl.value = value.baseUrl
      }
      loaded.value = true
      return hasCredentials.value
    } finally {
      loading.value = false
    }
  }

  function saveCredentials(value) {
    loadCredentials()
    const nextKey = String(value?.apiKey ?? value?.sub2apiApiKey ?? '').trim()
    if (
      !nextKey ||
      nextKey.length > 8192 ||
      /\s/.test(nextKey) ||
      [...nextKey].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    )
      throw new Error('请输入有效的 API Key，不要包含空格或换行')
    const nextUrl = normalizeAiBaseUrl(value?.baseUrl || baseUrl.value || DEFAULT_AI_BASE_URL)
    renewSession()
    apiKey.value = nextKey
    baseUrl.value = nextUrl
    const persisted = storage.write({ apiKey: nextKey, baseUrl: nextUrl })
    storageWarning.value = persisted
      ? ''
      : '浏览器未允许会话缓存，本次配置仅保留在当前页面，刷新后需重新填写。'
    return true
  }

  function clearCredentials() {
    renewSession()
    apiKey.value = ''
    baseUrl.value = DEFAULT_AI_BASE_URL
    storage.clear()
    storageWarning.value = ''
    loaded.value = true
  }

  const sub2apiApiKey = computed(() => apiKey.value)
  const sub2apiCredentials = computed(getCredentials)
  return {
    apiKey,
    baseUrl,
    loaded,
    loading,
    storageWarning,
    sessionRevision,
    hasCredentials,
    defaultProvider,
    credentialsSource,
    availableProviders,
    sub2apiApiKey,
    sub2apiCredentials,
    loadCredentials,
    saveCredentials,
    clearCredentials,
    getCredentials,
    getCredentialsByProvider
  }
})
