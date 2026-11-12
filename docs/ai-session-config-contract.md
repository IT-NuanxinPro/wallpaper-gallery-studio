# AI会话配置改造

用户已明确要求实施并部署：只保留GPT-6.1 Sol，图片上传、视频分析、AI工坊共享一次手填Key配置；刷新保留，新的标签页和关闭重开不保留。禁止把用户AI Key放构建环境、localStorage、IndexedDB、日志、Git任务或云端存储。

## 固定模型

- provider=`sub2api`，modelKey=`sub2api-gpt-6.1-sol`，model ID=`gpt-6.1-sol`，显示名=`GPT-6.1 Sol`。
- 模型注册/工厂仅保留该provider与该model，不允许旧localStorage选项和旧待处理任务继续调用退役模型。
- 原AI相关VITE\_\*KEY/TOKEN环境值不再参与应用，生产构建要扫描确保没有嵌入；图片/视频已有上传任务数据保持。

## 共用Store接口（主代理实现）

`useCredentialsStore()`返回：

- `apiKey`, `baseUrl`, `hasCredentials`, `loaded`, `loading`, `storageWarning`。
- `defaultProvider='sub2api'`, `credentialsSource='当前标签页'`。
- `availableProviders`：已配置则`[{key:'sub2api',name:'GPT-6.1 Sol',source:'当前标签页'}]`否则空。
- `loadCredentials()`：幂等载入当前页会话。
- `saveCredentials({apiKey,baseUrl})`：校验并保存在Pinia内存+sessionStorage。key不通过参数日志回显。支持旧调用`sub2apiApiKey`作为同字段别名，禁止保存任何其他provider字段。
- `clearCredentials()`：清除当前会话与内存；getCredentialsByProvider随后返回空key，排队任务停止等待。
- `getCredentialsByProvider('sub2api')` -> `{apiKey,baseUrl}`；其他provider返回null。
- `getCredentials()` -> `{apiKey,baseUrl}`，仅供受控本机表单。
- `sub2apiApiKey`, `sub2apiCredentials`兼容映射上述状态（迁移期调用可用）。无isProduction/env/encryption/Cloudflare/GLM/Groq状态。

会话模块`src/services/ai/session-credentials.js`导出`DEFAULT_AI_BASE_URL`与`normalizeAiBaseUrl`：默认`import.meta.env.VITE_SUB2API_BASE_URL || 'https://api.061129.xyz/v1'`，这是公开API地址而非Key；允许HTTPS绝对URL或同源以/起始路径，拒绝含凭据/query/hash、协议相对URL；本机HTTP只允许localhost/127.0.0.1。保存地址以/v1等用户明确base路径结尾，provider拼/chat/completions。

刷新恢复实现：仅当前document的导航类型reload允许读已有sessionStorage配置；fresh navigate/back_forward清旧会话，避免复制标签页或恢复旧标签页携带key；SPA路由切换共用Pinia。存储不可用时保留本次内存、提示刷新会丢失。加载时删除旧localStorage `ai_credentials`和`ai_credentials_encryption_key`；不碰GitHub登录token或任务历史。

## UI分工

- 通用配置在设置页（上传设置现入口通向此页），一个表单：固定模型、API地址（默认已填）、API Key密码输入、保存到当前标签页、清除；说明三个功能共享、刷新保留/新标签需重填。避免把密钥写进URL/可见文本/日志。
- AI工坊只留固定GPT-6.1 Sol，无provider/model选择列表；没key显示去设置引导。
- 图片上传/AI弹窗/视频页只显示固定模型，去掉多模型下拉；无key允许手动编辑/上传但AI按钮不可用且可去配置。
- 所有新开设置链接用同标签路由或明确noopener；不通过query传凭据。

## 文件所有权

- root：credentials.js、session-credentials模块/测试、App启动初始化、生产env清理与部署验收。
- UI代理：SettingsView/CredentialsConfig、AI工坊组件/上传AI弹窗与头部/视频模型UI、对应UI测试。不要改stores/services模型核心。
- 模型代理：classifier/assistant config、core providers工厂与openai provider、ai/upload/ai-tasks stores、task-runner与相应测试。不要改credentials.js及session模块。

不得触碰gallery/workflow/图床生产逻辑。每个代理不commit/push，root测试后统一提交部署。
