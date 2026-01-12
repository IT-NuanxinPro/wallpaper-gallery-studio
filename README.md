# 壁纸上传管理系统

<p align="center">
  <img src="public/favicon.svg" width="80" height="80" alt="Logo">
</p>

<p align="center">
  一个现代化的壁纸上传管理后台，支持 GitHub OAuth 登录和图片分类管理。
</p>

## ✨ 功能特性

- 🔐 **双重登录方式** - 支持 GitHub Token 和 OAuth 登录
- 📁 **分类管理** - 按分类浏览和上传壁纸
- 🖼️ **拖拽上传** - 支持拖拽和点击上传图片
- 📊 **上传历史** - 查看和管理上传记录
- 🎨 **毛玻璃 UI** - 现代化暗色主题设计
- ⚡ **工作流触发** - 一键触发图片处理工作流

## 🛠️ 技术栈

- **Vue 3** - 渐进式 JavaScript 框架
- **Vite 7** - 下一代前端构建工具
- **Element Plus** - Vue 3 组件库
- **Pinia** - Vue 状态管理
- **GSAP** - 动画库
- **SCSS** - CSS 预处理器

## 🚀 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build
```

## 📝 配置

### GitHub OAuth（可选）

如需启用 OAuth 登录，需要：

1. 创建 GitHub OAuth App
2. 部署 Cloudflare Worker 用于 token 交换
3. 配置环境变量

## 📄 License

MIT
