<template>
  <GlassCard id="ai-config" :hoverable="false" class="credentials-config">
    <div class="credentials-config__header">
      <h2>AI 共用配置</h2>
      <el-tag :type="credentialsStore.hasCredentials ? 'success' : 'warning'" size="small">
        {{ credentialsStore.hasCredentials ? '已配置 · 当前标签页' : '未配置' }}
      </el-tag>
    </div>
    <p class="credentials-config__description">
      图片上传、视频分析和 AI 工坊共用此配置，模型固定为 GPT-6.1 Sol。
      当前标签页刷新后保留；新标签页或关闭后重新打开需要重新填写。
    </p>
    <el-alert
      v-if="credentialsStore.storageWarning"
      :title="credentialsStore.storageWarning"
      type="warning"
      :closable="false"
      show-icon
      class="credentials-config__warning"
    />
    <el-form label-position="top" @submit.prevent="handleSave">
      <el-form-item label="API 地址" required>
        <el-input
          v-model="baseUrl"
          aria-label="API 地址"
          placeholder="https://api.example.com/v1"
          autocomplete="off"
          :disabled="saving"
        />
      </el-form-item>
      <el-form-item label="API Key" required>
        <el-input
          v-model="apiKey"
          aria-label="API Key"
          type="password"
          placeholder="输入 API Key，仅用于当前标签页"
          autocomplete="off"
          :disabled="saving"
          clearable
        />
      </el-form-item>
      <div class="credentials-config__actions">
        <el-button
          data-testid="save-ai-credentials"
          type="primary"
          native-type="submit"
          :loading="saving"
          :disabled="!apiKey.trim() || !baseUrl.trim()"
          >保存到当前标签页</el-button
        >
        <el-button
          data-testid="clear-ai-credentials"
          :disabled="saving || (!credentialsStore.hasCredentials && !apiKey)"
          @click="handleClear"
          >清除</el-button
        >
      </div>
    </el-form>
  </GlassCard>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import GlassCard from '@/components/GlassCard.vue'
import { useCredentialsStore } from '@/stores/credentials'

const credentialsStore = useCredentialsStore()
const baseUrl = ref(credentialsStore.baseUrl || '')
const apiKey = ref('')
const saving = ref(false)

async function handleSave() {
  if (saving.value || !apiKey.value.trim() || !baseUrl.value.trim()) return
  saving.value = true
  try {
    await credentialsStore.saveCredentials({ apiKey: apiKey.value, baseUrl: baseUrl.value })
    baseUrl.value = credentialsStore.baseUrl
    ElMessage.success('AI 配置已保存到当前标签页')
  } catch (error) {
    ElMessage.error(error.message || '配置保存失败')
  } finally {
    saving.value = false
  }
}

function handleClear() {
  credentialsStore.clearCredentials()
  apiKey.value = ''
  baseUrl.value = credentialsStore.baseUrl
  ElMessage.success('当前标签页的 AI 配置已清除')
}

function syncForm() {
  baseUrl.value = credentialsStore.baseUrl
  apiKey.value = credentialsStore.apiKey
}

watch(() => credentialsStore.sessionRevision, syncForm)

onMounted(async () => {
  await credentialsStore.loadCredentials()
  syncForm()
})
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.credentials-config {
  scroll-margin-top: 24px;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: $spacing-3;

    h2 {
      margin: 0;
      font-size: $font-size-lg;
      color: $white;
    }
  }

  &__description {
    margin: $spacing-4 0 $spacing-5;
    color: $gray-300;
    line-height: 1.7;
    font-size: $font-size-sm;
  }

  &__warning {
    margin-bottom: $spacing-4;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-3;

    .el-button + .el-button {
      margin-left: 0;
    }
  }

  :deep(.el-form-item__label) {
    color: $gray-300;
  }
}
</style>
