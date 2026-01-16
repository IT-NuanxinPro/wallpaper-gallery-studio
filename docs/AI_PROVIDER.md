# AI Provider 架构设计文档

## 概述

本文档描述了壁纸管理系统中 AI 服务的架构设计，支持多个 AI 服务商（Cloudflare Workers AI、豆包 AI 等）的集成。

## 设计目标

1. **可扩展性**：轻松添加新的 AI 服务商
2. **配置化**：通过配置文件管理模型和服务商
3. **解耦**：组件之间低耦合，易于维护
4. **统一接口**：不同 Provider 提供一致的调用方式

## 架构图

```
┌─────────────────────────────────────────────────────────┐
│                     UI Layer                             │
│  ┌──────────────────┐  ┌──────────────────────────┐    │
│  │ AIAssistantPanel │  │ AIProviderSelector       │    │
│  └──────────────────┘  └──────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   Service Layer                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │           ai-classifier.js                        │  │
│  │  (统一的分类服务接口)                              │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                  Provider Layer                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │         AIProviderFactory                         │  │
│  │  (Provider 工厂，创建具体实例)                     │  │
│  └──────────────────────────────────────────────────┘  │
│                            │                             │
│         ┌──────────────────┼──────────────────┐         │
│         ▼                  ▼                  ▼         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ Cloudflare  │  │   Doubao    │  │   Future    │    │
│  │  Provider   │  │  Provider   │  │  Provider   │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                  Config Layer                            │
│  ┌──────────────────────────────────────────────────┐  │
│  │           ai-models.js                            │  │
│  │  (模型配置、Provider 配置)                         │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 核心组件

### 1. BaseAIProvider (基类)

**位置**: `src/services/ai-providers/base-provider.js`

**职责**:

- 定义统一的 Provider 接口
- 提供基础方法（analyze、validateCredentials）

**接口**:

```javascript
class BaseAIProvider {
  async analyze({ imageBase64, prompt, credentials })
  validateCredentials(credentials)
  getName()
}
```

### 2. 具体 Provider 实现

#### CloudflareProvider

**位置**: `src/services/ai-providers/cloudflare-provider.js`

**特点**:

- 调用 Cloudflare Workers AI API
- 支持 Llama 3.2 Vision 模型
- 需要 Account ID 和 API Token

#### DoubaoProvider

**位置**: `src/services/ai-providers/doubao-provider.js`

**特点**:

- 调用豆包 AI API
- 支持 Doubao Seed 1.6/1.8 模型
- 需要 API Key

### 3. AIProviderFactory (工厂)

**位置**: `src/services/ai-providers/index.js`

**职责**:

- 根据类型创建 Provider 实例
- 管理 Provider 注册
- 提供 Provider 列表

**使用示例**:

```javascript
const provider = AIProviderFactory.create('doubao', config)
const result = await provider.analyze({ imageBase64, prompt, credentials })
```

### 4. AI 分类服务

**位置**: `src/services/ai-classifier.js`

**职责**:

- 提供统一的图片分析接口
- 调用具体的 Provider
- 处理结果格式化

**API**:

```javascript
analyzeImage({ file, prompt, providerType, credentials, modelId })
analyzeBatch({ files, prompt, providerType, credentials, modelId, onProgress })
validateCredentials(providerType, credentials)
```

### 5. 配置管理

**位置**: `src/config/ai-models.js`

**内容**:

- AI_PROVIDERS: Provider 类型常量
- AI_MODELS: 所有模型配置
- PROVIDER_DISPLAY: Provider 显示配置
- 工具函数: getModelsByProvider、getModelById 等

**模型配置示例**:

```javascript
{
  id: 'doubao-seed-1-6-vision-250815',
  name: 'Doubao Seed 1.6 Vision',
  provider: 'doubao',
  description: '豆包视觉模型 1.6 版本',
  maxTokens: 4096,
  recommended: true
}
```

### 6. UI 组件

#### AIProviderSelector

**位置**: `src/components/ai/AIProviderSelector.vue`

**功能**:

- Provider 选择
- 模型选择
- 凭证配置
- 配置保存/加载
- 连接测试

## 使用流程

### 1. 配置 AI Provider

```vue
<template>
  <AIProviderSelector
    @update:provider="handleProviderChange"
    @update:model="handleModelChange"
    @update:credentials="handleCredentialsChange"
  />
</template>

<script setup>
import AIProviderSelector from '@/components/ai/AIProviderSelector.vue'

function handleProviderChange(provider) {
  console.log('Provider changed:', provider)
}

function handleModelChange(model) {
  console.log('Model changed:', model)
}

function handleCredentialsChange(credentials) {
  console.log('Credentials changed:', credentials)
}
</script>
```

### 2. 调用 AI 分析

```javascript
import { analyzeImage } from '@/services/ai-classifier'
import { buildPrompt } from '@/utils/prompt-builder'

// 分析单张图片
const result = await analyzeImage({
  file: imageFile,
  prompt: buildPrompt('desktop'),
  providerType: 'doubao',
  credentials: {
    apiKey: 'your-api-key'
  },
  modelId: 'doubao-seed-1-6-vision-250815'
})

console.log(result.filenameSuggestions)
console.log(result.category)
console.log(result.keywords)
```

### 3. 批量分析

```javascript
import { analyzeBatch } from '@/services/ai-classifier'

const results = await analyzeBatch({
  files: [file1, file2, file3],
  prompt: buildPrompt('mobile'),
  providerType: 'cloudflare',
  credentials: {
    accountId: 'your-account-id',
    apiToken: 'your-token'
  },
  modelId: '@cf/meta/llama-3.2-11b-vision-instruct',
  onProgress: (current, total) => {
    console.log(`Progress: ${current}/${total}`)
  }
})
```

## 添加新 Provider

### 步骤 1: 创建 Provider 类

```javascript
// src/services/ai-providers/new-provider.js
import { BaseAIProvider } from './base-provider'

export class NewProvider extends BaseAIProvider {
  validateCredentials(credentials) {
    return !!credentials?.apiKey
  }

  async analyze({ imageBase64, prompt, credentials }) {
    // 实现 API 调用逻辑
    const response = await fetch('https://api.example.com/analyze', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.apiKey}`
      },
      body: JSON.stringify({ image: imageBase64, prompt })
    })

    const data = await response.json()
    return this.parseResponse(data)
  }

  parseResponse(data) {
    // 解析响应，返回统一格式
    return {
      secondary: data.category,
      third: data.subcategory,
      keywords: data.tags,
      filename: data.suggestedName,
      description: data.description,
      raw: data
    }
  }
}
```

### 步骤 2: 注册 Provider

```javascript
// src/services/ai-providers/index.js
import { NewProvider } from './new-provider'

AIProviderFactory.register('newprovider', NewProvider)
```

### 步骤 3: 添加配置

```javascript
// src/config/ai-models.js
export const AI_PROVIDERS = {
  // ...
  NEW_PROVIDER: 'newprovider'
}

export const AI_MODELS = {
  // ...
  newprovider: [
    {
      id: 'model-v1',
      name: 'New Provider Model V1',
      provider: 'newprovider',
      description: '描述',
      recommended: true
    }
  ]
}

export const PROVIDER_DISPLAY = {
  // ...
  newprovider: {
    name: 'New Provider',
    icon: '🆕',
    color: '#FF6B6B',
    credentialFields: [{ key: 'apiKey', label: 'API Key', type: 'password', required: true }]
  }
}
```

## 配置存储

### LocalStorage 结构

```javascript
// 每个 Provider 独立存储
localStorage.setItem(
  'ai_config_cloudflare',
  JSON.stringify({
    provider: 'cloudflare',
    model: '@cf/meta/llama-3.2-11b-vision-instruct',
    credentials: {
      accountId: 'xxx',
      apiToken: 'xxx'
    }
  })
)

localStorage.setItem(
  'ai_config_doubao',
  JSON.stringify({
    provider: 'doubao',
    model: 'doubao-seed-1-6-vision-250815',
    credentials: {
      apiKey: 'xxx'
    }
  })
)
```

## 优势

1. **低耦合**: 各层职责清晰，互不依赖
2. **易扩展**: 添加新 Provider 只需 3 步
3. **配置化**: 模型和 Provider 通过配置管理
4. **统一接口**: 上层代码无需关心具体 Provider
5. **易测试**: 每个 Provider 可独立测试
6. **易维护**: 代码结构清晰，便于定位问题

## 未来扩展

1. **更多 Provider**: OpenAI、Google Gemini、百度文心等
2. **模型对比**: 同时调用多个模型，对比结果
3. **缓存机制**: 缓存分析结果，避免重复调用
4. **错误重试**: 自动重试失败的请求
5. **性能监控**: 记录各 Provider 的响应时间和成功率
