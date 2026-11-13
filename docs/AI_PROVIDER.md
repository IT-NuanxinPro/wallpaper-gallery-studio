# AI 服务架构

图片上传、视频分析和 AI 工坊统一使用 GPT-6.1 Sol。模型标识由 `src/services/ai/model.js` 定义：provider 为 `sub2api`，modelKey 为 `sub2api-gpt-6.1-sol`，请求 model 为 `gpt-6.1-sol`。Provider 工厂只开放这一项。

## 目录与职责

```text
src/services/ai/
├── model.js                     # 固定模型标识
├── session-credentials.js       # 当前标签页凭据缓存与地址校验
├── task-runner.js               # 图片任务执行、重试和等待配置
├── task-storage.js              # IndexedDB 任务记录，不保存凭据
├── classifier/
│   ├── service.js               # 图片分析与批量分析
│   ├── prompts.js               # desktop/mobile/avatar 分类提示词
│   ├── config.js                # 模型参数、默认提示词和图片参数
│   └── index.js
└── core/
    ├── image-processor.js       # 图片压缩
    ├── providers/
    │   ├── base-provider.js
    │   ├── openai-compatible-provider.js
    │   └── index.js             # 固定 Provider 工厂
    └── index.js
```

## 调用路径

- 图片上传：`stores/upload.js` → 上传文件生命周期服务 → `stores/ai-tasks.js` → `task-runner.js` → `classifier/service.js` → Provider。
- 视频分析：`features/video-ingest/review-service.js` → `classifier/service.js` → Provider。
- AI 工坊：`stores/ai.js` 使用 classifier 的提示词和模型配置，直接调用同一 Provider。

## 图片队列与结果审核

添加图片后统一计算内容哈希并复用已有 AI 元数据；没有结果的图片进入持久分析队列。未配置 Key 时任务保持等待，填写配置后继续，刷新可恢复。旧模型的待处理任务迁移到当前模型，已完成结果保留。

新图片必须完成 AI 分析并具备目标分类才能上传。分析后的描述、文件名和分类仍可人工修正，修正结果用于上传元数据及后续缓存。上传服务不再根据文件名生成未分析的替代元数据。

## 会话与安全边界

`stores/credentials.js` 统一提供当前标签页的 Key、API 地址和取消信号。Key 只存当前页面内存及当前标签页的 `sessionStorage`，不读取构建密钥，也不写入任务、GitHub 或长期缓存。

Provider 优先使用当前会话地址，默认地址来自公开配置。清除或修改凭据会中止旧请求；队列不会写入旧会话结果，后续请求读取新配置。HTTP 和网络异常仅返回本地安全提示，响应只提取业务字段，并屏蔽嵌套字段名和值中的 Key 回显。
