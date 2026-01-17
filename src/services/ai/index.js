/**
 * AI 服务
 * 统一导出所有 AI 相关服务
 */

// 核心服务（共享）
export * from './core'

// 分类服务（上传页面使用）
export * as classifier from './classifier'

// 助手服务（AI 助手页面使用）
export * as assistant from './assistant'
