# 自托管部署指南

本文档面向 fork 本项目的用户，详细说明从零开始完成部署所需的全部配置步骤。

## 目录

- [前置准备](#前置准备)
- [第一步：准备 GitHub 图床仓库](#第一步准备-github-图床仓库)
- [第二步：配置 GitHub OAuth](#第二步配置-github-oauth)
- [第三步：部署 OAuth Worker](#第三步部署-oauth-worker)
- [第四步：获取 AI API Key](#第四步获取-ai-api-key)
- [第五步：部署到 Cloudflare Pages](#第五步部署到-cloudflare-pages)
- [第六步：修改项目配置](#第六步修改项目配置)
- [第七步：配置远端 Manifest](#第七步配置远端-manifest)
- [本地开发配置](#本地开发配置)
- [常见问题](#常见问题)

---

## 前置准备

- GitHub 账号
- Cloudflare 账号（免费版即可）
- Node.js >= 18 + pnpm

---

## 第一步：准备 GitHub 图床仓库

本项目将图片上传到一个 GitHub 仓库作为图床。你需要创建自己的图床仓库。

### 1.1 创建图床仓库

在 GitHub 创建一个新的**公开仓库**（Public），例如命名为 `my-wallpaper-pics`。

目录结构会由本项目自动创建，无需手动初始化。

### 1.2 推荐的目标仓库目录结构

建议在图床仓库中准备以下结构：

```text
my-wallpaper-pics/
├── config/
│   └── upload-workspace.manifest.json
├── wallpaper/
│   ├── desktop/
│   ├── mobile/
│   └── avatar/
└── metadata-pending/
```

说明：

- `config/upload-workspace.manifest.json` 是上传页运行时读取的远端分类配置
- `wallpaper/` 是默认图片根目录
- `metadata-pending/` 是上传完成后写入待处理 metadata 的默认目录

> 这些目录可以先通过 `.gitkeep` 保留，后续由 Studio 自动写入内容。

---

## 第二步：配置 GitHub OAuth

OAuth 登录用于获取用户的 GitHub Token，从而拥有向图床仓库写入文件的权限。

### 2.1 创建 OAuth App

1. 打开 [GitHub Developer Settings](https://github.com/settings/developers)
2. 点击 **New OAuth App**
3. 填写信息：
   - **Application name**：随意，如 `Wallpaper Studio`
   - **Homepage URL**：你的 Cloudflare Pages 域名，如 `https://your-app.pages.dev`
   - **Authorization callback URL**：`https://your-app.pages.dev/callback`
4. 点击 **Register application**
5. 记录 **Client ID**
6. 点击 **Generate a new client secret**，记录 **Client Secret**

### 2.2 配置 GitHub Client ID

推荐通过环境变量提供 Client ID，而不是修改源码默认值。

在 Cloudflare Pages 或本地 `.env.local` 中添加：

```env
VITE_GITHUB_CLIENT_ID=Ov23liXXXXXXXXXXXXXX
```

如果你没有配置环境变量，也可以在应用的“设置”页中手动填写并保存仓库配置。

---

## 第三步：部署 OAuth Worker

GitHub OAuth 需要用 Client Secret 换取 Token，这一步必须在服务端完成（不能暴露 Secret 到前端）。本项目使用 Cloudflare Worker 完成这个交换。

### 3.1 安装 Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 3.2 创建 OAuth Worker

新建文件 `worker/oauth.js`（可直接参考本仓库示例 `worker/oauth.example.js`），核心逻辑：

```js
export default {
  async fetch(request, env) {
    // 处理 CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      })
    }

    const { code } = await request.json()

    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code
      })
    })

    const data = await response.json()

    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
}
```

### 3.3 部署并配置 Secret

```bash
# 部署 Worker
wrangler deploy worker/oauth.js --name wallpaper-oauth --compatibility-date 2026-03-17

# 设置环境变量（不会暴露到前端）
wrangler secret put GITHUB_CLIENT_ID --name wallpaper-oauth
wrangler secret put GITHUB_CLIENT_SECRET --name wallpaper-oauth
```

部署后得到 Worker URL，如 `https://wallpaper-oauth.your-subdomain.workers.dev`。

### 3.4 配置 OAuth Worker URL

在 Cloudflare Pages 环境变量中添加（见第五步）：

```
VITE_OAUTH_WORKER_URL=https://wallpaper-oauth.your-subdomain.workers.dev
```

---

## 第四步：获取 AI API Key

至少配置一个 AI Provider，推荐 智谱 GLM 或 Groq（均免费）。

### 智谱 GLM（推荐，免费）

1. 注册 [open.bigmodel.cn](https://open.bigmodel.cn)
2. 进入 **用户中心 → API Keys**
3. 创建新 Key，复制保存

### Groq AI（备选，速度极快但免费层限流）

1. 注册 [console.groq.com](https://console.groq.com)
2. 进入 **API Keys → Create API Key**
3. 复制保存

### Cloudflare Workers AI（可选）

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 **Workers & Pages → Overview**，记录 **Account ID**
3. 进入 **My Profile → API Tokens → Create Token**
4. 选择 **Workers AI** 权限模板，创建并复制 Token
5. 部署 `worker/ai-proxy.js`（用于解决 CORS）：

```bash
wrangler deploy worker/ai-proxy.js --name ai-proxy --compatibility-date 2026-03-17
```

---

## 第五步：部署到 Cloudflare Pages

### 5.1 创建 Pages 项目

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 **Workers & Pages → Create → Pages**
3. 选择 **Connect to Git**，授权并选择你 fork 的仓库
4. 构建配置：
   - **Framework preset**：`Vue`
   - **Build command**：`pnpm build`
   - **Build output directory**：`dist`

### 5.2 配置环境变量

在 **Settings → Environment variables** 中添加以下变量：

| 变量名                       | 说明                           | 必填              |
| ---------------------------- | ------------------------------ | ----------------- |
| `VITE_OAUTH_WORKER_URL`      | OAuth Worker URL（第三步获取） | ✅                |
| `VITE_ZHIPU_API_KEY`         | 智谱 GLM API Key               | 至少填一个 AI Key |
| `VITE_GROQ_API_KEY`          | Groq API Key                   | 至少填一个 AI Key |
| `VITE_CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID          | 使用 CF AI 时必填 |
| `VITE_CLOUDFLARE_API_TOKEN`  | Cloudflare API Token           | 使用 CF AI 时必填 |
| `VITE_WORKER_URL`            | AI Proxy Worker URL            | 使用 CF AI 时必填 |

### 5.3 触发部署

保存环境变量后，在 **Deployments** 页面点击 **Retry deployment**，或推送一次代码触发自动部署。

---

## 第六步：修改项目配置

当前版本推荐的配置优先级：

1. 环境变量
2. 设置页面中的运行时配置
3. 目标仓库中的远端 manifest
4. 代码中的默认占位配置

不建议 fork 后继续通过修改源码默认值来完成自托管。

### 6.1 更新 OAuth Callback URL

部署完成后，你会得到一个 Pages 域名（如 `https://your-app.pages.dev`）。

回到 GitHub OAuth App 设置，将 **Authorization callback URL** 更新为：

```
https://your-app.pages.dev/callback
```

如果你绑定了自定义域名，也要同步更新。

### 6.2 检查 src/config/oauth.js

```js
// src/config/oauth.js
export const OAUTH_CONFIG = {
  // 确保 redirectUri 与 GitHub OAuth App 中配置的一致
  redirectUri: `${window.location.origin}/callback`
}
```

通常无需修改，`window.location.origin` 会自动适配当前域名。

### 6.3 首次运行时配置

首次登录后，建议进入“设置”页确认以下字段：

- 仓库 Owner
- 仓库 Repo
- 默认分支
- GitHub Client ID

这些配置会保存在浏览器本地，无需继续修改源码。

---

## 第七步：配置远端 Manifest

从当前版本开始，上传页优先读取**目标仓库中的远端 manifest**，而不是依赖前端源码里的静态分类文件。

### 7.1 复制示例文件

将项目中的示例文件复制到你的图床仓库：

- 源文件：`docs/examples/upload-workspace.manifest.example.json`
- 目标路径：`config/upload-workspace.manifest.json`

如果你保留这个默认路径，当前代码无需额外修改。

### 7.2 最小结构

```json
{
  "version": 1,
  "updatedAt": "2026-04-04T00:00:00.000Z",
  "categories": {
    "desktop": [
      {
        "key": "anime",
        "label": "动漫",
        "children": [{ "key": "eva", "label": "EVA" }]
      }
    ],
    "mobile": [],
    "avatar": []
  }
}
```

### 7.3 校验规则

manifest 至少需要满足：

- 顶层必须有 `categories`
- `categories.desktop`、`categories.mobile`、`categories.avatar` 必须是数组
- 每个分类项必须有 `label`
- `children` 如果存在，必须是数组，且子项同样必须有 `label`

如果结构非法，系统会抛出 `MANIFEST_INVALID` 类错误，并回退到兼容模式。

### 7.4 Manifest 影响范围

这份文件会影响：

- 上传页左侧分类树
- 上传页目标目录选择弹窗
- 编辑 AI 结果弹窗中的分类选项
- AI 分类提示词里的二级 / 三级分类候选项

### 7.5 首次自托管建议顺序

建议按以下顺序准备：

1. 先把 `config/upload-workspace.manifest.json` 提交到目标仓库
2. 再创建 `wallpaper/desktop`、`wallpaper/mobile`、`wallpaper/avatar`
3. 再创建 `metadata-pending/`
4. 最后登录 Studio 验证分类树、目标选择和上传

这样可以避免首次启动时因为 manifest 缺失而进入兼容回退模式。

---

## 本地开发配置

### 创建 .env.local

```bash
cp .env.example .env.local
```

编辑 `.env.local`，填入你自己的值：

```env
# OAuth Worker（本地开发也需要，否则无法登录）
VITE_OAUTH_WORKER_URL=https://wallpaper-oauth.your-subdomain.workers.dev

# AI Provider（至少填一个）
VITE_ZHIPU_API_KEY=your_zhipu_api_key
VITE_GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Cloudflare AI（可选）
VITE_CLOUDFLARE_ACCOUNT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_CLOUDFLARE_API_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_WORKER_URL=https://ai-proxy.your-subdomain.workers.dev
```

### 启动开发服务器

```bash
pnpm install
pnpm dev
```

> 智谱 GLM 与 Groq 均支持浏览器直连（CORS），本地开发无需额外代理。

### 本地登录说明

GitHub OAuth 的 callback URL 必须与 OAuth App 中配置的完全一致。本地开发时需要在 GitHub OAuth App 中额外添加一条：

```
http://localhost:5173/callback
```

### 本地验证远端 Manifest

建议在本地开发时额外验证一次：

1. 修改目标仓库里的 `config/upload-workspace.manifest.json`
2. 打开上传页
3. 点击“刷新目录”
4. 确认左侧分类树和目标目录选择已同步更新

---

## 常见问题

### Q: 登录后跳转失败 / callback 报错

检查 GitHub OAuth App 中的 **Authorization callback URL** 是否与当前访问域名完全一致（包括协议和端口）。

### Q: 上传图片提示"权限不足"

确认登录的 GitHub 账号对图床仓库有 **write** 权限（Owner 或 Collaborator）。

### Q: AI 分析一直失败

1. 检查对应 Provider 的 API Key 是否正确填写
2. 检查 Key 是否已过期或超出免费额度
3. 打开浏览器控制台查看具体错误信息

### Q: 想换一个图床仓库

优先在“设置”页中修改仓库 Owner / Repo / Branch。配置会保存在浏览器本地。

如果你希望部署后所有用户默认看到同一套仓库配置，建议通过初始化环境或首次引导流程处理，而不是重新写死源码默认值。

### Q: 为什么我改了 `src/config/categories.js`，上传页分类没有变化？

因为当前上传页优先读取**目标仓库中的远端 manifest**。如果你的图床仓库里存在：

```text
config/upload-workspace.manifest.json
```

那么它会覆盖本地静态分类配置。

### Q: 远端 manifest 放在哪里？

默认路径是：

```text
config/upload-workspace.manifest.json
```

### Q: manifest 配错了会怎样？

如果 manifest 结构非法，系统会报 `MANIFEST_INVALID` 并回退到兼容模式。建议直接从：

`docs/examples/upload-workspace.manifest.example.json`

复制一份再改。

### Q: 想添加新的 AI Provider

参考 `src/services/ai/core/providers/` 目录下任意一个 Provider 实现，继承 `BaseAIProvider`，然后在 `index.js` 中注册，在 `classifier/config.js` 中添加模型配置即可。详见 [AI Provider 架构文档](./AI_PROVIDER.md)。
