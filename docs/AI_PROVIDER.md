# AI 服务架构

图片上传、视频封面分析和 AI 工坊共用当前标签页选择的远程模型。内部 provider 标识 sub2api 仅保留协议兼容性，请求 model 是远程列表原始 ID。

## 目录与职责

```text
src/services/ai/
├── model.js                     # 协议标识与模型ID校验
├── session-credentials.js       # 当前标签页凭据缓存与地址校验
├── task-runner.js               # 图片任务执行、重试和等待配置
├── task-storage.js              # IndexedDB 任务记录，不保存凭据
├── classifier/
│   ├── service.js               # 图片分析与批量分析
│   ├── prompts.js               # desktop/mobile/avatar 分类提示词
│   ├── config.js                # 默认提示词和图片参数
│   └── index.js
└── core/
    ├── image-processor.js       # 图片压缩
    ├── providers/
    │   ├── base-provider.js
    │   ├── openai-compatible-provider.js
    │   └── index.js             # OpenAI兼容协议工厂
    └── index.js
```

## 调用路径

- 图片上传：`stores/upload.js` → 上传文件生命周期服务 → `stores/ai-tasks.js` → `task-runner.js` → `classifier/service.js` → Provider。
- 视频分析：`features/video-ingest/review-service.js` → `classifier/service.js` → Provider。
- AI 工坊：`stores/ai.js` 使用 classifier 的提示词和模型配置，直接调用同一 Provider。

## 图片队列与结果审核

添加图片后统一计算内容哈希并复用已有 AI 元数据；没有结果的图片进入持久分析队列。未配置 Key 时任务保持等待，填写配置后继续，刷新可恢复。排队任务执行时使用当前完整会话快照；历史已完成模型记录保留。

新图片必须完成 AI 分析并具备目标分类才能上传。分析后的描述、文件名和分类仍可人工修正，修正结果用于上传元数据及后续缓存。上传服务不再根据文件名生成未分析的替代元数据。

## 会话与安全边界

`stores/credentials.js` 统一提供当前标签页的 Key、API 地址、所选模型、模型列表和取消信号。Key 只存当前页面内存及当前标签页的 `sessionStorage`，不读取构建密钥，也不写入任务、GitHub 或长期缓存。

Provider 优先使用当前会话地址，默认地址来自公开配置。清除或修改凭据会中止旧请求；队列不会写入旧会话结果，后续请求读取新配置。HTTP 和网络异常仅返回本地安全提示，响应只提取业务字段，并屏蔽嵌套字段名和值中的 Key 回显。

## 模型发现

remote-models.js 使用当前草稿 Key 读取 baseUrl/models，验证 data 数组并只保留合法去重 id。配置页显式触发获取；修改 Key/地址立即取消旧请求并清空草稿列表，迟到响应不能覆盖。saveCredentials 原子保存 Key/地址/model/models，只允许列表中的模型；selectModel 会取消旧会话请求。旧仅Key会话可恢复但需重新获取选择模型。

Provider 使用当前凭据快照中的 model，默认不强制 temperature、reasoning_effort 等模型专有参数。任务记录与视频AI元数据记录实际使用的模型 ID。失败消息不输出远程正文或 Key。
