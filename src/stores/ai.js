import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { AI_CONFIG, getModelByKey, AI_PROVIDERS } from '@/config/ai-config'
import { buildPrompt } from '@/utils/prompt-builder'
import { parseResponse } from '@/utils/response-parser'
import { useCredentialsStore } from './credentials'
import { AIProviderFactory } from '@/services/ai-providers'

export const useAIStore = defineStore('ai', () => {
  const analyzing = ref(false)
  const currentModel = ref(AI_CONFIG.defaultModel)
  const currentProvider = ref(AI_CONFIG.defaultProvider)
  const promptTemplate = ref(AI_CONFIG.defaultPromptTemplate)
  const results = ref([])
  const error = ref(null)

  const hasResults = computed(() => results.value.length > 0)
  const currentModelConfig = computed(() => getModelByKey(currentModel.value))

  async function compressImage(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        reject(new Error('请上传图片文件'))
        return
      }

      const reader = new FileReader()
      reader.onload = e => {
        // eslint-disable-next-line no-undef
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')

          let width = img.width
          let height = img.height
          const maxSize = AI_CONFIG.image.maxSize

          if (width > maxSize || height > maxSize) {
            if (width > height) {
              height = (height / width) * maxSize
              width = maxSize
            } else {
              width = (width / height) * maxSize
              height = maxSize
            }
          }

          canvas.width = width
          canvas.height = height
          ctx.drawImage(img, 0, 0, width, height)

          resolve(canvas.toDataURL(AI_CONFIG.image.format, AI_CONFIG.image.quality))
        }
        img.onerror = () => reject(new Error('图片加载失败'))
        img.src = e.target.result
      }
      reader.onerror = () => reject(new Error('文件读取失败'))
      reader.readAsDataURL(file)
    })
  }

  /**
   * 调用 AI API（支持多 Provider）
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
    const provider = AIProviderFactory.create(currentProvider.value)

    // 获取对应 Provider 的凭证
    const credentials = credentialsStore.getCredentialsByProvider(currentProvider.value)

    if (!credentials) {
      throw new Error(`未配置 ${currentProvider.value} 的凭证`)
    }

    // 调用 Provider 的 analyze 方法
    const analysis = await provider.analyze({
      imageBase64,
      prompt,
      credentials: {
        ...credentials,
        model: modelConfig.id
      }
    })

    return analysis
  }

  /**
   * 分析单张图片
   */
  async function analyzeImage(file, primaryCategory, customPrompt = '') {
    analyzing.value = true
    error.value = null

    try {
      const imageBase64 = await compressImage(file)
      const prompt = buildPrompt(promptTemplate.value, primaryCategory, customPrompt)
      const analysis = await callAI(imageBase64, prompt)

      const result = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        imageUrl: URL.createObjectURL(file),
        imageName: file.name,
        imageSize: file.size,
        primary: primaryCategory,
        secondary: analysis.secondary || '通用',
        third: analysis.third || '通用',
        filenameSuggestions: analysis.filenameSuggestions || [file.name],
        selectedFilename: analysis.filenameSuggestions?.[0] || file.name,
        description: analysis.description || '',
        keywords: analysis.keywords || [],
        confidence: analysis.confidence || 0,
        model: currentModel.value,
        provider: currentProvider.value,
        promptTemplate: promptTemplate.value,
        // 新增字段
        display_title: analysis.display_title || null,
        is_perfect_match: analysis.is_perfect_match,
        new_category_proposal: analysis.new_category_proposal || null,
        reasoning: analysis.reasoning || null,
        raw: analysis.raw
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

  function setModel(modelKey) {
    currentModel.value = modelKey
  }

  function setProvider(providerKey) {
    currentProvider.value = providerKey
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
