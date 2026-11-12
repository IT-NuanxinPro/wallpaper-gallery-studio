/**
 * AI 助手服务
 * 用于对话式交互
 */

import { AIProviderFactory, compressImage, IMAGE_CONFIG } from '../core'
import { getSystemPrompt } from './prompts'
import { getModelByKey } from '../classifier/config'
import { AI_MODEL_KEY, AI_PROVIDER } from '../model'

/**
 * 发送消息给 AI
 */
export async function sendMessage({ message, image, credentials, systemPromptType = 'default' }) {
  const modelConfig = getModelByKey(AI_MODEL_KEY)

  const provider = AIProviderFactory.create(AI_PROVIDER)
  const systemPrompt = getSystemPrompt(systemPromptType)

  let imageBase64 = null
  if (image) {
    imageBase64 = await compressImage(image, IMAGE_CONFIG)
  }

  const fullPrompt = `${systemPrompt}\n\n用户：${message}`

  const response = await provider.analyze({
    imageBase64,
    prompt: fullPrompt,
    credentials: {
      ...credentials,
      model: modelConfig.id
    }
  })

  return {
    message: response.description || '无法解析响应'
  }
}

/**
 * 分析图片
 */
export async function analyzeImage({
  image,
  providerType,
  credentials,
  modelKey,
  analysisType = 'analyze'
}) {
  const prompts = {
    analyze: '请详细分析这张图片的内容、风格、情感和构图。',
    filename:
      '请为这张图片生成3个合适的中文文件名（8-15个汉字），格式：["文件名1.jpg", "文件名2.jpg", "文件名3.jpg"]',
    describe: '请用20-40字优美地描述这张图片。'
  }

  return sendMessage({
    message: prompts[analysisType] || prompts.analyze,
    image,
    providerType,
    credentials,
    modelKey,
    systemPromptType: 'default'
  })
}

/**
 * 生成文件名
 */
export async function generateFilename({ image, providerType, credentials, modelKey }) {
  return analyzeImage({
    image,
    providerType,
    credentials,
    modelKey,
    analysisType: 'filename'
  })
}
