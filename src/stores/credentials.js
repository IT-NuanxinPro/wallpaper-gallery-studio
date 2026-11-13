import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  createSessionCredentialStorage,
  DEFAULT_AI_BASE_URL,
  normalizeAiBaseUrl,
  normalizeAiKey
} from '@/services/ai/session-credentials'
import { normalizeModelId } from '@/services/ai/model'
import { normalizeModelList } from '@/services/ai/model-catalog'

export const useCredentialsStore = defineStore('credentials', () => {
  const apiKey = ref('')
  const baseUrl = ref(DEFAULT_AI_BASE_URL)
  const selectedModel = ref('')
  const models = ref([])
  const loaded = ref(false)
  const loading = ref(false)
  const storageWarning = ref('')
  const sessionRevision = ref(0)
  const storage = createSessionCredentialStorage()
  let controller = new globalThis.AbortController()

  const hasCredentials = computed(() => !!apiKey.value)
  const hasModelReady = computed(
    () => hasCredentials.value && models.value.some(item => item.id === selectedModel.value)
  )
  const defaultProvider = computed(() => 'sub2api')
  const credentialsSource = computed(() => '当前标签页')
  const availableProviders = computed(() =>
    hasModelReady.value ? [{ key: 'sub2api', name: 'OpenAI 兼容接口', source: '当前标签页' }] : []
  )

  function getCredentials() {
    return {
      apiKey: apiKey.value,
      baseUrl: baseUrl.value,
      model: hasModelReady.value ? selectedModel.value : '',
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

  function persist() {
    const persisted = storage.write({
      apiKey: apiKey.value,
      baseUrl: baseUrl.value,
      model: selectedModel.value,
      models: models.value
    })
    storageWarning.value = persisted
      ? ''
      : '浏览器未允许会话缓存，本次配置仅保留在当前页面，刷新后需重新填写。'
  }

  function loadCredentials() {
    if (loaded.value) return hasCredentials.value
    loading.value = true
    try {
      const value = storage.read()
      if (value) {
        apiKey.value = value.apiKey
        baseUrl.value = value.baseUrl
        models.value = value.models
        selectedModel.value = value.model
      }
      loaded.value = true
      return hasCredentials.value
    } finally {
      loading.value = false
    }
  }

  function saveCredentials(value) {
    loadCredentials()
    const nextKey = normalizeAiKey(value?.apiKey)
    const nextUrl = normalizeAiBaseUrl(value?.baseUrl || DEFAULT_AI_BASE_URL)
    const nextModels = normalizeModelList(value?.models, nextKey)
    const nextModel = normalizeModelId(value?.model)
    if (!nextModel || !nextModels.some(item => item.id === nextModel)) {
      throw new Error('请获取模型列表并选择一个模型')
    }
    renewSession()
    apiKey.value = nextKey
    baseUrl.value = nextUrl
    models.value = nextModels
    selectedModel.value = nextModel
    persist()
    return true
  }

  function selectModel(value) {
    loadCredentials()
    const nextModel = normalizeModelId(value)
    if (!hasCredentials.value || !models.value.some(item => item.id === nextModel)) {
      throw new Error('请从当前模型列表中选择')
    }
    if (nextModel === selectedModel.value) return
    renewSession()
    selectedModel.value = nextModel
    persist()
  }

  function clearCredentials() {
    renewSession()
    apiKey.value = ''
    baseUrl.value = DEFAULT_AI_BASE_URL
    selectedModel.value = ''
    models.value = []
    storage.clear()
    storageWarning.value = ''
    loaded.value = true
  }

  const sub2apiApiKey = computed(() => apiKey.value)
  const sub2apiCredentials = computed(getCredentials)
  return {
    apiKey,
    baseUrl,
    selectedModel,
    models,
    loaded,
    loading,
    storageWarning,
    sessionRevision,
    hasCredentials,
    hasModelReady,
    defaultProvider,
    credentialsSource,
    availableProviders,
    sub2apiApiKey,
    sub2apiCredentials,
    loadCredentials,
    saveCredentials,
    selectModel,
    clearCredentials,
    getCredentials,
    getCredentialsByProvider
  }
})
