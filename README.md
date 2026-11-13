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

- **远程模型选择** - 从 OpenAI 兼容接口获取模型，图片上传、视频分析与 AI 工坊共享当前会话选择
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
- **统一 AI 流程** - 自动分析分类，审核结果和目录可在上传前校正
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

| 类别 | 技术                            |
| ---- | ------------------------------- |
| 框架 | Vue 3 + Composition API         |
| 构建 | Vite 7                          |
| UI   | Element Plus                    |
| 状态 | Pinia                           |
| 动画 | GSAP                            |
| 样式 | SCSS + CSS Variables            |
| AI   | OpenAI 兼容接口（远程模型列表） |
| 规范 | ESLint + Prettier + Husky       |

## 🚀 快速开始

> **Fork 本项目？** 请先阅读 [自托管部署指南](./docs/self-hosting.md)，了解如何配置自己的图床仓库、GitHub OAuth 和 AI API Key。

> **上传页分类怎么自定义？** 上传页、AI 分析和分类预览共用远端分类：合并 manifest 预设与实际目录，新建目录会自动成为候选。请参考 [自托管部署指南](./docs/self-hosting.md#第七步配置远端-manifest) 和示例文件 [upload-workspace.manifest.example.json](./docs/examples/upload-workspace.manifest.example.json)。

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
# 编辑 .env.local 配置公开服务地址；API Key 在工作台设置页手动填写

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
│   ├── video/              # 视频任务与上传控制服务
│   └── ai-proxy.js          # 历史代理，当前AI入口不再使用
├── src/
│   ├── components/
│   │   ├── ai/              # AI 相关组件
│   │   │   ├── AIAssistantPanel.vue      # AI 工坊主面板
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
│   │   │   │   │   ├── openai-compatible-provider.js # OpenAI兼容网关
│   │   │   │   │   └── index.js                # Provider 工厂
│   │   │   │   ├── image-processor.js          # 图片压缩处理
│   │   │   │   └── index.js
│   │   │   ├── classifier/  # 分类服务与提示词（上传、视频和工坊共用）
│   │   │   │   ├── service.js   # analyzeImage / analyzeBatch
│   │   │   │   ├── prompts.js   # 分类决策树提示词（desktop/mobile/avatar）
│   │   │   │   ├── config.js    # 视觉分类通用配置
│   │   │   │   └── index.js
│   │   │   ├── model.js          # 远程模型标识校验
│   │   │   ├── session-credentials.js # 当前标签页凭据缓存
│   │   │   ├── task-runner.js    # 图片分析队列与恢复
│   │   │   └── task-storage.js   # AI 任务持久化
│   │   ├── github.js        # GitHub API 封装
│   │   └── localStorage.js  # 本地存储服务
│   ├── stores/
│   │   ├── ai.js            # AI 分析状态（统一 store）
│   │   ├── auth.js          # 认证状态
│   │   ├── config.js        # 仓库配置状态
│   │   ├── credentials.js   # 标签页临时 AI 配置
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
│   │   └── previewManager.js # 预览 URL 生命周期管理
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

## 🔧 AI 配置

打开「设置 → AI 配置」，填写 API 地址和自己的 API Key，点击「获取模型」，从可搜索列表选择支持图片输入的模型，再保存到当前标签页。图片上传、视频封面分析与 AI 工坊共用所选模型。

- 刷新当前标签页可以恢复；新建、复制标签页和关闭后重新打开需要重新填写。
- Key仅存于Pinia内存和当前标签页sessionStorage；不会写入localStorage、上传任务或服务端。
- 清除或更换Key、地址、模型会取消旧会话中的AI请求，后续任务只读取新配置。
- 浏览器会话缓存仍属于页面可访问的数据，不等于系统密钥保险库；点击「清除配置」可立即移除。

构建环境只放公开配置，不配置任何AI Key：

```env
VITE_SUB2API_BASE_URL=https://api.061129.xyz/v1
VITE_VIDEO_API_URL=https://your-video-worker.workers.dev
```

本地开发可将公开地址设置为 `/sub2api/v1`，通过 `SUB2API_PROXY_TARGET` 指定网关。Key仍在设置页输入。上线后执行 `pnpm check:client-secrets` 检查构建产物不包含已配置的旧AI密钥。

模型标识来自当前网关的 `GET /models`，不再写死。图片上传、视频分析和 AI 工坊共用当前选择；图片在完成分析后可修改分类与元数据，再确认上传。无 Key 时图片保留在分析队列中，填写当前标签页配置后继续。

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

## 🔒 权限说明

| 权限级别 | 说明                | 可用功能                  |
| -------- | ------------------- | ------------------------- |
| 管理员   | 仓库 Owner          | 全部功能 + 版本回滚       |
| 可写     | Collaborator (push) | 上传 + 新建分类 + AI 分析 |
| 只读     | Collaborator (pull) | 仅浏览                    |
| 无权限   | 无仓库访问权限      | 无法使用                  |

## 📝 本地存储

| Key                    | 用途                               | 过期策略                            |
| ---------------------- | ---------------------------------- | ----------------------------------- |
| `auth_token`           | GitHub Token                       | 手动登出清除                        |
| `uploaded_hashes`      | 上传文件 Hash（去重）              | 30 天 / 最多 500 条                 |
| `upload_history`       | 上传历史记录                       | 手动清除                            |
| `studio_ai_session_v1` | 当前标签页AI配置（sessionStorage） | 同标签刷新恢复；新标签/关闭重开清除 |

## 📄 License

MIT

### 首次使用

先使用 GitHub OAuth 或 Token 登录，再从自动加载的可访问仓库列表中搜索选择壁纸数据仓库。默认分支来自 GitHub；选择后再次检查访问权限，成功才进入工作台。已有配置可显式继续上次仓库。

工作流仓库、网站仓库和视频服务在「设置 → 仓库连接」按需填写，留空则对应能力不可用。更换数据仓库会清空依附旧仓库的服务连接，防止误发到其他目标。OAuth 配置属于部署级连接，使用 Token 登录可以不配置 OAuth。源码不再回退到作者的工作流或网站仓库。

API 地址支持 HTTP、HTTPS 和同源路径。HTTPS 页面访问远端 HTTP 仍可能受浏览器混合内容限制；需要通过同源代理或 HTTP 部署连接。模型列表只说明可访问的模型，不保证视觉能力。
