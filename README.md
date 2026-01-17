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

### 🤖 AI 智能助手

- **多 AI Provider 支持** - 支持 Cloudflare Workers AI 和豆包 AI（字节跳动）
- **AI 图片分析** - 智能图片分析和分类
- **自动分类** - 自动识别图片类型并推荐分类（Desktop/Mobile/Avatar）
- **智能命名** - AI 生成 2 个中文文件名建议
- **关键词提取** - 自动提取图片关键词和描述
- **诗意标题** - 生成 8-15 字的诗意中文标题
- **分类匹配度** - 显示分类是否完美匹配
- **新分类建议** - AI 可建议新的分类（如新 IP、明星等）
- **分类逻辑说明** - 展示 AI 的分类决策逻辑
- **批量处理** - 支持批量上传图片并自动分析
- **多种模板** - 支持"分类+文件名"、"仅文件名"和自定义提示词
- **实时进度** - 显示分析进度和当前处理状态
- **结果预览** - 分析结果卡片展示，支持复制路径和全部信息

### 📁 分类管理

- **三级分类** - Desktop / Mobile / Avatar
- **树形结构** - 支持一级和二级分类
- **新建分类** - 可写权限用户可创建分类

### 🖼️ 图片上传

- **拖拽上传** - 支持拖拽文件和文件夹
- **批量上传** - 支持多文件同时上传
- **多目录上传** - 单次上传支持不同文件指定不同目标目录
- **系列标识** - 不同系列文件显示颜色边框和图标标识
- **重复检测** - 基于内容 Hash 检测重复上传
- **实时预览** - 上传前图片预览和信息展示
- **进度显示** - 圆形进度条显示上传状态
- **失败重试** - 上传失败文件支持一键重试

### ⚡ 工作流集成

- **一键触发** - 触发图片处理工作流
- **状态监控** - 实时显示工作流运行状态（运行中按钮变橙色）
- **失败提示** - 工作流失败时显示详情链接
- **版本回滚** - 管理员可回滚到上一版本

### 📊 统计与历史

- **壁纸统计** - 显示各分类壁纸总数和增量
- **系列图例** - 统计栏显示系列颜色标识
- **发布历史** - 查看历史发布记录、趋势图和发布者
- **上传历史** - 本地上传记录查看

### 🎨 UI/UX

- **毛玻璃设计** - 现代化暗色主题
- **渐变配色** - 紫色渐变主题色
- **响应式布局** - 适配不同屏幕尺寸
- **流畅动画** - GSAP 驱动的过渡动画

## 🛠️ 技术栈

| 类别 | 技术                                     |
| ---- | ---------------------------------------- |
| 框架 | Vue 3 + Composition API                  |
| 构建 | Vite 7                                   |
| UI   | Element Plus                             |
| 状态 | Pinia                                    |
| 动画 | GSAP                                     |
| 样式 | SCSS + CSS Variables                     |
| AI   | Cloudflare Workers AI + 豆包 AI (Doubao) |
| 规范 | ESLint + Prettier + Husky                |

## 🚀 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build

# 代码检查
pnpm lint

# 代码格式化
pnpm format
```

## 📁 项目结构

```
src/
├── components/          # 公共组件
│   ├── ai/              # AI 助手组件
│   │   ├── AIAssistantPanel.vue
│   │   ├── AIProviderSelector.vue  # AI Provider 选择器
│   │   ├── CredentialsConfig.vue
│   │   ├── PromptTemplateSelector.vue
│   │   └── ResultCard.vue
│   ├── upload/          # 上传相关组件
│   │   ├── CategorySidebar.vue
│   │   ├── UploadPanel.vue          # 主上传面板（已重构）
│   │   ├── UploadPanel/             # 上传面板子组件
│   │   │   ├── UploadHeader.vue     # 头部区域（模式切换、AI配置）
│   │   │   ├── UploadDropzone.vue   # 拖拽上传区域
│   │   │   ├── UploadFileGrid.vue   # 文件网格容器
│   │   │   ├── UploadFileItem.vue   # 单个文件卡片
│   │   │   ├── upload-tooltip.scss  # AI tooltip 样式
│   │   │   └── README.md            # 组件结构说明
│   │   ├── ImagePreview.vue
│   │   ├── WorkflowPanel.vue
│   │   ├── WallpaperStatsBar.vue
│   │   ├── UploadProgressModal.vue  # 上传进度弹窗
│   │   └── ReleaseHistoryModal.vue
│   ├── GlassCard.vue    # 毛玻璃卡片
│   └── MainLayout.vue   # 主布局
├── composables/         # 组合式函数
│   ├── useAnimation.js
│   └── useErrorHandler.js
├── config/              # 配置文件
│   ├── categories.js    # 分类配置
│   └── subcategories.js # 子分类配置
├── router/              # 路由配置
├── services/            # API 服务
│   ├── ai/              # AI 服务模块（已重构）
│   │   ├── core/        # 核心功能
│   │   │   ├── providers/           # AI Provider 实现
│   │   │   │   ├── base-provider.js      # Provider 基类
│   │   │   │   ├── cloudflare-provider.js # Cloudflare AI
│   │   │   │   ├── doubao-provider.js    # 豆包 AI
│   │   │   │   └── index.js              # Provider 工厂
│   │   │   ├── image-processor.js   # 图片压缩处理
│   │   │   └── index.js             # 核心功能导出
│   │   ├── classifier/  # 分类服务
│   │   │   ├── service.js           # 分类分析服务
│   │   │   ├── prompts.js           # 提示词模板
│   │   │   ├── config.js            # 模型配置
│   │   │   └── index.js
│   │   ├── assistant/   # AI 助手服务
│   │   │   ├── service.js
│   │   │   ├── prompts.js
│   │   │   ├── config.js
│   │   │   └── index.js
│   │   └── index.js     # AI 服务统一导出
│   ├── github.js        # GitHub API 封装
│   ├── gistStorage.js   # Gist 存储服务
│   └── localStorage.js  # 本地存储服务
├── stores/              # Pinia 状态管理
│   ├── ai.js            # AI 分析状态
│   ├── ai-classifier.js # AI 分类器状态
│   ├── ai-assistant.js  # AI 助手状态
│   ├── auth.js          # 认证状态
│   ├── config.js        # 配置状态
│   ├── credentials.js   # 凭证管理
│   ├── upload.js        # 上传状态
│   ├── workflow.js      # 工作流状态
│   └── history.js       # 历史记录
├── styles/              # 全局样式
│   ├── index.scss       # 全局样式入口
│   └── variables.scss   # SCSS 变量
├── utils/               # 工具函数
│   ├── errorHandler.js  # 错误处理
│   └── ...
└── views/               # 页面视图
    ├── LoginView.vue
    ├── CallbackView.vue
    ├── UploadView.vue
    ├── AIAssistantView.vue
    ├── AITestSimple.vue
    ├── HistoryView.vue
    └── SettingsView.vue
```

## 🔧 配置说明

### 环境变量

```env
VITE_GITHUB_CLIENT_ID=your_client_id
VITE_OAUTH_WORKER_URL=https://your-worker.workers.dev
VITE_DOUBAO_API_KEY=your_doubao_api_key  # 可选，豆包 AI API Key
```

### AI 配置

支持两种 AI Provider：

#### Cloudflare Workers AI

在 AI 助手页面配置：

- **Account ID** - Cloudflare Account ID
- **API Token** - Cloudflare API Token
- **Worker URL** - AI Proxy Worker URL

#### 豆包 AI（推荐）

- **API Key** - 从环境变量 `VITE_DOUBAO_API_KEY` 读取，或在页面手动配置
- **模型选择** - 支持 Doubao Seed 1.6 Vision 和 1.8 版本

### 默认配置

| 配置项      | 默认值                                     |
| ----------- | ------------------------------------------ |
| 图床仓库    | `IT-NuanxinPro/nuanXinProPic`              |
| 工作流仓库  | `IT-NuanxinPro/wallpaper-gallery-workflow` |
| 分支        | `main`                                     |
| AI Provider | `豆包 AI`                                  |
| AI 模型     | `doubao-1.6` (Doubao Seed 1.6 Vision)      |

## 🤖 AI 功能说明

### 支持的 AI Provider

#### 豆包 AI（推荐）

- **Doubao Seed 1.6 Vision** - 默认推荐，速度快、准确度高
- **Doubao Seed 1.8** - 最新版本，性能更强

#### Cloudflare Workers AI

- **Llama 3.2 11B Vision** - 速度中等、准确度高

### 提示词模板

- **分类 + 文件名** - 同时生成分类和文件名建议（默认）
- **仅文件名** - 只生成文件名，不进行分类
- **自定义** - 使用自定义提示词

### 分类规则

根据选择的壁纸类型（Desktop/Mobile/Avatar），AI 会自动使用对应的专用提示词：

- **Desktop** - 适用于桌面壁纸，包含人像、动漫、插画、风景等决策树
- **Mobile** - 适用于手机壁纸，包含人像、动漫、插画等决策树
- **Avatar** - 适用于头像图片，包含 IP 形象、人像、萌宠、表情包等决策树

### 文件名生成

- AI 生成 **2 个不同风格的中文文件名**
- 每个文件名 8-15 个汉字
- 结构：修饰形容词 + 主体 + 场景或动作 + .jpg
- 示例：`阳光下奔跑的治愈系柴犬.jpg`、`身穿黑色长裙的卷发港风少女.jpg`
- 支持一键复制和选择

### AI 输出字段

- **分类信息** - secondary（二级分类）、third（三级分类）
- **文件名** - 2 个中文文件名建议
- **诗意标题** - 8-15 字的高雅标题
- **关键词** - 3-5 个精准中文词
- **描述** - 20-40 字优美描述
- **匹配度** - 是否完美匹配现有分类
- **新分类建议** - 如果是新 IP/明星，AI 会建议新分类
- **分类逻辑** - 说明 AI 的决策过程

## 🔒 权限说明

| 权限级别 | 说明                | 功能                 |
| -------- | ------------------- | -------------------- |
| 管理员   | 仓库 Owner          | 全部功能 + 回滚      |
| 可写     | Collaborator (push) | 上传 + 新建分类 + AI |
| 只读     | Collaborator (pull) | 仅浏览               |
| 无权限   | 无仓库访问权限      | 无法使用             |

## 📝 本地存储

| Key                  | 用途                 | 过期策略            |
| -------------------- | -------------------- | ------------------- |
| `auth_token`         | GitHub Token         | 手动登出清除        |
| `uploaded_hashes`    | 上传文件 Hash        | 30 天 / 最多 500 条 |
| `upload_history`     | 上传历史记录         | 手动清除            |
| `ai_credentials_enc` | AI 凭证（加密）      | 手动清除            |
| `doubao_api_key_enc` | 豆包 API Key（加密） | 手动清除            |

## 📄 License

MIT
