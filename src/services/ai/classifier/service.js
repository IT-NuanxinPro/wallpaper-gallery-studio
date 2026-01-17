/**
 * 分类服务
 * 用于图片分类和元数据生成
 */

import { AIProviderFactory, compressImage, IMAGE_CONFIG } from '../core'
import { buildPrompt, validatePrompt } from './prompts'
import { getModelByKey } from './config'

/**
 * 分析图片并生成分类和文件名建议
 */
export async function analyzeImage({
  file,
  imageBase64,
  series,
  providerType,
  credentials,
  modelKey,
  promptTemplate = 'default',
  customPrompt = ''
}) {
  try {
    let base64Image = imageBase64
    if (!base64Image && file) {
      base64Image = await compressImage(file, IMAGE_CONFIG)
    }

    if (!base64Image) {
      throw new Error('No image provided')
    }

    const prompt = buildPrompt(promptTemplate, series, customPrompt)
    if (!validatePrompt(prompt)) {
      throw new Error('Invalid prompt')
    }

    const modelConfig = getModelByKey(modelKey)
    if (!modelConfig) {
      throw new Error(`Unknown model: ${modelKey}`)
    }

    const provider = AIProviderFactory.create(providerType)

    const analysis = await provider.analyze({
      imageBase64: base64Image,
      prompt,
      credentials: {
        ...credentials,
        model: modelConfig.id
      }
    })

    return {
      secondary: analysis.secondary,
      third: analysis.third,
      filenameSuggestions: analysis.filenameSuggestions || [],
      keywords: analysis.keywords || [],
      description: analysis.description || '',
      confidence: analysis.confidence || 0,
      displayTitle: analysis.displayTitle || analysis.display_title || null,
      is_perfect_match: analysis.is_perfect_match,
      new_category_proposal: analysis.new_category_proposal || null,
      reasoning: analysis.reasoning || null,
      raw: analysis.raw,
      meta: {
        provider: providerType,
        model: modelKey,
        series,
        promptTemplate,
        timestamp: Date.now()
      }
    }
  } catch (error) {
    console.error('AI 分析失败:', error)
    throw error
  }
}

/**
 * 批量分析图片
 */
export async function analyzeBatch({
  files,
  series,
  providerType,
  credentials,
  modelKey,
  promptTemplate = 'default',
  customPrompt = '',
  onProgress
}) {
  const results = []

  for (let i = 0; i < files.length; i++) {
    try {
      const result = await analyzeImage({
        file: files[i],
        series,
        providerType,
        credentials,
        modelKey,
        promptTemplate,
        customPrompt
      })

      results.push({
        file: files[i],
        analysis: result,
        success: true
      })
    } catch (error) {
      results.push({
        file: files[i],
        error: error.message,
        success: false
      })
    }

    if (onProgress) {
      onProgress({
        current: i + 1,
        total: files.length,
        progress: Math.round(((i + 1) / files.length) * 100)
      })
    }
  }

  return results
}

/**
 * 验证 Provider 凭证
 */
export function validateCredentials(providerType, credentials) {
  try {
    const provider = AIProviderFactory.create(providerType)
    return provider.validateCredentials(credentials)
  } catch (error) {
    console.error('验证凭证失败:', error)
    return false
  }
}
