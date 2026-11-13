<template>
  <el-form class="repository-config" label-position="top" :disabled="busy" @submit.prevent="submit">
    <div class="repository-config__primary">
      <el-form-item label="仓库所有者" required>
        <el-input
          :model-value="modelValue.owner || ''"
          aria-label="仓库所有者"
          placeholder="GitHub 用户名或组织名"
          autocomplete="off"
          @update:model-value="update('owner', $event)"
        />
      </el-form-item>
      <el-form-item label="仓库名称" required>
        <el-input
          :model-value="modelValue.repo || ''"
          aria-label="仓库名称"
          placeholder="保存壁纸和视频的仓库"
          autocomplete="off"
          @update:model-value="update('repo', $event)"
        />
      </el-form-item>
      <el-form-item label="默认分支" required>
        <el-input
          :model-value="modelValue.branch || ''"
          aria-label="默认分支"
          placeholder="main"
          autocomplete="off"
          @update:model-value="update('branch', $event)"
        />
      </el-form-item>
    </div>
    <el-collapse v-model="expanded" class="repository-config__advanced">
      <el-collapse-item name="workflow" title="工作流与网站 · 选填">
        <p class="repository-config__hint">按需连接工作流仓库和网站仓库。未配置的功能保持关闭。</p>
        <div class="repository-config__pair">
          <el-form-item label="工作流仓库所有者"
            ><el-input
              :model-value="modelValue.workflowOwner || ''"
              aria-label="工作流仓库所有者"
              placeholder="用户名或组织名"
              @update:model-value="update('workflowOwner', $event)"
          /></el-form-item>
          <el-form-item label="工作流仓库名称"
            ><el-input
              :model-value="modelValue.workflowRepo || ''"
              aria-label="工作流仓库名称"
              placeholder="工作流仓库"
              @update:model-value="update('workflowRepo', $event)"
          /></el-form-item>
          <el-form-item label="网站仓库所有者"
            ><el-input
              :model-value="modelValue.frontendOwner || ''"
              aria-label="网站仓库所有者"
              placeholder="用户名或组织名"
              @update:model-value="update('frontendOwner', $event)"
          /></el-form-item>
          <el-form-item label="网站仓库名称"
            ><el-input
              :model-value="modelValue.frontendRepo || ''"
              aria-label="网站仓库名称"
              placeholder="网站仓库"
              @update:model-value="update('frontendRepo', $event)"
          /></el-form-item>
        </div>
        <el-form-item label="视频服务地址"
          ><el-input
            :model-value="modelValue.videoApiUrl || ''"
            aria-label="视频服务地址"
            placeholder="https://video.example.com"
            autocomplete="off"
            @update:model-value="update('videoApiUrl', $event)"
        /></el-form-item>
      </el-collapse-item>
      <el-collapse-item name="oauth" title="GitHub OAuth · 选填">
        <p class="repository-config__hint">
          仅“使用 GitHub 登录”需要配置，请填写属于此部署的 OAuth App。使用 Personal Access Token
          可跳过。
        </p>
        <el-form-item label="OAuth Client ID"
          ><el-input
            :model-value="modelValue.clientId || ''"
            aria-label="OAuth Client ID"
            placeholder="GitHub OAuth App Client ID"
            autocomplete="off"
            @update:model-value="update('clientId', $event)"
        /></el-form-item>
        <el-form-item label="OAuth Worker 地址"
          ><el-input
            :model-value="modelValue.oauthWorkerUrl || ''"
            aria-label="OAuth Worker 地址"
            placeholder="https://oauth.example.com"
            autocomplete="off"
            @update:model-value="update('oauthWorkerUrl', $event)"
        /></el-form-item>
      </el-collapse-item>
    </el-collapse>
    <div class="repository-config__actions">
      <slot name="actions" />
      <el-button
        type="primary"
        native-type="submit"
        :loading="busy"
        :disabled="busy"
        data-testid="save-repository-config"
        >{{ submitLabel }}</el-button
      >
    </div>
  </el-form>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: { type: Object, required: true },
  busy: Boolean,
  submitLabel: { type: String, default: '保存配置并继续' },
  initialSection: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'submit'])
const expanded = ref(props.initialSection ? [props.initialSection] : [])
const fields = [
  'owner',
  'repo',
  'branch',
  'workflowOwner',
  'workflowRepo',
  'frontendOwner',
  'frontendRepo',
  'videoApiUrl',
  'clientId',
  'oauthWorkerUrl'
]
watch(
  () => props.initialSection,
  value => {
    if (value && !expanded.value.includes(value)) expanded.value.push(value)
  }
)
function update(field, value) {
  const next = { ...props.modelValue, [field]: value }
  const connections = [
    'workflowOwner',
    'workflowRepo',
    'frontendOwner',
    'frontendRepo',
    'videoApiUrl'
  ]
  const targetChanged =
    ['owner', 'repo'].includes(field) &&
    props.modelValue.owner?.trim() &&
    props.modelValue.repo?.trim() &&
    String(props.modelValue[field]).trim() !== String(value).trim()
  if (targetChanged && connections.some(key => props.modelValue[key])) {
    connections.forEach(key => {
      next[key] = ''
    })
    ElMessage.info('已清除原仓库的工作流、网站和视频服务连接，请按新仓库重新配置。')
  }
  emit('update:modelValue', next)
}
function submit() {
  if (props.busy) return
  emit(
    'submit',
    Object.fromEntries(fields.map(field => [field, String(props.modelValue[field] || '').trim()]))
  )
}
</script>

<style scoped lang="scss">
.repository-config {
  &__primary {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 16px;
  }
  &__primary > :last-child {
    grid-column: 1 / -1;
  }
  &__pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 16px;
  }
  &__hint {
    margin: 0 0 18px;
    color: var(--studio-muted, #b1b9c9);
    font-size: 12px;
    line-height: 1.7;
  }
  &__advanced {
    margin: 2px 0 22px;
    --el-collapse-border-color: rgba(255, 255, 255, 0.1);
    --el-collapse-header-bg-color: transparent;
    --el-collapse-content-bg-color: transparent;
    --el-collapse-header-text-color: var(--studio-text, #f4f6fb);
    --el-collapse-content-text-color: var(--studio-text, #f4f6fb);
  }
  &__advanced :deep(.el-collapse-item__header) {
    font-size: 13px;
    font-weight: 500;
  }
  &__advanced :deep(.el-collapse-item__content) {
    padding-top: 12px;
    padding-bottom: 8px;
  }
  &__actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 12px;
  }
  &__actions :deep(.el-button) {
    border-radius: 999px;
    min-height: 38px;
  }
  &__actions :deep(.el-button + .el-button) {
    margin-left: 0;
  }
  :deep(.el-form-item) {
    margin-bottom: 18px;
  }
  :deep(.el-form-item__label) {
    color: #d5dce8;
    font-size: 12px;
    line-height: 1.5;
    padding-bottom: 7px;
  }
  :deep(.el-input__wrapper) {
    min-height: 39px;
    background: rgba(10, 15, 26, 0.28);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12) inset;
    border-radius: 11px;
  }
  :deep(.el-input__inner) {
    color: var(--studio-text, #f4f6fb);
    font-size: 13px;
  }
  :deep(.el-input__wrapper.is-focus) {
    box-shadow: 0 0 0 2px var(--studio-accent, #7db7ff) inset;
  }
  @media (max-width: 520px) {
    &__primary,
    &__pair {
      grid-template-columns: 1fr;
    }
    &__actions {
      flex-wrap: wrap;
    }
    &__actions > .el-button--primary {
      flex: 1;
    }
  }
}
</style>
