<template>
  <GlassCard id="ai-config" :hoverable="false" class="credentials-config">
    <div class="credentials-config__header">
      <h2>AI 配置</h2>
      <el-tag :type="credentialsStore.hasCredentials ? 'success' : 'warning'" size="small">
        {{ credentialsStore.hasCredentials ? '已配置 · 当前标签页' : '未配置' }}
      </el-tag>
    </div>
    <p class="credentials-config__description">
      图片上传、视频分析和 AI 工坊共用此配置。
      当前标签页刷新后保留；新标签页或关闭后重新打开需要重新填写。
    </p>
    <el-collapse-transition>
      <el-alert
        v-if="credentialsStore.storageWarning"
        :title="credentialsStore.storageWarning"
        type="warning"
        :closable="false"
        show-icon
        class="credentials-config__warning"
      />
    </el-collapse-transition>
    <div class="credentials-config__model"><span>分析模型</span><strong>GPT-6.1 Sol</strong></div>
    <el-form label-position="top" @submit.prevent="handleSave">
      <div class="credentials-config__fields">
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
      </div>
      <div class="credentials-config__actions">
        <el-button
          data-testid="save-ai-credentials"
          type="primary"
          native-type="submit"
          :loading="saving"
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
  if (saving.value) return
  if (!apiKey.value.trim() || !baseUrl.value.trim()) {
    ElMessage.warning(!apiKey.value.trim() ? '请输入 API Key' : '请输入 API 地址')
    return
  }
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
.credentials-config {
  scroll-margin-top: 24px;
}
.credentials-config__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}
.credentials-config__header h2 {
  margin: 0;
  color: var(--studio-text, #f3f4f6);
  font-size: 16px;
  font-weight: 600;
}
.credentials-config__description {
  margin: 12px 0 20px;
  color: var(--studio-muted, #a1a6b0);
  line-height: 1.7;
  font-size: 13px;
  max-width: 700px;
}
.credentials-config__model {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--studio-border, #30343b);
  font-size: 13px;
}
.credentials-config__model span {
  color: var(--studio-muted, #a1a6b0);
}
.credentials-config__model strong {
  color: var(--studio-text, #f3f4f6);
  font-weight: 500;
}
.credentials-config__fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.credentials-config__warning {
  margin-bottom: 16px;
}
.credentials-config__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 4px;
}
.credentials-config__actions .el-button + .el-button {
  margin-left: 0;
}
.credentials-config :deep(.el-form-item__label) {
  color: var(--studio-muted, #a1a6b0);
  font-size: 12px;
}
@media (max-width: 700px) {
  .credentials-config__fields {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
