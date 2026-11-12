/**
 * AI Store
 * 统一管理 AI 分析状态，供上传页面和 AI 助手页面使用
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useCredentialsStore } from './credentials'
import { AI_MODEL_KEY, AI_PROVIDER } from '@/services/ai/model'
import { AIProviderFactory, AI_PROVIDERS, compressImage, IMAGE_CONFIG } from '@/services/ai/core'
import {
  buildPromptWithLatestCategories,
  getModelByKey,
  CLASSIFIER_CONFIG
} from '@/services/ai/classifier'

// 兼容导出
export { AI_PROVIDERS }

export const useAIStore = defineStore('ai', () => {
  const analyzing = ref(false)
  const currentModel = ref(CLASSIFIER_CONFIG.defaultModel)
  const currentProvider = ref(CLASSIFIER_CONFIG.defaultProvider)
  const promptTemplate = ref(CLASSIFIER_CONFIG.defaultPromptTemplate)
  const results = ref([])
  const error = ref(null)

  const hasResults = computed(() => results.value.length > 0)
  const currentModelConfig = computed(() => {
    return getModelByKey(AI_MODEL_KEY)
  })

  /**
   * 调用当前标签页配置的固定模型
   */
  async function callAI(imageBase64, prompt) {
    const credentialsStore = useCredentialsStore()

    if (!credentialsStore.hasCredentials) {
      throw new Error('请先配置 API 凭证')
    }

    const modelConfig = currentModelConfig.value
    if (!modelConfig) {
      throw new Error('无效的模型配置')
    }

    // 根据当前 Provider 创建对应的 Provider 实例
    const provider = AIProviderFactory.create(AI_PROVIDER)

    // 获取对应 Provider 的凭证
    const credentials = credentialsStore.getCredentialsByProvider(AI_PROVIDER)

    if (!credentials?.apiKey?.trim()) {
      throw new Error('请先配置当前标签页的 API Key')
    }

    // 调用 Provider 的 analyze 方法
    const analysis = await provider.analyze({
      imageBase64,
      prompt,
      credentials: {
        ...credentials,
        model: modelConfig.id,
        maxTokens: modelConfig.maxTokens,
        temperature: modelConfig.temperature,
        reasoningEffort: modelConfig.reasoningEffort
      }
    })

    if (credentials.signal?.aborted) {
      throw Object.assign(new Error('AI 会话配置已变更，请重新分析'), { name: 'AbortError' })
    }

    return analysis
  }

  /**
   * 分析单张图片
   */
  async function analyzeImage(file, primaryCategory, customPrompt = '') {
    analyzing.value = true
    error.value = null

    try {
      const imageBase64 = await compressImage(file, IMAGE_CONFIG)
      const prompt = await buildPromptWithLatestCategories(
        promptTemplate.value,
        primaryCategory,
        customPrompt,
        currentProvider.value
      )
      const analysis = await callAI(imageBase64, prompt)

      const result = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        imageUrl: URL.createObjectURL(file),
        imageName: file.name,
        imageSize: file.size,
        primary: primaryCategory,
        secondary: analysis.secondary || '通用',
        third: analysis.third ?? '',
        filenameSuggestions: analysis.filenameSuggestions || [file.name],
        selectedFilename: analysis.filenameSuggestions?.[0] || file.name,
        filename: analysis.filename,
        description: analysis.description || '',
        keywords: analysis.keywords || [],
        confidence: analysis.confidence || 0,
        model: AI_MODEL_KEY,
        provider: AI_PROVIDER,
        promptTemplate: promptTemplate.value,
        displayTitle: analysis.displayTitle || null,
        is_perfect_match: analysis.is_perfect_match,
        new_category_proposal: analysis.new_category_proposal || null,
        reasoning: analysis.reasoning || null
      }

      results.value.unshift(result)
      return result
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      analyzing.value = false
    }
  }

  async function analyzeBatch(files, primaryCategory, customPrompt = '', onProgress = null) {
    const batchResults = []
    const batchErrors = []

    for (let i = 0; i < files.length; i++) {
      try {
        const result = await analyzeImage(files[i], primaryCategory, customPrompt)
        batchResults.push(result)
      } catch (err) {
        batchErrors.push({ file: files[i].name, error: err.message })
      }

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: files.length,
          progress: Math.round(((i + 1) / files.length) * 100)
        })
      }
    }

    return {
      results: batchResults,
      errors: batchErrors,
      total: files.length,
      success: batchResults.length,
      failed: batchErrors.length
    }
  }

  function setModel() {
    currentModel.value = AI_MODEL_KEY
  }

  function setProvider() {
    currentProvider.value = AI_PROVIDER
  }

  function setPromptTemplate(templateId) {
    promptTemplate.value = templateId
  }

  function clearResults() {
    results.value = []
    error.value = null
  }

  return {
    analyzing,
    currentModel,
    currentProvider,
    promptTemplate,
    results,
    error,
    hasResults,
    currentModelConfig,
    analyzeImage,
    analyzeBatch,
    setModel,
    setProvider,
    setPromptTemplate,
    clearResults
  }
})
