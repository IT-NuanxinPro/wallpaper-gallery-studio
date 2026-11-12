<template>
  <div class="upload-header">
    <div class="upload-header__top">
      <div class="upload-header__mode-switch">
        <button
          class="upload-header__mode-btn"
          :class="{ 'upload-header__mode-btn--active': uploadMode === 'ai' }"
          :disabled="isSwitching || !credentialsStore.hasCredentials"
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
                  ? '图片、视频与 AI 工坊共用当前标签页配置。'
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
              <div class="upload-header__ai-btn">
                <span class="upload-header__ai-btn-main">
                  <span class="upload-header__ai-btn-icon">🤖</span>
                  <span class="upload-header__ai-btn-copy">
                    <span class="upload-header__ai-btn-text">GPT-6.1 Sol</span>
                    <span class="upload-header__ai-btn-provider">
                      {{ credentialsStore.hasCredentials ? '当前标签页已配置' : '未配置 API Key' }}
                    </span>
                  </span>
                </span>
                <span v-if="aiAnalyzing" class="upload-header__ai-btn-badge">{{
                  aiAnalyzingCount
                }}</span>
                <router-link to="/settings#ai-config" class="upload-header__ai-settings">
                  {{ credentialsStore.hasCredentials ? 'AI 配置' : '去设置' }}
                </router-link>
              </div>
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
import { nextTick, onMounted, ref, watch } from 'vue'
import { gsap } from 'gsap'
import { useCredentialsStore } from '@/stores/credentials'

const credentialsStore = useCredentialsStore()
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

const isSwitching = ref(false)
const modeStageRef = ref(null)
const aiPaneRef = ref(null)
const manualPaneRef = ref(null)

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

onMounted(() => {
  nextTick(() => syncModePaneState(props.uploadMode))
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

  &__ai-settings {
    flex-shrink: 0;
    color: $primary-start;
    font-size: $font-size-xs;
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
