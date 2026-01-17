/**
 * 分类服务
 * 用于上传页面的图片分类和元数据生成
 * 独立于 AI 助手
 */

// 服务
export { analyzeImage, analyzeBatch, validateCredentials } from './service'

// 配置
export {
  CLASSIFIER_CONFIG,
  CLASSIFIER_MODELS,
  SPEED_LEVELS,
  ACCURACY_LEVELS,
  COST_LEVELS,
  getModelList,
  getModelByKey,
  getRecommendedModel
} from './config'

// 提示词
export {
  PROMPT_TEMPLATES,
  SERIES_TEMPLATES,
  buildPrompt,
  buildVariables,
  replaceVariables,
  validatePrompt,
  getTemplateList,
  getTemplateById
} from './prompts'
