/**
 * AI 分类器 Store
 * 管理上传页面的 AI 分类状态
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useCredentialsStore } from './credentials'
import {
  analyzeImage as classifierAnalyze,
  analyzeBatch as classifierBatchAnalyze,
  CLASSIFIER_CONFIG,
  getModelByKey
} from '@/services/ai/classifier'

export const useAIClassifierStore = defineStore('ai-classifier', () => {
  // 状态
  const analyzing = ref(false)
  const currentModel = ref(CLASSIFIER_CONFIG.defaultModel)
  const currentProvider = ref(CLASSIFIER_CONFIG.defaultProvider)
  const promptTemplate = ref(CLASSIFIER_CONFIG.defaultPromptTemplate)
  const customPrompt = ref('')
  const results = ref([])
  const error = ref(null)

  // 计算属性
  const hasResults = computed(() => results.value.length > 0)
  const currentModelConfig = computed(() => getModelByKey(currentModel.value))

  /**
   * 分析单张图片
   * @param {File} file - 图片文件
   * @param {string} series - 系列（desktop/mobile/avatar）
   * @returns {Promise<Object>} 分析结果
   */
  async function analyzeImage(file, series) {
    analyzing.value = true
    error.value = null

    try {
      const credentialsStore = useCredentialsStore()

      if (!credentialsStore.hasCredentials) {
        throw new Error('请先配置 API 凭证')
      }

      const credentials = credentialsStore.getCredentialsByProvider(currentProvider.value)
      if (!credentials) {
        throw new Error(`未配置 ${currentProvider.value} 的凭证`)
      }

      const analysis = await classifierAnalyze({
        file,
        series,
        providerType: currentProvider.value,
        credentials,
        modelKey: currentModel.value,
        promptTemplate: promptTemplate.value,
        customPrompt: customPrompt.value
      })

      const result = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        imageUrl: URL.createObjectURL(file),
        imageName: file.name,
        imageSize: file.size,
        ...analysis
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

  /**
   * 批量分析图片
   * @param {File[]} files - 图片文件数组
   * @param {string} series - 系列
   * @param {Function} onProgress - 进度回调
   * @returns {Promise<Object>} 批量分析结果
   */
  async function analyzeBatch(files, series, onProgress = null) {
    const credentialsStore = useCredentialsStore()

    if (!credentialsStore.hasCredentials) {
      throw new Error('请先配置 API 凭证')
    }

    const credentials = credentialsStore.getCredentialsByProvider(currentProvider.value)
    if (!credentials) {
      throw new Error(`未配置 ${currentProvider.value} 的凭证`)
    }

    const batchResult = await classifierBatchAnalyze({
      files,
      series,
      providerType: currentProvider.value,
      credentials,
      modelKey: currentModel.value,
      promptTemplate: promptTemplate.value,
      onProgress
    })

    // 将成功的结果添加到历史
    batchResult.results.forEach(item => {
      const result = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        imageUrl: URL.createObjectURL(item.file),
        imageName: item.file.name,
        imageSize: item.file.size,
        ...item.analysis
      }
      results.value.unshift(result)
    })

    return batchResult
  }

  /**
   * 设置模型
   */
  function setModel(modelKey) {
    currentModel.value = modelKey
  }

  /**
   * 设置 Provider
   */
  function setProvider(providerKey) {
    currentProvider.value = providerKey
  }

  /**
   * 设置提示词模板
   */
  function setPromptTemplate(templateId) {
    promptTemplate.value = templateId
  }

  /**
   * 设置自定义提示词
   */
  function setCustomPrompt(prompt) {
    customPrompt.value = prompt
  }

  /**
   * 清空结果
   */
  function clearResults() {
    results.value = []
    error.value = null
  }

  return {
    // 状态
    analyzing,
    currentModel,
    currentProvider,
    promptTemplate,
    customPrompt,
    results,
    error,

    // 计算属性
    hasResults,
    currentModelConfig,

    // 方法
    analyzeImage,
    analyzeBatch,
    setModel,
    setProvider,
    setPromptTemplate,
    setCustomPrompt,
    clearResults
  }
})
