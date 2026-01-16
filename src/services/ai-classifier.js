/**
 * AI 图片分类和命名服务
 * 支持多个 AI Provider（Cloudflare、豆包等）
 */

import { AIProviderFactory } from './ai-providers'
import { getModelById } from '@/config/ai-models'

/**
 * 分析图片并生成分类和文件名建议
 * @param {Object} params
 * @param {File} params.file - 图片文件
 * @param {string} params.imageBase64 - Base64 编码的图片（可选，如果提供则不读取 file）
 * @param {string} params.prompt - 提示词
 * @param {string} params.providerType - Provider 类型 (cloudflare, doubao)
 * @param {Object} params.credentials - 凭证信息
 * @param {string} params.modelId - 模型 ID
 * @returns {Promise<Object>} 分析结果
 */
export async function analyzeImage({
  file,
  imageBase64,
  prompt,
  providerType,
  credentials,
  modelId
}) {
  try {
    // 1. 获取图片 base64
    let base64Image = imageBase64
    if (!base64Image && file) {
      base64Image = await fileToBase64(file)
    }

    if (!base64Image) {
      throw new Error('No image provided')
    }

    // 2. 创建 Provider 实例
    const provider = AIProviderFactory.create(providerType)

    // 3. 准备凭证（包含模型信息）
    const fullCredentials = {
      ...credentials,
      model: modelId
    }

    // 4. 调用 AI 分析
    const analysis = await provider.analyze({
      imageBase64: base64Image,
      prompt,
      credentials: fullCredentials
    })

    // 5. 生成文件名建议
    const filenameSuggestions = generateFilenames(analysis)

    return {
      // 文件名建议（3个选项）
      filenameSuggestions,

      // 分类结果
      category: {
        secondary: analysis.secondary,
        third: analysis.third
      },

      // 关键词
      keywords: analysis.keywords,

      // 图片描述
      description: analysis.description,

      // 原始分析结果
      raw: analysis.raw,

      // 元信息
      meta: {
        provider: providerType,
        model: modelId,
        timestamp: Date.now()
      }
    }
  } catch (error) {
    console.error('AI 分析失败:', error)
    throw error
  }
}

/**
 * 生成文件名建议（3个选项）
 */
function generateFilenames(analysis) {
  const base = analysis.filename || '未命名'
  const timestamp = Date.now().toString().slice(-6)

  return [
    // 选项1: AI 建议的文件名
    base,

    // 选项2: 文件名 + 时间戳
    `${base}-${timestamp}`,

    // 选项3: 分类 + 关键词
    `${analysis.secondary}-${analysis.keywords?.[0] || '图片'}`
  ]
}

/**
 * 将文件转换为 base64
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // 返回完整的 data URL
      resolve(reader.result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * 批量分析图片
 * @param {Object} params
 * @param {File[]} params.files - 图片文件数组
 * @param {string} params.prompt - 提示词
 * @param {string} params.providerType - Provider 类型
 * @param {Object} params.credentials - 凭证信息
 * @param {string} params.modelId - 模型 ID
 * @param {Function} params.onProgress - 进度回调
 * @returns {Promise<Array>}
 */
export async function analyzeBatch({
  files,
  prompt,
  providerType,
  credentials,
  modelId,
  onProgress
}) {
  const results = []

  for (let i = 0; i < files.length; i++) {
    try {
      const result = await analyzeImage({
        file: files[i],
        prompt,
        providerType,
        credentials,
        modelId
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

    // 进度回调
    if (onProgress) {
      onProgress(i + 1, files.length)
    }
  }

  return results
}

/**
 * 验证 Provider 凭证
 * @param {string} providerType - Provider 类型
 * @param {Object} credentials - 凭证信息
 * @returns {boolean}
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
