<template>
  <div class="upload-header">
    <div class="upload-header__top">
      <div class="upload-header__mode-switch">
        <button
          class="upload-header__mode-btn"
          :class="{ 'upload-header__mode-btn--active': uploadMode === 'ai' }"
          :disabled="isSwitching"
          @click="handleModeChange('ai')"
        >
          <span class="upload-header__mode-icon">🤖</span>
          <span>AI 智能分类</span>
        </button>
        <button
          class="upload-header__mode-btn"
          :class="{ 'upload-header__mode-btn--active': uploadMode === 'manual' }"
          :disabled="isSwitching"
          @click="handleModeChange('manual')"
        >
          <span class="upload-header__mode-icon">📁</span>
          <span>手动上传</span>
        </button>
      </div>

      <div class="upload-header__actions">
        <Transition name="fade">
          <div v-if="filesCount > 0" class="upload-header__stats">
            <span class="upload-header__count">
              <el-icon><Picture /></el-icon>
              {{ filesCount }}
            </span>
            <Transition name="fade">
              <span v-if="errorCount > 0" class="upload-header__error" @click="$emit('retry')">
                {{ errorCount }} 失败
              </span>
            </Transition>
            <button v-if="!uploading" class="upload-header__btn-clear" @click="$emit('clear')">
              <el-icon><Delete /></el-icon>
            </button>
          </div>
        </Transition>
        <button
          v-if="metadataStatus === 'error'"
          class="upload-header__btn-metadata"
          @click="$emit('retry-metadata')"
        >
          重试元数据
        </button>
        <button
          v-if="canUpload"
          class="upload-header__btn-upload"
          :disabled="!canStartUpload"
          @click="$emit('upload')"
        >
          <el-icon v-if="uploading" class="is-loading"><Loading /></el-icon>
          <el-icon v-else><Upload /></el-icon>
          <span v-if="uploading">{{ progress }}%</span>
          <span v-else>上传</span>
        </button>
      </div>
    </div>

    <div class="upload-header__context">
      <div class="upload-header__context-shell">
        <div class="upload-header__context-panel upload-header__context-panel--series">
          <div class="upload-header__context-head">
            <span class="upload-header__series-label">系列</span>
            <p class="upload-header__manual-hint">
              {{
                uploadMode === 'ai'
                  ? '先选类型，再让 AI 推荐分类。'
                  : '先选系列，再从左侧选择分类目录。'
              }}
            </p>
          </div>

          <div class="upload-header__series">
            <div class="upload-header__series-btns">
              <button
                v-for="s in seriesOptions"
                :key="s.value"
                class="upload-header__series-btn"
                :class="{ 'upload-header__series-btn--active': currentSeries === s.value }"
                @click="$emit('series-change', s.value)"
              >
                <span>{{ s.icon }}</span>
                <span>{{ s.label }}</span>
              </button>
            </div>
          </div>
        </div>

        <div class="upload-header__context-panel upload-header__context-panel--detail">
          <div class="upload-header__context-head">
            <span class="upload-header__series-label">{{
              uploadMode === 'ai' ? '模型' : '分类'
            }}</span>
            <p class="upload-header__manual-hint">
              {{
                uploadMode === 'ai'
                  ? '当前模型决定自动分析能力和批量上限。'
                  : '当前目录决定图片最终上传位置。'
              }}
            </p>
          </div>

          <div ref="modeStageRef" class="upload-header__mode-stage">
            <div
              ref="aiPaneRef"
              class="upload-header__mode-content upload-header__mode-pane"
              :class="{ 'upload-header__mode-pane--active': uploadMode === 'ai' }"
            >
              <el-popover
                v-model:visible="modelPopoverVisible"
                placement="bottom"
                :width="modelPopoverWidth"
                trigger="click"
                popper-class="upload-header__ai-popover"
              >
                <template #reference>
                  <button
                    ref="modelTriggerRef"
                    class="upload-header__ai-btn"
                    :disabled="aiAnalyzing"
                  >
                    <span class="upload-header__ai-btn-main">
                      <span class="upload-header__ai-btn-icon">{{
                        aiConfig?.providerIcon || '🤖'
                      }}</span>
                      <span class="upload-header__ai-btn-copy">
                        <span class="upload-header__ai-btn-text">{{
                          aiConfig?.modelName || 'AI 自动分类'
                        }}</span>
                        <span class="upload-header__ai-btn-provider">{{
                          aiConfig?.providerName || 'AI Provider'
                        }}</span>
                        <span
                          v-if="getModelBadges(currentModel).length > 0"
                          class="upload-header__ai-btn-tags"
                        >
                          <span
                            v-for="badge in getModelBadges(currentModel)"
                            :key="badge.label"
                            class="upload-header__model-badge"
                            :class="`upload-header__model-badge--${badge.tone}`"
                          >
                            {{ badge.label }}
                          </span>
                        </span>
                      </span>
                    </span>
                    <span class="upload-header__ai-btn-suffix">
                      <span v-if="aiAnalyzing" class="upload-header__ai-btn-badge">
                        {{ aiAnalyzingCount }}
                      </span>
                      <span v-else class="upload-header__ai-btn-arrow">▼</span>
                    </span>
                  </button>
                </template>

                <div class="upload-header__ai-dropdown">
                  <div class="upload-header__ai-dropdown-section">
                    <div class="upload-header__ai-dropdown-label">AI 模型</div>
                    <div class="upload-header__ai-dropdown-options">
                      <button
                        v-for="model in sortedModels"
                        :key="model.key"
                        class="upload-header__ai-dropdown-option"
                        :class="{
                          'upload-header__ai-dropdown-option--active':
                            aiConfig?.modelKey === model.key
                        }"
                        @click="handleModelSelect(model.key)"
                      >
                        <span class="upload-header__ai-dropdown-copy">
                          <span class="upload-header__ai-dropdown-name-row">
                            <span class="upload-header__ai-dropdown-name">{{ model.name }}</span>
                            <span
                              v-if="getModelBadges(model).length > 0"
                              class="upload-header__ai-dropdown-tags"
                            >
                              <span
                                v-for="badge in getModelBadges(model)"
                                :key="badge.label"
                                class="upload-header__model-badge"
                                :class="`upload-header__model-badge--${badge.tone}`"
                              >
                                {{ badge.label }}
                              </span>
                            </span>
                          </span>
                          <span class="upload-header__ai-dropdown-desc">{{
                            getCompactModelDescription(model)
                          }}</span>
                        </span>
                        <span class="upload-header__ai-dropdown-source">
                          {{ getProviderLabel(model.provider) }}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </el-popover>
            </div>

            <div
              ref="manualPaneRef"
              class="upload-header__mode-content upload-header__mode-pane"
              :class="{ 'upload-header__mode-pane--active': uploadMode === 'manual' }"
            >
              <div
                class="upload-header__path"
                :class="{ 'upload-header__path--empty': !targetPath }"
              >
                <el-icon v-if="targetPath"><FolderOpened /></el-icon>
                <el-icon v-else><Warning /></el-icon>
                <span>{{ targetPath || '请在左侧选择分类目录' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { gsap } from 'gsap'
import { FolderOpened, Warning, Picture, Delete, Upload, Loading } from '@element-plus/icons-vue'

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

const seriesOptions = [
  { value: 'desktop', label: '电脑', icon: '🖥️' },
  { value: 'mobile', label: '手机', icon: '📱' },
  { value: 'avatar', label: '头像', icon: '👤' }
]

const sortedModels = computed(() => {
  const providerPriority = {
    zhipu: 0,
    groq: 1,
    sub2api: 2,
    cloudflare: 3
  }

  return [...(props.aiConfig?.availableModels || [])].sort((first, second) => {
    const providerDiff =
      (providerPriority[first.provider] ?? 99) - (providerPriority[second.provider] ?? 99)

    if (providerDiff !== 0) return providerDiff
    if (first.recommended !== second.recommended)
      return Number(second.recommended) - Number(first.recommended)
    return 0
  })
})

const currentModel = computed(
  () => sortedModels.value.find(model => model.key === props.aiConfig?.modelKey) || null
)

function getModelBadges(model) {
  if (!model) return []

  const badges = []

  if (model.key === 'sub2api-grok-4.6') {
    badges.push({ label: '推荐', tone: 'primary' })
    badges.push({ label: '视觉', tone: 'success' })
  }

  if (model.key === 'sub2api-grok-4.5') {
    badges.push({ label: '视觉', tone: 'success' })
    badges.push({ label: '稳定', tone: 'info' })
  }

  if (model.key === 'zhipu-glm-4v-flash') {
    badges.push({ label: '推荐', tone: 'primary' })
    badges.push({ label: '免费', tone: 'success' })
    badges.push({ label: '极速', tone: 'success' })
  }

  if (model.key === 'zhipu-glm-4.1v-thinking-flash') {
    badges.push({ label: '免费', tone: 'success' })
    badges.push({ label: '推理', tone: 'warning' })
    badges.push({ label: '深分析', tone: 'info' })
  }

  if (model.key === 'groq-qwen3.6-27b') {
    badges.push({ label: '极速', tone: 'success' })
    badges.push({ label: '长上下文', tone: 'warning' })
    badges.push({ label: '限流', tone: 'danger' })
  }

  if (model.key === 'cloudflare-llama-3.2') {
    badges.push({ label: 'Workers', tone: 'warning' })
    badges.push({ label: '私有化', tone: 'info' })
  }

  if (model.key === 'cloudflare-llava-1.5') {
    badges.push({ label: '兼容', tone: 'primary' })
    badges.push({ label: '轻量', tone: 'success' })
  }

  return badges
}

function getCompactModelDescription(model) {
  if (!model) return ''

  const descriptionMap = {
    'sub2api-grok-4.6': '新版 Grok 视觉模型，推荐用于壁纸分类与元数据生成',
    'sub2api-grok-4.5': '稳定的 Grok 视觉模型，支持壁纸分类与元数据生成',
    'zhipu-glm-4v-flash': '智谱免费视觉模型，速度快，推荐日常使用',
    'zhipu-glm-4.1v-thinking-flash': '智谱免费推理模型，带思考过程，适合深度分析',
    'groq-qwen3.6-27b': '极速但免费层每分钟仅 ~1.7 张图，适合低频使用',
    'cloudflare-llama-3.2': 'Workers 托管，适合私有部署',
    'cloudflare-llava-1.5': '轻量兼容，适合基础兜底'
  }

  return descriptionMap[model.key] || model.description || ''
}

function getProviderLabel(provider) {
  const labels = {
    sub2api: 'Grok',
    groq: 'Groq',
    zhipu: '智谱 GLM',
    cloudflare: 'Cloudflare'
  }

  return labels[provider] || provider
}

const isSwitching = ref(false)
const modelPopoverVisible = ref(false)
const modelTriggerRef = ref(null)
const modelPopoverWidth = ref(280)
const modeStageRef = ref(null)
const aiPaneRef = ref(null)
const manualPaneRef = ref(null)

function syncModelPopoverWidth() {
  const trigger = modelTriggerRef.value
  if (!trigger) return
  modelPopoverWidth.value = Math.max(Math.round(trigger.getBoundingClientRect().width), 220)
}

function getModePane(mode) {
  return mode === 'ai' ? aiPaneRef.value : manualPaneRef.value
}

function syncModePaneState(mode) {
  const activePane = getModePane(mode)
  const inactivePane = getModePane(mode === 'ai' ? 'manual' : 'ai')

  if (activePane) {
    gsap.set(activePane, { autoAlpha: 1, y: 0, scale: 1, zIndex: 2 })
  }

  if (inactivePane) {
    gsap.set(inactivePane, { autoAlpha: 0, y: 6, scale: 0.992, zIndex: 1 })
  }
}

async function animateModePane(mode) {
  await nextTick()

  const stage = modeStageRef.value
  const activePane = getModePane(mode)
  const inactivePane = getModePane(mode === 'ai' ? 'manual' : 'ai')

  if (!stage || !activePane || !inactivePane) return

  gsap.killTweensOf([stage, activePane, inactivePane])

  const timeline = gsap.timeline({ defaults: { ease: 'expo.out' } })

  timeline.fromTo(stage, { y: 0, scale: 1 }, { y: 0, scale: 1, duration: 0.42, ease: 'none' }, 0)

  timeline.to(
    inactivePane,
    {
      autoAlpha: 0,
      y: -4,
      scale: 0.992,
      duration: 0.2,
      ease: 'power2.out'
    },
    0
  )

  timeline.fromTo(
    activePane,
    {
      autoAlpha: 0,
      y: 8,
      scale: 0.994,
      zIndex: 2
    },
    {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      duration: 0.42,
      ease: 'expo.out'
    },
    0.04
  )
}

// 处理模式切换
async function handleModeChange(mode) {
  if (isSwitching.value || props.uploadMode === mode) return

  isSwitching.value = true
  emit('mode-change', mode)

  await new Promise(resolve => setTimeout(resolve, 420))
  isSwitching.value = false
}

function handleModelSelect(modelKey) {
  emit('model-change', modelKey)
  modelPopoverVisible.value = false
}

onMounted(() => {
  nextTick(syncModelPopoverWidth)
  nextTick(() => syncModePaneState(props.uploadMode))
  window.addEventListener('resize', syncModelPopoverWidth)
})

onUnmounted(() => {
  window.removeEventListener('resize', syncModelPopoverWidth)
})

watch(
  () => props.uploadMode,
  (mode, previousMode) => {
    if (!previousMode || previousMode === mode) {
      syncModePaneState(mode)
      return
    }

    animateModePane(mode)
  }
)
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.upload-header {
  display: grid;
  gap: $spacing-3;
  margin-bottom: $spacing-4;
  flex-shrink: 0;
  min-height: 0;

  &__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $spacing-3;
    flex-wrap: wrap;
  }

  &__context {
    min-width: 0;
  }

  &__context-shell {
    display: grid;
    grid-template-columns: minmax(320px, 1.05fr) minmax(260px, 0.95fr);
    gap: $spacing-3;
    align-items: stretch;
  }

  &__context-panel {
    display: flex;
    flex-direction: column;
    gap: $spacing-3;
    min-width: 0;
    min-height: 116px;
    padding: $spacing-3 $spacing-4;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: $radius-lg;
  }

  &__context-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $spacing-3;
    min-width: 0;
  }

  &__mode-content {
    display: flex;
    align-items: center;
    flex: 1;
    min-height: 52px;
    min-width: 0;
  }

  &__mode-stage {
    display: grid;
    flex: 1;
    min-width: 0;
  }

  &__mode-pane {
    grid-area: 1 / 1;
    pointer-events: none;
    will-change: transform, opacity;

    &--active {
      pointer-events: auto;
    }
  }

  // 模式切换
  &__mode-switch {
    display: flex;
    background: rgba(255, 255, 255, 0.05);
    border-radius: $radius-lg;
    padding: 2px;
  }

  &__mode-btn {
    display: flex;
    align-items: center;
    gap: $spacing-1;
    padding: $spacing-2 $spacing-3;
    background: transparent;
    border: none;
    border-radius: $radius-md;
    color: $gray-400;
    font-size: $font-size-sm;
    cursor: pointer;
    transition: all $duration-normal;

    &:hover:not(&--active) {
      color: $gray-200;
    }

    &--active {
      background: $primary-gradient;
      color: $white;
      font-weight: 500;
    }
  }

  &__mode-icon {
    font-size: 14px;
  }

  // 系列选择
  &__series {
    display: flex;
    align-items: stretch;
    min-width: 0;
    flex: 1;

    &-label {
      font-size: $font-size-sm;
      color: $gray-400;
      flex-shrink: 0;
    }

    &-btns {
      display: flex;
      align-items: center;
      gap: $spacing-2;
      width: 100%;
      padding: 0;
      background: transparent;
      border: none;
      border-radius: 0;
    }

    &-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: $spacing-1;
      flex: 1;
      min-height: 40px;
      padding: 0 $spacing-3;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: $radius-md;
      color: $gray-300;
      font-size: 13px;
      line-height: 1;
      cursor: pointer;
      transition: all $duration-normal $ease-out;

      &:hover:not(&--active) {
        background: rgba(255, 255, 255, 0.07);
        border-color: rgba(255, 255, 255, 0.14);
        color: $white;
      }

      &--active {
        background: rgba($primary-start, 0.16);
        border-color: rgba($primary-start, 0.3);
        color: $white;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
      }
    }
  }

  &__ai-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $spacing-3;
    width: 100%;
    min-height: 52px;
    padding: $spacing-2 $spacing-3;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.05));
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: $radius-lg;
    color: $gray-200;
    font-size: $font-size-sm;
    cursor: pointer;
    transition: all $duration-normal;
    max-width: none;

    &:hover:not(:disabled) {
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.11), rgba(255, 255, 255, 0.07));
      border-color: rgba($primary-start, 0.4);
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.14);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    &-main {
      display: flex;
      align-items: center;
      gap: $spacing-2;
      min-width: 0;
      flex: 1;
    }

    &-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      background: rgba($primary-start, 0.16);
      border-radius: 10px;
      font-size: 14px;
      flex-shrink: 0;
    }

    &-copy {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      min-width: 0;
      gap: 3px;
    }

    &-tags {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      flex-wrap: wrap;
    }

    &-text {
      max-width: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: $white;
      font-size: 13px;
      font-weight: 600;
    }

    &-provider {
      color: $gray-500;
      font-size: 11px;
      line-height: 1;
    }

    &-suffix {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      flex-shrink: 0;
    }

    &-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      padding: 0 6px;
      background: $warning;
      color: $white;
      font-size: 11px;
      font-weight: 600;
      border-radius: $radius-full;
      animation: pulse 2s ease-in-out infinite;
    }

    &-arrow {
      font-size: 11px;
      color: $gray-400;
      flex-shrink: 0;
      transform: translateY(1px);
    }
  }

  // AI 下拉菜单
  &__ai-dropdown {
    max-height: min(420px, calc(100vh - 140px));
    overflow: hidden;

    &-section {
      display: flex;
      flex-direction: column;
      max-height: inherit;
      margin-bottom: $spacing-3;

      &:last-of-type {
        margin-bottom: $spacing-2;
      }
    }

    &-label {
      font-size: $font-size-xs;
      color: $gray-400;
      margin-bottom: $spacing-2;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    &-options {
      display: flex;
      flex-direction: column;
      gap: $spacing-1;
      max-height: min(380px, calc(100vh - 190px));
      overflow-y: auto;
      overscroll-behavior: contain;
      padding-right: 2px;

      &::-webkit-scrollbar {
        width: 6px;
      }

      &::-webkit-scrollbar-track {
        background: transparent;
      }

      &::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.14);
        border-radius: 999px;
      }
    }

    &-option {
      display: flex;
      align-items: flex-start;
      gap: $spacing-2;
      padding: $spacing-2 $spacing-3;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid transparent;
      border-radius: $radius-md;
      color: $gray-300;
      font-size: $font-size-sm;
      cursor: pointer;
      transition: all $duration-normal;
      text-align: left;
      width: 100%;

      &:hover {
        background: rgba(255, 255, 255, 0.1);
      }

      &--active {
        background: rgba($primary-start, 0.15);
        border-color: rgba($primary-start, 0.4);
        color: $white;
      }

      &--disabled {
        opacity: 0.35;
        cursor: not-allowed;
        pointer-events: none;
      }
    }

    &-copy {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      flex: 1;
    }

    &-name-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      flex-wrap: wrap;
    }

    &-tags {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    &-name {
      color: $white;
      font-size: 13px;
      font-weight: 600;
      text-align: left;
    }

    &-desc {
      color: $gray-500;
      font-size: 11px;
      line-height: 1.4;
      text-align: left;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    &-source {
      flex-shrink: 0;
      margin-left: auto;
      padding: 4px 8px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: $radius-full;
      font-size: 10px;
      color: $gray-400;
      line-height: 1;
    }

    &-badge {
      font-size: 10px;
      padding: 1px 4px;
      background: rgba($success, 0.2);
      color: $success;
      border-radius: $radius-sm;
    }
  }

  &__model-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 18px;
    padding: 0 7px;
    border-radius: $radius-full;
    border: 1px solid transparent;
    font-size: 10px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;

    &--primary {
      background: rgba($primary-start, 0.16);
      border-color: rgba($primary-start, 0.26);
      color: #cdb8ff;
    }

    &--success {
      background: rgba($success, 0.14);
      border-color: rgba($success, 0.26);
      color: #8df0c6;
    }

    &--warning {
      background: rgba($warning, 0.14);
      border-color: rgba($warning, 0.26);
      color: #ffd48a;
    }

    &--info {
      background: rgba($info, 0.14);
      border-color: rgba($info, 0.26);
      color: #9ad0ff;
    }
  }

  // 手动模式路径
  &__path {
    display: flex;
    align-items: center;
    gap: $spacing-2;
    width: 100%;
    padding: $spacing-3 $spacing-4;
    background: rgba($success, 0.1);
    border: 1px solid rgba($success, 0.3);
    border-radius: $radius-lg;
    font-size: $font-size-sm;
    color: $white;
    transition: all $duration-normal;
    min-width: 0;
    min-height: 48px;

    .el-icon {
      font-size: 18px;
      color: $success;
      flex-shrink: 0;
    }

    span {
      font-family: monospace;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &--empty {
      background: rgba($warning, 0.1);
      border-color: rgba($warning, 0.3);

      .el-icon {
        color: $warning;
      }

      span {
        color: $warning;
        font-family: inherit;
      }
    }
  }

  &__manual-hint {
    margin: 0;
    color: $gray-500;
    font-size: $font-size-xs;
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  // 操作按钮
  &__actions {
    display: flex;
    align-items: center;
    gap: $spacing-2;
    flex-shrink: 0;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  &__stats {
    display: flex;
    align-items: center;
    gap: $spacing-2;
    flex-wrap: wrap;
  }

  &__count {
    display: flex;
    align-items: center;
    gap: $spacing-1;
    font-size: $font-size-sm;
    color: $gray-300;
    padding: $spacing-2 $spacing-3;
    background: rgba(255, 255, 255, 0.05);
    border-radius: $radius-md;

    .el-icon {
      font-size: 14px;
      color: $primary-start;
    }
  }

  &__error {
    font-size: $font-size-xs;
    color: $danger;
    padding: $spacing-1 $spacing-2;
    background: rgba($danger, 0.1);
    border-radius: $radius-sm;
    cursor: pointer;

    &:hover {
      background: rgba($danger, 0.2);
    }
  }

  &__btn-clear {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.05);
    border: none;
    border-radius: $radius-md;
    color: $gray-400;
    cursor: pointer;
    transition: all $duration-normal;

    &:hover {
      background: rgba($danger, 0.1);
      color: $danger;
    }
  }

  &__btn-metadata {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: $spacing-2 $spacing-3;
    background: rgba($warning, 0.12);
    border: 1px solid rgba($warning, 0.35);
    border-radius: $radius-md;
    color: $warning;
    font-size: $font-size-sm;
    font-weight: 600;
    cursor: pointer;
    transition: all $duration-normal;

    &:hover {
      background: rgba($warning, 0.2);
      color: $white;
    }
  }

  &__btn-upload {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: $spacing-2;
    padding: $spacing-2 $spacing-5;
    background: $primary-gradient;
    border: none;
    border-radius: $radius-lg;
    color: $white;
    font-size: $font-size-sm;
    font-weight: 600;
    cursor: pointer;
    transition: all $duration-normal $ease-out;

    &:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba($primary-start, 0.4);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .is-loading {
      animation: spin 1s linear infinite;
    }
  }
}

:deep(.upload-header__ai-popover) {
  padding: 8px !important;
  background: rgba(16, 18, 27, 0.92) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 18px !important;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28) !important;
  backdrop-filter: blur(18px);
}

:deep(.upload-header__ai-popover .el-popper__arrow::before) {
  background: rgba(16, 18, 27, 0.92) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
}

@media (max-width: 960px) {
  .upload-header {
    &__top {
      align-items: stretch;
    }

    &__actions {
      width: 100%;
      justify-content: flex-start;
    }

    &__mode-switch {
      width: 100%;
      flex-wrap: wrap;
    }

    &__mode-btn {
      flex: 1;
      justify-content: center;
    }

    &__context-shell {
      grid-template-columns: 1fr;
    }

    &__context-head {
      align-items: flex-start;
      flex-direction: column;
      gap: $spacing-1;
    }

    &__manual-hint {
      white-space: normal;
      overflow: visible;
      text-overflow: clip;
    }
  }
}

@media (max-width: 640px) {
  .upload-header {
    &__series {
      width: 100%;
    }

    &__series-btns {
      width: 100%;
      gap: 6px;
    }

    &__series-btn {
      padding: 0 $spacing-2;
      font-size: 12px;
      min-height: 36px;
    }

    &__ai-btn {
      width: 100%;
      max-width: none;
      justify-content: space-between;
    }

    &__btn-upload {
      width: 100%;
    }

    &__context-panel {
      min-height: 0;
    }
  }
}

// 淡入淡出动画
.fade-enter-active,
.fade-leave-active {
  transition: opacity $duration-normal;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
