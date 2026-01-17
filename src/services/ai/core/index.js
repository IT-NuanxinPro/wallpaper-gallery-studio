/**
 * AI 核心服务
 * 提供共享的 Provider、图片处理等功能
 */

// 导出 Provider 相关
export {
  AI_PROVIDERS,
  AIProviderFactory,
  PROVIDER_DISPLAY,
  BaseAIProvider,
  CloudflareProvider,
  DoubaoProvider
} from './providers'

// 导出图片处理相关
export { compressImage, fileToBase64, IMAGE_CONFIG } from './image-processor'
