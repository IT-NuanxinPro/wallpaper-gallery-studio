# AI Provider 架构文档

## 概述

AI 服务层采用 Provider 模式，支持多个 AI 服务商的统一接入。所有 Provider 实现相同的接口，上层业务代码无需关心具体使用哪个服务商。

## 目录结构

```
src/services/ai/
├── core/                        # 核心层（共享）
│   ├── providers/
│   │   ├── base-provider.js     # Provider 基类，定义统一接口
│   │   ├── zhipu-provider.js     # 智谱 GLM
│   │   ├── groq-provider.js
│   │   ├── cloudflare-provider.js
│   │   └── index.js             # AIProviderFactory + AI_PROVIDERS + PROVIDER_DISPLAY
│   ├── image-processor.js       # 图片压缩（compressImage）
│   └── index.js
├── classifier/                  # 分类服务（上传页面）
│   ├── service.js               # analyzeImage / analyzeBatch
│   ├── prompts.js               # 分类决策树提示词
│   ├── config.js                # 模型列表 + CLASSIFIER_CONFIG + ASSISTANT_CONFIG
│   └── index.js
├── assistant/                   # AI 助手服务（AI 工坊页面）
│   ├── service.js               # sendMessage / analyzeImage
│   ├── prompts.js               # 对话式系统提示词
│   ├── config.js                # 从 classifier/config 重新导出（共享模型列表）
│   └── index.js
└── index.js                     # 统一导出
```

## 架构图

```
┌─────────────────────────────────────────────────┐
│                   UI Layer                       │
│   UploadPanel / AIAssistantPanel                 │
└─────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│                 Store Layer                      │
│   stores/ai.js  /  stores/upload.js             │
└─────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│               Service Layer                      │
│   classifier/service.js  assistant/service.js   │
└─────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│              Provider Layer                      │
│          AIProviderFactory.create()              │
│                      │                           │
│   ┌──────────┬───────┴──────┬──────────────┐    │
│   │  Zhipu   │     Groq     │  Cloudflare  │    │
│   │Provider  │   Provider   │   Provider   │    │
│   └──────────┴──────────────┴──────────────┘    │
└─────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│               Config Layer                       │
│         classifier/config.js                     │
│   CLASSIFIER_MODELS / CLASSIFIER_CONFIG          │
│   ASSISTANT_CONFIG（共享，从此处导出）            │
└─────────────────────────────────────────────────┘
```

## 当前支持的 Provider

| Provider   | 常量                      | 特点                                | CORS             |
| ---------- | ------------------------- | ----------------------------------- | ---------------- |
| 智谱 GLM   | `AI_PROVIDERS.ZHIPU`      | 免费层无限流，国内稳定，OpenAI 兼容 | 支持直连（CORS） |
| Groq       | `AI_PROVIDERS.GROQ`       | 速度极快，但免费层限额 8000 TPM     | 支持直连         |
| Cloudflare | `AI_PROVIDERS.CLOUDFLARE` | 需要 Worker 代理                    | 需要 Worker      |

## 模型配置

所有模型统一在 `src/services/ai/classifier/config.js` 的 `CLASSIFIER_MODELS` 中维护，`assistant/config.js` 直接从这里重新导出，两个服务共享同一份模型列表。

```js
export const CLASSIFIER_MODELS = {
  'zhipu-glm-4v-flash': {
    id: 'glm-4v-flash',
    name: 'GLM-4V Flash (免费)',
    provider: AI_PROVIDERS.ZHIPU,
    speed: 'fast',
    accuracy: 'high',
    cost: 'low',
    maxTokens: 1024,
    temperature: 0.7,
    recommended: true
  }
  // ...
}
```

## 添加新 Provider

### 1. 创建 Provider 类

```js
// src/services/ai/core/providers/my-provider.js
import { BaseAIProvider } from './base-provider'

export class MyProvider extends BaseAIProvider {
  constructor(config = {}) {
    super(config)
    this.baseUrl = 'https://api.example.com/v1'
  }

  validateCredentials(credentials) {
    return !!credentials?.apiKey
  }

  async analyze({ imageBase64, prompt, credentials }) {
    const { apiKey, model } = credentials
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
      })
    })
    const data = await response.json()
    return this.parseResponse(data)
  }

  parseResponse(data) {
    const text = data.choices?.[0]?.message?.content || ''
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}')
    return {
      secondary: json.secondary || '通用',
      third: json.third || '通用',
      keywords: json.keywords || [],
      filenameSuggestions: json.filenames || [],
      description: json.description || '',
      confidence: 0.9,
      displayTitle: json.displayTitle || null,
      is_perfect_match: json.is_perfect_match ?? null,
      new_category_proposal: json.new_category_proposal || null,
      reasoning: json.reasoning || null,
      raw: data
    }
  }
}
```

### 2. 注册到工厂

在 `src/services/ai/core/providers/index.js` 中：

```js
import { MyProvider } from './my-provider'

export const AI_PROVIDERS = {
  // ...existing...
  MY_PROVIDER: 'myprovider'
}

export const PROVIDER_DISPLAY = {
  // ...existing...
  myprovider: { name: 'My Provider', icon: '🆕', disabled: false }
}

// 在 AIProviderFactory.create() switch 中添加：
case AI_PROVIDERS.MY_PROVIDER:
  return new MyProvider(config)
```

### 3. 添加模型配置

在 `src/services/ai/classifier/config.js` 的 `CLASSIFIER_MODELS` 中添加：

```js
'myprovider-model-v1': {
  id: 'model-v1',
  name: 'My Model V1',
  provider: AI_PROVIDERS.MY_PROVIDER,
  description: '描述',
  speed: 'fast',
  accuracy: 'high',
  cost: 'low',
  maxTokens: 2048,
  temperature: 0.2,
  recommended: false
}
```

### 4. 添加凭证支持

在 `src/stores/credentials.js` 中参照 `groqApiKey` 的方式添加凭证字段、`hasXxxEnvCredentials` computed、`xxxCredentials` computed，并在 `getCredentialsByProvider` 中添加对应分支。

## 提示词说明

两个服务的提示词职责不同，不共享：

| 文件                    | 用途                                                                         |
| ----------------------- | ---------------------------------------------------------------------------- |
| `classifier/prompts.js` | 分类决策树，针对 desktop/mobile/avatar 三个系列各有专用提示词，输出严格 JSON |
| `assistant/prompts.js`  | 对话式系统提示词，支持 default/creative/technical 三种角色风格               |
