# Wallpaper Gallery · Studio

<p align="center">
  <img src="public/favicon.svg" width="80" height="80" alt="Logo">
</p>

<p align="center">
  一个现代化的壁纸上传管理后台，支持 GitHub OAuth 登录、AI 智能分类、图片管理和工作流自动化。
</p>

## ✨ 功能特性

### 🔐 认证与权限

- **GitHub OAuth 登录** - 安全的 OAuth 认证
- **Token 登录** - 支持 Personal Access Token
- **权限分级** - 管理员 / 可写 / 只读 / 无权限
- **权限标签显示** - 导航栏实时显示当前权限

### 🤖 AI 智能分类

- **多 AI Provider** - 智谱 GLM（推荐）、Groq、Cloudflare Workers AI
- **自动分类** - 上传图片后自动识别类型并推荐三级分类
- **智能命名** - AI 生成 2 个中文文件名建议（8-15 汉字）
- **关键词提取** - 自动提取图片关键词和描述
- **诗意标题** - 生成 8-15 字的诗意中文标题
- **分类匹配度** - 显示分类是否完美匹配现有体系
- **新分类建议** - AI 可建议新的分类（如新 IP、明星等）
- **分类逻辑说明** - 展示 AI 的分类决策链
- **批量处理** - 支持批量上传并并发分析（最多 3 并发）
- **多种提示词模板** - 分类+文件名、仅文件名、自定义

### 📁 分类管理

- **三级分类体系** - Desktop / Mobile / Avatar 三个系列
- **树形结构** - 支持一级和二级分类
- **新建分类** - 可写权限用户可创建分类

### 🖼️ 图片上传

- **拖拽上传** - 支持拖拽文件和文件夹
- **批量上传** - 支持多文件同时上传，超 50 张显示预计时间
- **多目录上传** - 单次上传支持不同文件指定不同目标目录
- **AI 模式 / 手动模式** - 可切换 AI 自动分类或手动选择分类
- **重复检测** - 基于内容 Hash 检测重复上传（30 天 / 最多 500 条）
- **大图压缩** - 超过 20MB 自动压缩，支持 8K 分辨率
- **实时预览** - 上传前图片预览和信息展示
- **进度显示** - 圆形进度条显示上传状态
- **失败重试** - 上传失败文件支持一键重试

### ⚡ 工作流集成

- **一键触发** - 触发图片处理工作流
- **状态监控** - 实时显示工作流运行状态
- **版本回滚** - 管理员可回滚到上一版本

### 📊 统计与历史

- **壁纸统计** - 显示各分类壁纸总数和增量
- **发布历史** - 查看历史发布记录、趋势图和发布者
- **上传历史** - 本地上传记录查看

### 🎨 UI/UX

- **毛玻璃设计** - 现代化暗色主题
- **渐变配色** - 紫色渐变主题色
- **响应式布局** - 适配不同屏幕尺寸
- **流畅动画** - GSAP 驱动的过渡动画

## 🛠️ 技术栈

| 类别 | 技术                                    |
| ---- | --------------------------------------- |
| 框架 | Vue 3 + Composition API                 |
| 构建 | Vite 7                                  |
| UI   | Element Plus                            |
| 状态 | Pinia                                   |
| 动画 | GSAP                                    |
| 样式 | SCSS + CSS Variables                    |
| AI   | 智谱 GLM / Groq / Cloudflare Workers AI |
| 规范 | ESLint + Prettier + Husky               |

## 🚀 快速开始

> **Fork 本项目？** 请先阅读 [自托管部署指南](./docs/self-hosting.md)，了解如何配置自己的图床仓库、GitHub OAuth 和 AI API Key。

> **上传页分类怎么自定义？** 当前上传页优先读取目标仓库中的远端 manifest。请参考 [自托管部署指南](./docs/self-hosting.md#第七步配置远端-manifest) 和示例文件 [upload-workspace.manifest.example.json](./docs/examples/upload-workspace.manifest.example.json)。

> **配置原则**：优先使用环境变量、运行时设置页配置和目标仓库中的远端 manifest；不建议 fork 后直接改源码里的默认值。

### 前置要求

- Node.js >= 18
- pnpm >= 8

### 本地开发

```bash
# 1. 克隆仓库
git clone https://github.com/your-org/wallpaper-gallery-studio.git
cd wallpaper-gallery-studio

# 2. 安装依赖
pnpm install

# 3. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，填入你的 API Key

# 4. 启动开发服务器
pnpm dev
```

### 常用命令

```bash
pnpm dev      # 启动开发服务器
pnpm build    # 构建生产版本
pnpm lint     # 代码检查
pnpm format   # 代码格式化
```

## 📁 项目结构

```
wallpaper-gallery-studio/
├── public/                  # 静态资源
│   └── hash-worker.js       # Web Worker（文件 Hash 计算）
├── worker/
│   └── ai-proxy.js          # Cloudflare Worker（Cloudflare AI 代理）
├── src/
│   ├── components/
│   │   ├── ai/              # AI 相关组件
│   │   │   ├── AIAssistantPanel.vue      # AI 工坊主面板
│   │   │   ├── AIProviderSelector.vue    # Provider 选择器
│   │   │   ├── CredentialsConfig.vue     # 凭证配置
│   │   │   ├── PromptTemplateSelector.vue
│   │   │   └── ResultCard.vue            # 分析结果卡片
│   │   ├── upload/          # 上传相关组件
│   │   │   ├── UploadPanel.vue           # 主上传面板
│   │   │   ├── UploadPanel/              # 上传面板子组件
│   │   │   │   ├── UploadHeader.vue      # 头部（模式切换、AI 配置）
│   │   │   │   ├── UploadDropzone.vue    # 拖拽上传区域
│   │   │   │   ├── UploadFileGrid.vue    # 文件网格容器
│   │   │   │   └── UploadFileItem.vue    # 单个文件卡片
│   │   │   ├── CategorySidebar.vue       # 分类侧边栏
│   │   │   ├── WorkflowPanel.vue         # 工作流面板
│   │   │   ├── WallpaperStatsBar.vue     # 壁纸统计栏
│   │   │   ├── UploadProgressModal.vue   # 上传进度弹窗
│   │   │   └── ReleaseHistoryModal.vue   # 发布历史弹窗
│   │   ├── common/
│   │   │   ├── AnimatedNumber.vue        # 数字动画组件
│   │   │   └── CustomSelect.vue          # 自定义下拉框
│   │   ├── GlassCard.vue
│   │   ├── GradientBackground.vue
│   │   ├── MainLayout.vue
│   │   ├── Toast.vue
│   │   └── ConfirmDialog.vue
│   ├── composables/
│   │   └── useAnimation.js
│   ├── config/
│   │   ├── categories.js    # 一级 / 二级分类配置
│   │   ├── subcategories.js # 三级分类配置
│   │   └── oauth.js         # OAuth 配置
│   ├── router/              # 路由配置
│   ├── services/
│   │   ├── ai/
│   │   │   ├── core/        # AI 核心层（共享）
│   │   │   │   ├── providers/
│   │   │   │   │   ├── base-provider.js        # Provider 基类
│   │   │   │   │   ├── cloudflare-provider.js  # Cloudflare Workers AI
│   │   │   │   │   ├── groq-provider.js        # Groq AI
│   │   │   │   │   ├── zhipu-provider.js       # 智谱 GLM
│   │   │   │   │   └── index.js                # Provider 工厂
│   │   │   │   ├── image-processor.js          # 图片压缩处理
│   │   │   │   └── index.js
│   │   │   ├── classifier/  # 分类服务（上传页面使用）
│   │   │   │   ├── service.js   # analyzeImage / analyzeBatch
│   │   │   │   ├── prompts.js   # 分类决策树提示词（desktop/mobile/avatar）
│   │   │   │   ├── config.js    # 模型列表 + CLASSIFIER_CONFIG + ASSISTANT_CONFIG
│   │   │   │   └── index.js
│   │   │   ├── assistant/   # AI 助手服务（AI 工坊页面使用）
│   │   │   │   ├── service.js   # sendMessage / analyzeImage
│   │   │   │   ├── prompts.js   # 对话式系统提示词
│   │   │   │   ├── config.js    # 从 classifier/config 重新导出
│   │   │   │   └── index.js
│   │   │   └── index.js     # 统一导出
│   │   ├── github.js        # GitHub API 封装
│   │   └── localStorage.js  # 本地存储服务
│   ├── stores/
│   │   ├── ai.js            # AI 分析状态（统一 store）
│   │   ├── auth.js          # 认证状态
│   │   ├── config.js        # 仓库配置状态
│   │   ├── credentials.js   # 多 Provider 凭证管理
│   │   ├── upload.js        # 上传状态 + AI 自动分析
│   │   ├── workflow.js      # 工作流状态
│   │   └── history.js       # 上传历史记录
│   ├── styles/
│   │   ├── index.scss
│   │   ├── variables.scss
│   │   └── element-dark.scss
│   ├── utils/
│   │   ├── debounce.js
│   │   ├── errorHandler.js
│   │   ├── hashWorker.js    # Web Worker 封装（文件 Hash）
│   │   ├── image-detector.js # 图片类型自动检测
│   │   ├── imageCompressor.js
│   │   ├── previewManager.js # 预览 URL 生命周期管理
│   │   └── rateLimiter.js   # API 速率限制器
│   ├── views/
│   │   ├── LoginView.vue
│   │   ├── CallbackView.vue
│   │   ├── UploadView.vue
│   │   ├── AIAssistantView.vue
│   │   ├── HistoryView.vue
│   │   └── SettingsView.vue
│   ├── App.vue
│   └── main.js
├── .env.example             # 环境变量示例
├── vite.config.js
└── package.json
```

## 🔧 环境变量配置

复制 `.env.example` 为 `.env.local` 并填入你的值：

```env
# Cloudflare Workers AI（可选）
VITE_CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
VITE_CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
VITE_WORKER_URL=https://your-worker.your-subdomain.workers.dev

# 智谱 GLM（推荐，免费视觉模型）
# 获取地址：https://open.bigmodel.cn/usercenter/apikeys
VITE_ZHIPU_API_KEY=your_zhipu_api_key

# Groq AI（备选，速度极快但免费层限流）
# 获取地址：https://console.groq.com/keys
VITE_GROQ_API_KEY=your_groq_api_key
```

## 🤖 AI Provider 说明

模型列表统一在 `src/services/ai/classifier/config.js` 中维护，classifier 和 assistant 两个服务共享同一份配置。默认使用**智谱 GLM** 免费层（无限流），其次 Groq，最后 Cloudflare。

### 智谱 GLM（推荐，免费）

- 智谱 BigModel 平台 GLM-4V 视觉模型，免费层无限流，OpenAI 兼容协议且支持 CORS
- 推荐模型：**GLM-4V Flash**（直接回答、速度快）、**GLM-4.1V Thinking Flash**（带推理、分析更深入）
- 获取 Key：[open.bigmodel.cn/usercenter/apikeys](https://open.bigmodel.cn/usercenter/apikeys)

### Groq AI（备选）

- 推理速度极快，但免费层限额 8000 TPM（约 1.7 张图/分钟），需串行限速
- 推荐模型：**Qwen3.6 27B Vision**（`qwen/qwen3.6-27b`）
- 获取 Key：[console.groq.com/keys](https://console.groq.com/keys)
- 本地和线上均直连（Groq 官方支持 CORS）

### Cloudflare Workers AI

- 需要部署 `worker/ai-proxy.js` 到 Cloudflare Workers
- 支持模型：Llama 3.2 11B Vision、LLaVA 1.5 7B

### 分类决策树

针对三个系列各有专用提示词（`classifier/prompts.js`）：

| 系列    | 决策树重点                                      |
| ------- | ----------------------------------------------- |
| Desktop | 人像（魅力/国风/氛围感/清新）、动漫、插画、风景 |
| Mobile  | 人像（魅力/日系/清新/氛围感）、动漫、插画       |
| Avatar  | IP 形象、动漫角色、人像、萌宠、表情包、插画     |

## 🚀 部署到 Cloudflare Pages

1. 在 Cloudflare Pages 创建项目，连接 GitHub 仓库
2. 构建配置：
   - 构建命令：`pnpm build`
   - 输出目录：`dist`
3. 在 Settings → Environment variables 添加环境变量（参考上方配置）
4. 推送代码，自动触发部署

### Cloudflare Worker 部署（仅 Cloudflare AI 需要）

```bash
npm install -g wrangler
wrangler login
wrangler deploy worker/ai-proxy.js --name ai-proxy --compatibility-date 2026-03-17
```

部署后将 Worker URL 填入 `VITE_WORKER_URL` 环境变量。

## 🔒 权限说明

| 权限级别 | 说明                | 可用功能                  |
| -------- | ------------------- | ------------------------- |
| 管理员   | 仓库 Owner          | 全部功能 + 版本回滚       |
| 可写     | Collaborator (push) | 上传 + 新建分类 + AI 分析 |
| 只读     | Collaborator (pull) | 仅浏览                    |
| 无权限   | 无仓库访问权限      | 无法使用                  |

## 📝 本地存储

| Key                   | 用途                    | 过期策略            |
| --------------------- | ----------------------- | ------------------- |
| `auth_token`          | GitHub Token            | 手动登出清除        |
| `uploaded_hashes`     | 上传文件 Hash（去重）   | 30 天 / 最多 500 条 |
| `upload_history`      | 上传历史记录            | 手动清除            |
| `ai_credentials`      | AI 凭证（AES-GCM 加密） | 手动清除            |
| `ai_current_provider` | 上次选择的 Provider     | 持久                |

## 📄 License

MIT
