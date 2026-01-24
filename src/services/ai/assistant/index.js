/**
 * AI 助手服务
 * 用于 AI 助手页面的对话式交互
 * 独立于分类服务
 */

// 服务
export { sendMessage, analyzeImage, generateFilename } from './service'

// 配置
export {
  ASSISTANT_CONFIG,
  ASSISTANT_MODELS,
  getModelList,
  getModelByKey,
  getRecommendedModel,
  SPEED_LEVELS,
  ACCURACY_LEVELS,
  COST_LEVELS
} from './config'

// 提示词
export { SYSTEM_PROMPTS, TASK_PROMPTS, getSystemPrompt, getTaskPrompt } from './prompts'
