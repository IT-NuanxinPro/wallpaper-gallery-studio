# AI 共用会话配置 UI 验证

验证日期：2026-11-12（Asia/Shanghai）。

## 完成范围

- 设置页第一张卡片为共用配置：固定 GPT-6.1 Sol、默认 API 地址、密码 Key 输入、保存到当前标签页、清除、存储失败提示。
- 配置表单监听会话版本，浏览器恢复等外部清除动作会同步移除密码输入中的旧 Key。
- 图片上传、AI 工坊、视频审核入口都连接同标签路由 `/settings#ai-config`。模型与服务商选择 UI 已移除，旧 `AIProviderSelector` 仅复用 `CredentialsConfig`。
- 未配置 Key 时禁止 AI 模式切换、工坊分析、视频分析及任务重试；图片可先进入待处理队列，人工上传和视频审核字段继续可用。
- AI 弹窗使用统一 store 与分类服务对象参数，固定模型；关闭/切换文件时不接收旧结果，释放预览资源与进度计时器。
- 视频分析在返回后检查会话取消信号，清除或更换 Key 时不保存旧结果，仍释放服务端 AI 租约。

## 验证结果

先增加新行为测试并确认旧实现失败，再完成对应实现。

定向 Vitest：8 个文件、44 项测试全部通过。

```sh
npx vitest run \
  "src/components/ai/CredentialsConfig.test.js" \
  "src/components/ai/SharedAiEntrypoints.test.js" \
  "src/components/ai/PromptTemplateSelector.test.js" \
  "src/components/upload/AIAnalysisModal.test.js" \
  "src/components/upload/EditAIResultModal.test.js" \
  "src/features/video-ingest/VideoReviewPanel.test.js" \
  "src/features/video-ingest/video-ingest.test.js" \
  "src/features/video-ingest/workspace.test.js"
```

UI 改动文件 ESLint 无错误或警告，`git diff --check` 通过。

## 集成约定与验证边界

- 依赖根代理的 `credentials` store：`apiKey`、`baseUrl`、`hasCredentials`、`storageWarning`、`loadCredentials`、`saveCredentials`、`clearCredentials`、`getCredentialsByProvider`。
- 依赖模型代理提供 `src/services/ai/model.js` 的 `AI_MODEL_KEY` / `AI_PROVIDER` 与固定默认模型。
- 保存配置后的排队恢复由根代理 App 层监听 `sessionRevision` 执行；配置组件没有任务队列耦合。
- 此记录为组件与本地回归验证，不代表生产部署、真实 AI 调用或浏览器会话隔离验收；这些由根代理统一完成。
