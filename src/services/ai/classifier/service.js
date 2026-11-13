/**
 * 分类服务
 * 用于图片分类和元数据生成
 */

import { AIProviderFactory, compressImage, IMAGE_CONFIG } from '../core'
import { buildPromptWithLatestCategories, validatePrompt } from './prompts'
import { normalizeModelId, AI_PROVIDER } from '../model'
/**
 * 分析图片并生成分类和文件名建议
 */
export async function analyzeImage({
  file,
  imageBase64,
  series,
  credentials,
  promptTemplate = 'default',
  customPrompt = ''
}) {
  const model = normalizeModelId(credentials?.model)
  if (!model) throw new Error('请先从远程列表选择 AI 模型')
  let base64Image = imageBase64
  if (!base64Image && file) {
    base64Image = await compressImage(file, IMAGE_CONFIG)
  }

  if (!base64Image) {
    throw new Error('No image provided')
  }

  const prompt = await buildPromptWithLatestCategories(
    promptTemplate,
    series,
    customPrompt,
    AI_PROVIDER
  )
  if (!validatePrompt(prompt)) {
    throw new Error('Invalid prompt')
  }

  const provider = AIProviderFactory.create(AI_PROVIDER)

  const analysis = await provider.analyze({
    imageBase64: base64Image,
    prompt,
    credentials: {
      ...credentials,
      model
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
    meta: {
      provider: AI_PROVIDER,
      model,
      series,
      promptTemplate,
      timestamp: Date.now()
    }
  }
}

/** 批量分析图片，逐张使用同一当前会话。 */
export async function analyzeBatch({
  files,
  series,
  credentials,
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
        credentials,
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
  } catch {
    return false
  }
}
