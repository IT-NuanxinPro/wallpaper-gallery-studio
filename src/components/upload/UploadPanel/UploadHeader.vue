<template>
  <header class="upload-header">
    <div class="upload-header__group upload-header__group--primary">
      <div class="upload-header__mode-switch" aria-label="上传模式">
        <button
          v-for="mode in modeOptions"
          :key="mode.value"
          class="upload-header__mode-btn"
          :class="{ 'upload-header__mode-btn--active': uploadMode === mode.value }"
          :disabled="isSwitching"
          @click="handleModeChange(mode.value)"
        >
          <span>{{ mode.icon }}</span>
          <span>{{ mode.label }}</span>
        </button>
      </div>

      <span class="upload-header__divider"></span>

      <div class="upload-header__series" aria-label="壁纸系列">
        <button
          v-for="series in seriesOptions"
          :key="series.value"
          class="upload-header__series-btn"
          :class="{ 'upload-header__series-btn--active': currentSeries === series.value }"
          :title="`${series.label}壁纸`"
          @click="$emit('series-change', series.value)"
        >
          <span>{{ series.icon }}</span>
          <span>{{ series.label }}</span>
        </button>
      </div>
    </div>

    <div class="upload-header__context">
      <el-popover
        v-if="uploadMode === 'ai'"
        v-model:visible="modelPopoverVisible"
        placement="bottom-start"
        :width="340"
        trigger="click"
        popper-class="upload-header__ai-popover"
      >
        <template #reference>
          <button class="upload-header__model" :disabled="aiAnalyzing">
            <span class="upload-header__model-icon">{{ aiConfig?.providerIcon || '🧠' }}</span>
            <span class="upload-header__model-copy">
              <span class="upload-header__model-label">AI 模型</span>
              <strong>{{ aiConfig?.modelName || 'AI 自动分类' }}</strong>
            </span>
            <span v-if="aiAnalyzing" class="upload-header__model-count">
              {{ aiAnalyzingCount }}
            </span>
            <span v-else class="upload-header__model-arrow">⌄</span>
          </button>
        </template>

        <div class="upload-header__model-menu">
          <div class="upload-header__model-menu-head">
            <strong>选择 AI 模型</strong>
            <span>所有视觉模型共用同一任务队列</span>
          </div>
          <button
            v-for="model in sortedModels"
            :key="model.key"
            class="upload-header__model-option"
            :class="{ 'upload-header__model-option--active': aiConfig?.modelKey === model.key }"
            @click="handleModelSelect(model.key)"
          >
            <span class="upload-header__model-option-copy">
              <span class="upload-header__model-option-title">
                <strong>{{ model.name }}</strong>
                <span
                  v-for="badge in getModelBadges(model)"
                  :key="badge.label"
                  class="upload-header__badge"
                  :class="`upload-header__badge--${badge.tone}`"
                >
                  {{ badge.label }}
                </span>
              </span>
              <span>{{ getCompactModelDescription(model) }}</span>
            </span>
            <small>{{ getProviderLabel(model.provider) }}</small>
          </button>
        </div>
      </el-popover>

      <div
        v-else
        class="upload-header__path"
        :class="{ 'upload-header__path--empty': !targetPath }"
      >
        <el-icon><FolderOpened /></el-icon>
        <span>{{ targetPath || '请从左侧选择分类目录' }}</span>
      </div>
    </div>

    <div class="upload-header__actions">
      <div v-if="filesCount > 0" class="upload-header__file-count" title="本批次图片数量">
        <el-icon><Picture /></el-icon>
        <strong>{{ filesCount }}</strong>
        <span>张</span>
      </div>

      <button
        v-if="errorCount > 0"
        class="upload-header__error"
        title="重试上传失败的图片"
        @click="$emit('retry')"
      >
        {{ errorCount }} 失败
      </button>

      <button
        v-if="metadataStatus === 'error'"
        class="upload-header__metadata"
        @click="$emit('retry-metadata')"
      >
        重试元数据
      </button>

      <button
        v-if="filesCount > 0 && !uploading"
        class="upload-header__icon-btn"
        title="清空本批次图片"
        @click="$emit('clear')"
      >
        <el-icon><Delete /></el-icon>
      </button>

      <button
        v-if="canUpload"
        class="upload-header__upload"
        :disabled="!canStartUpload"
        @click="$emit('upload')"
      >
        <el-icon v-if="uploading" class="is-loading"><Loading /></el-icon>
        <el-icon v-else><Upload /></el-icon>
        <span>{{ uploading ? `${progress}%` : '开始上传' }}</span>
      </button>
    </div>
  </header>
</template>

<script setup>
import { computed, ref } from 'vue'
import { Delete, FolderOpened, Loading, Picture, Upload } from '@element-plus/icons-vue'

const props = defineProps({
  uploadMode: { type: String, default: 'ai' },
  currentSeries: { type: String, default: 'desktop' },
  targetPath: { type: String, default: '' },
  aiConfig: { type: Object, default: null },
  aiAnalyzing: { type: Boolean, default: false },
  aiAnalyzingCount: { type: Number, default: 0 },
  filesCount: { type: Number, default: 0 },
  errorCount: { type: Number, default: 0 },
  uploading: { type: Boolean, default: false },
  progress: { type: Number, default: 0 },
  canUpload: { type: Boolean, default: true },
  canStartUpload: { type: Boolean, default: false },
  metadataStatus: { type: String, default: 'idle' },
  metadataError: { type: String, default: '' }
})

const emit = defineEmits([
  'mode-change',
  'series-change',
  'model-change',
  'retry-metadata',
  'retry',
  'clear',
  'upload'
])

const modeOptions = [
  { value: 'ai', label: 'AI 分类', icon: '🤖' },
  { value: 'manual', label: '手动', icon: '📁' }
]

const seriesOptions = [
  { value: 'desktop', label: '电脑', icon: '🖥️' },
  { value: 'mobile', label: '手机', icon: '📱' },
  { value: 'avatar', label: '头像', icon: '👤' }
]

const providerPriority = { sub2api: 0, zhipu: 1, groq: 2, cloudflare: 3 }
const modelPopoverVisible = ref(false)
const isSwitching = ref(false)

const sortedModels = computed(() =>
  [...(props.aiConfig?.availableModels || [])].sort((first, second) => {
    const providerDiff =
      (providerPriority[first.provider] ?? 99) - (providerPriority[second.provider] ?? 99)
    if (providerDiff !== 0) return providerDiff
    return Number(second.recommended) - Number(first.recommended)
  })
)

function getModelBadges(model) {
  const badges = []
  if (model?.recommended) badges.push({ label: '推荐', tone: 'primary' })
  if (model?.key?.includes('grok')) badges.push({ label: '视觉', tone: 'success' })
  if (model?.key === 'zhipu-glm-4v-flash') {
    badges.push({ label: '免费', tone: 'success' }, { label: '极速', tone: 'success' })
  }
  if (model?.key?.includes('thinking')) badges.push({ label: '推理', tone: 'warning' })
  return badges.slice(0, 3)
}

function getCompactModelDescription(model) {
  const descriptions = {
    'sub2api-grok-4.6': '新版 Grok 视觉模型，适合壁纸分类与元数据生成',
    'sub2api-grok-4.5': '稳定的 Grok 视觉模型，支持批量视觉分析',
    'zhipu-glm-4v-flash': '免费、快速，适合日常批量识图',
    'zhipu-glm-4.1v-thinking-flash': '带推理能力，适合需要更深分析的图片',
    'groq-qwen3.6-27b': '响应快，免费层限流更严格',
    'cloudflare-llama-3.2': 'Workers 托管，适合私有部署',
    'cloudflare-llava-1.5': '轻量兼容，适合作为基础兜底'
  }
  return descriptions[model?.key] || model?.description || '视觉分类模型'
}

function getProviderLabel(provider) {
  return (
    { sub2api: 'Grok', zhipu: '智谱', groq: 'Groq', cloudflare: 'Cloudflare' }[provider] || provider
  )
}

function handleModeChange(mode) {
  if (isSwitching.value || props.uploadMode === mode) return
  isSwitching.value = true
  emit('mode-change', mode)
  window.setTimeout(() => {
    isSwitching.value = false
  }, 180)
}

function handleModelSelect(modelKey) {
  emit('model-change', modelKey)
  modelPopoverVisible.value = false
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.upload-header {
  display: grid;
  grid-template-columns: auto minmax(190px, 1fr) auto;
  align-items: center;
  gap: $spacing-3;
  min-height: 64px;
  margin-bottom: $spacing-3;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: $radius-xl;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.075), rgba(255, 255, 255, 0.04));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);

  button {
    font: inherit;
  }

  &__group,
  &__actions,
  &__series,
  &__mode-switch {
    display: flex;
    align-items: center;
  }

  &__group {
    gap: 10px;
    min-width: 0;
  }

  &__mode-switch,
  &__series {
    gap: 2px;
    padding: 3px;
    border-radius: $radius-lg;
    background: rgba(3, 7, 18, 0.38);
  }

  &__mode-btn,
  &__series-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 34px;
    padding: 0 10px;
    border: 0;
    border-radius: $radius-md;
    background: transparent;
    color: $gray-400;
    font-size: 12px;
    cursor: pointer;
    transition: 0.18s ease;

    &:hover:not(&--active) {
      color: $white;
      background: rgba(255, 255, 255, 0.06);
    }

    &--active {
      color: $white;
      background: rgba($primary-start, 0.22);
      box-shadow: inset 0 0 0 1px rgba($primary-start, 0.32);
    }
  }

  &__series-btn {
    min-width: 54px;
    padding: 0 8px;
  }

  &__divider {
    width: 1px;
    height: 28px;
    background: rgba(255, 255, 255, 0.1);
  }

  &__context {
    min-width: 0;
  }

  &__model,
  &__path {
    display: flex;
    align-items: center;
    width: 100%;
    min-width: 0;
    min-height: 42px;
    padding: 6px 10px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: $radius-lg;
    background: rgba(255, 255, 255, 0.045);
    color: $white;
  }

  &__model {
    gap: 9px;
    text-align: left;
    cursor: pointer;

    &:hover:not(:disabled) {
      border-color: rgba($primary-start, 0.38);
      background: rgba($primary-start, 0.08);
    }
  }

  &__model-icon {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    border-radius: 9px;
    background: rgba($primary-start, 0.16);
  }

  &__model-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;

    strong {
      overflow: hidden;
      color: $white;
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  &__model-label {
    color: $gray-500;
    font-size: 9px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  &__model-arrow,
  &__model-count {
    margin-left: auto;
    flex-shrink: 0;
    color: $gray-400;
  }

  &__model-count {
    min-width: 22px;
    padding: 3px 6px;
    border-radius: $radius-full;
    background: rgba($warning, 0.16);
    color: $warning;
    font-size: 10px;
    text-align: center;
  }

  &__path {
    gap: 8px;
    color: $gray-300;

    span {
      overflow: hidden;
      font-family: monospace;
      font-size: 11px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &--empty {
      border-color: rgba($warning, 0.25);
      color: $warning;
    }
  }

  &__actions {
    justify-content: flex-end;
    gap: 7px;
  }

  &__file-count {
    display: flex;
    align-items: baseline;
    gap: 3px;
    padding: 0 6px;
    color: $gray-500;
    font-size: 10px;

    .el-icon {
      color: $primary-start;
      transform: translateY(1px);
    }

    strong {
      color: $white;
      font-size: 14px;
    }
  }

  &__icon-btn,
  &__error,
  &__metadata,
  &__upload {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 36px;
    border-radius: $radius-lg;
    cursor: pointer;
  }

  &__icon-btn {
    width: 36px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    color: $gray-400;

    &:hover {
      border-color: rgba($danger, 0.3);
      color: $danger;
    }
  }

  &__error,
  &__metadata {
    padding: 0 9px;
    border: 1px solid rgba($danger, 0.22);
    background: rgba($danger, 0.09);
    color: $danger;
    font-size: 11px;
  }

  &__metadata {
    border-color: rgba($warning, 0.25);
    background: rgba($warning, 0.1);
    color: $warning;
  }

  &__upload {
    gap: 7px;
    min-width: 106px;
    padding: 0 15px;
    border: 0;
    background: $primary-gradient;
    color: $white;
    font-size: 12px;
    font-weight: 700;
    box-shadow: 0 8px 20px rgba($primary-start, 0.18);

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 10px 24px rgba($primary-start, 0.3);
    }

    &:disabled {
      opacity: 0.42;
      cursor: not-allowed;
      box-shadow: none;
    }

    .is-loading {
      animation: upload-header-spin 0.9s linear infinite;
    }
  }

  &__model-menu {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: min(430px, calc(100vh - 140px));
    overflow-y: auto;
  }

  &__model-menu-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px 6px 8px;
    color: $white;

    span {
      color: $gray-500;
      font-size: 10px;
    }
  }

  &__model-option {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    width: 100%;
    padding: 9px 10px;
    border: 1px solid transparent;
    border-radius: $radius-md;
    background: rgba(255, 255, 255, 0.035);
    color: $gray-400;
    text-align: left;
    cursor: pointer;

    &:hover,
    &--active {
      border-color: rgba($primary-start, 0.26);
      background: rgba($primary-start, 0.1);
    }

    small {
      margin-left: auto;
      color: $gray-500;
      white-space: nowrap;
    }
  }

  &__model-option-copy {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    font-size: 10px;
    line-height: 1.35;
  }

  &__model-option-title {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;

    strong {
      color: $white;
      font-size: 12px;
    }
  }

  &__badge {
    padding: 2px 5px;
    border-radius: $radius-full;
    font-size: 9px;

    &--primary {
      background: rgba($primary-start, 0.16);
      color: #cdb8ff;
    }

    &--success {
      background: rgba($success, 0.14);
      color: #8df0c6;
    }

    &--warning {
      background: rgba($warning, 0.14);
      color: #ffd48a;
    }
  }
}

:deep(.upload-header__ai-popover) {
  padding: 8px !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  border-radius: 16px !important;
  background: rgba(13, 17, 29, 0.96) !important;
  backdrop-filter: blur(18px);
}

@media (max-width: 1250px) {
  .upload-header {
    grid-template-columns: 1fr auto;

    &__context {
      grid-column: 1 / -1;
      grid-row: 2;
    }
  }
}

@media (max-width: 720px) {
  .upload-header {
    grid-template-columns: 1fr;

    &__group {
      flex-wrap: wrap;
    }

    &__divider {
      display: none;
    }

    &__actions,
    &__context {
      grid-column: 1;
      width: 100%;
    }

    &__actions {
      justify-content: stretch;
    }

    &__upload {
      flex: 1;
    }
  }
}

@keyframes upload-header-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
