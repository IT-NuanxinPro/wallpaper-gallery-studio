<template>
  <GlassCard id="ai-config" :hoverable="false" class="credentials-config">
    <div class="credentials-config__header">
      <h2>AI 配置</h2>
      <el-tag :type="credentialsStore.hasModelReady ? 'success' : 'warning'" size="small">{{
        configurationStatus
      }}</el-tag>
    </div>
    <p class="credentials-config__description">
      图片上传、视频分析和 AI
      工坊共用此配置。当前标签页刷新后保留；新标签页或关闭后重新打开需要重新填写。
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
      <div class="credentials-config__model-heading">
        <span>分析模型</span>
        <el-button
          data-testid="fetch-ai-models"
          native-type="button"
          :loading="modelsLoading"
          :disabled="saving"
          @click="loadModels"
          >{{ modelsFetched ? '刷新模型列表' : '获取模型' }}</el-button
        >
      </div>
      <el-form-item class="credentials-config__model-field">
        <el-select
          v-model="selectedModel"
          aria-label="分析模型"
          filterable
          :disabled="modelsLoading || saving || !models.length"
          :placeholder="
            modelsLoading
              ? '正在获取模型...'
              : models.length
                ? '搜索并选择模型'
                : '请先获取模型列表'
          "
          no-match-text="没有匹配的模型"
          no-data-text="没有返回可用模型"
        >
          <el-option v-for="model in models" :key="model.id" :label="model.id" :value="model.id" />
        </el-select>
        <p class="credentials-config__model-hint">
          请选择支持图片输入的模型。模型列表不保证图片能力。
        </p>
        <p
          v-if="modelsFetched && !modelsError"
          class="credentials-config__model-hint"
          aria-live="polite"
        >
          {{
            models.length
              ? `已获取 ${models.length} 个模型`
              : '没有返回可用模型，请检查地址或权限后重试。'
          }}
        </p>
      </el-form-item>
      <Transition name="studio-feedback">
        <el-alert
          v-if="modelsError"
          :title="modelsError"
          type="error"
          :closable="false"
          show-icon
          class="credentials-config__warning"
        />
      </Transition>
      <div class="credentials-config__actions">
        <el-button
          data-testid="save-ai-credentials"
          type="primary"
          native-type="submit"
          :loading="saving"
          :disabled="modelsLoading"
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import GlassCard from '@/components/GlassCard.vue'
import { useCredentialsStore } from '@/stores/credentials'
import { fetchRemoteModels } from '@/services/ai/remote-models'

const credentialsStore = useCredentialsStore()
const baseUrl = ref(credentialsStore.baseUrl || '')
const apiKey = ref('')
const selectedModel = ref('')
const models = ref([])
const modelsLoading = ref(false)
const modelsFetched = ref(false)
const modelsError = ref('')
const saving = ref(false)
let fetchController
let requestGeneration = 0
let syncingForm = false

const configurationStatus = computed(() =>
  credentialsStore.hasModelReady
    ? '已配置 · 当前标签页'
    : credentialsStore.hasCredentials
      ? '未选择模型'
      : '未配置 API Key'
)

function cancelModelFetch() {
  requestGeneration += 1
  fetchController?.abort()
  fetchController = undefined
  modelsLoading.value = false
}

function clearDraftModels() {
  cancelModelFetch()
  models.value = []
  selectedModel.value = ''
  modelsFetched.value = false
  modelsError.value = ''
}

watch(
  [baseUrl, apiKey],
  () => {
    if (!syncingForm) clearDraftModels()
  },
  { flush: 'sync' }
)

async function loadModels() {
  if (modelsLoading.value || saving.value) return
  if (!apiKey.value.trim() || !baseUrl.value.trim()) {
    ElMessage.warning(!apiKey.value.trim() ? '请输入 API Key' : '请输入 API 地址')
    return
  }
  cancelModelFetch()
  const generation = requestGeneration
  const controller = new globalThis.AbortController()
  fetchController = controller
  const previousModel = selectedModel.value
  const previouslyFetched = modelsFetched.value
  modelsLoading.value = true
  modelsError.value = ''
  try {
    const result = await fetchRemoteModels({
      apiKey: apiKey.value.trim(),
      baseUrl: baseUrl.value.trim(),
      signal: controller.signal
    })
    if (generation !== requestGeneration || controller.signal.aborted) return
    models.value = result.map(({ id }) => ({ id }))
    selectedModel.value = result.some(model => model.id === previousModel)
      ? previousModel
      : !previouslyFetched && result.length === 1
        ? result[0].id
        : ''
    modelsFetched.value = true
  } catch (error) {
    if (generation !== requestGeneration || controller.signal.aborted) return
    modelsError.value = error.message || '模型列表获取失败，请重试'
  } finally {
    if (generation === requestGeneration) {
      modelsLoading.value = false
      fetchController = undefined
    }
  }
}

async function handleSave() {
  if (saving.value || modelsLoading.value) return
  if (!apiKey.value.trim() || !baseUrl.value.trim()) {
    ElMessage.warning(!apiKey.value.trim() ? '请输入 API Key' : '请输入 API 地址')
    return
  }
  if (!modelsFetched.value || !models.value.length) {
    ElMessage.warning('请先获取可用模型列表')
    return
  }
  if (!selectedModel.value || !models.value.some(model => model.id === selectedModel.value)) {
    ElMessage.warning('请选择分析模型')
    return
  }
  saving.value = true
  try {
    await credentialsStore.saveCredentials({
      apiKey: apiKey.value,
      baseUrl: baseUrl.value,
      model: selectedModel.value,
      models: models.value.map(({ id }) => ({ id }))
    })
    syncForm()
    ElMessage.success('AI 配置已保存到当前标签页')
  } catch (error) {
    ElMessage.error(error.message || '配置保存失败')
  } finally {
    saving.value = false
  }
}

function handleClear() {
  clearDraftModels()
  credentialsStore.clearCredentials()
  syncForm()
  ElMessage.success('当前标签页的 AI 配置已清除')
}

function syncForm() {
  cancelModelFetch()
  syncingForm = true
  try {
    baseUrl.value = credentialsStore.baseUrl
    apiKey.value = credentialsStore.apiKey
    models.value = (credentialsStore.models || []).map(({ id }) => ({ id }))
    selectedModel.value = credentialsStore.selectedModel || ''
    modelsFetched.value = models.value.length > 0
    modelsError.value = ''
  } finally {
    syncingForm = false
  }
}

watch(() => credentialsStore.sessionRevision, syncForm)
onMounted(async () => {
  await credentialsStore.loadCredentials()
  syncForm()
})
onBeforeUnmount(cancelModelFetch)
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
.credentials-config__model-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--studio-text);
}
.credentials-config__model-field :deep(.el-form-item__content) {
  display: block;
}
.credentials-config__model-field :deep(.el-select) {
  width: 100%;
}
.credentials-config__model-hint {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--studio-muted);
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
