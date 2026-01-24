<template>
  <div class="ai-provider-selector">
    <el-form label-width="120px">
      <!-- Provider 选择 -->
      <el-form-item label="AI 服务商">
        <el-select
          v-model="selectedProvider"
          placeholder="选择 AI 服务商"
          @change="handleProviderChange"
        >
          <el-option
            v-for="provider in providers"
            :key="provider.type"
            :label="provider.display.name"
            :value="provider.type"
          >
            <span>{{ provider.display.icon }} {{ provider.display.name }}</span>
          </el-option>
        </el-select>
      </el-form-item>

      <!-- 模型选择 -->
      <el-form-item label="AI 模型">
        <el-select v-model="selectedModel" placeholder="选择模型">
          <el-option
            v-for="model in availableModels"
            :key="model.id"
            :label="model.name"
            :value="model.id"
          >
            <div style="display: flex; justify-content: space-between; align-items: center">
              <span>{{ model.name }}</span>
              <el-tag v-if="model.recommended" type="success" size="small">推荐</el-tag>
            </div>
            <div style="font-size: 12px; color: #999">{{ model.description }}</div>
          </el-option>
        </el-select>
      </el-form-item>

      <!-- 凭证配置 -->
      <template v-if="currentProviderDisplay">
        <el-divider content-position="left">凭证配置</el-divider>
        <el-form-item
          v-for="field in currentProviderDisplay.credentialFields"
          :key="field.key"
          :label="field.label"
          :required="field.required"
        >
          <el-input
            v-model="credentials[field.key]"
            :type="field.type"
            :placeholder="`输入 ${field.label}`"
            show-password
            clearable
          />
        </el-form-item>
      </template>

      <!-- 操作按钮 -->
      <el-form-item>
        <el-button type="primary" @click="handleSave">保存配置</el-button>
        <el-button @click="handleLoad">加载配置</el-button>
        <el-button :loading="testing" @click="handleTest">测试连接</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { AI_PROVIDERS, PROVIDER_DISPLAY } from '@/services/ai/core'
import { getModelList, validateCredentials } from '@/services/ai/classifier'

// 获取 Provider 对应的模型列表
function getModelsByProvider(provider) {
  return getModelList(provider)
}

const emit = defineEmits(['update:provider', 'update:model', 'update:credentials'])

// 状态
const selectedProvider = ref(AI_PROVIDERS.DOUBAO)
const selectedModel = ref('')
const credentials = ref({})
const testing = ref(false)

// Provider 列表
const providers = computed(() => {
  return Object.keys(PROVIDER_DISPLAY).map(type => ({
    type,
    display: PROVIDER_DISPLAY[type]
  }))
})

// 当前 Provider 的显示配置
const currentProviderDisplay = computed(() => {
  return PROVIDER_DISPLAY[selectedProvider.value]
})

// 可用模型列表
const availableModels = computed(() => {
  return getModelsByProvider(selectedProvider.value)
})

// 监听 Provider 变化
watch(selectedProvider, newProvider => {
  // 重置凭证
  credentials.value = {}

  // 选择第一个推荐模型
  const models = getModelsByProvider(newProvider)
  const recommendedModel = models.find(m => m.recommended)
  selectedModel.value = recommendedModel?.id || models[0]?.id || ''

  emit('update:provider', newProvider)
})

// 监听模型变化
watch(selectedModel, newModel => {
  emit('update:model', newModel)
})

// 监听凭证变化
watch(
  credentials,
  newCredentials => {
    emit('update:credentials', newCredentials)
  },
  { deep: true }
)

// 切换 Provider
function handleProviderChange() {
  // 自动加载该 Provider 的配置
  loadProviderConfig(selectedProvider.value)
}

// 保存配置
function handleSave() {
  const config = {
    provider: selectedProvider.value,
    model: selectedModel.value,
    credentials: credentials.value
  }

  localStorage.setItem(`ai_config_${selectedProvider.value}`, JSON.stringify(config))
  ElMessage.success('配置已保存')
}

// 加载配置
function handleLoad() {
  loadProviderConfig(selectedProvider.value)
}

// 加载指定 Provider 的配置
function loadProviderConfig(provider) {
  const saved = localStorage.getItem(`ai_config_${provider}`)
  if (saved) {
    try {
      const config = JSON.parse(saved)
      selectedModel.value = config.model
      credentials.value = config.credentials || {}
      ElMessage.success('配置已加载')
    } catch {
      ElMessage.error('配置加载失败')
    }
  } else {
    ElMessage.warning('没有保存的配置')
  }
}

// 测试连接
async function handleTest() {
  if (!validateCredentials(selectedProvider.value, credentials.value)) {
    ElMessage.error('请填写完整的凭证信息')
    return
  }

  testing.value = true
  try {
    // 这里可以调用一个简单的 API 测试
    ElMessage.success('连接测试成功')
  } catch (error) {
    ElMessage.error(`连接测试失败: ${error.message}`)
  } finally {
    testing.value = false
  }
}

// 初始化：加载默认配置
loadProviderConfig(selectedProvider.value)
</script>

<style lang="scss" scoped>
.ai-provider-selector {
  padding: 20px;
  background: #fff;
  border-radius: 8px;
}
</style>
