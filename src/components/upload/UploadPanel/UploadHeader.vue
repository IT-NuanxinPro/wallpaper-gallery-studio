<template>
  <div class="upload-header">
    <!-- 模式切换 -->
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

    <!-- 使用 Transition 包裹内容区域 -->
    <Transition name="mode-fade" mode="out-in">
      <!-- AI 模式：显示系列选择 + AI 配置 -->
      <div v-if="uploadMode === 'ai'" key="ai" class="upload-header__ai-config">
        <div class="upload-header__series">
          <span class="upload-header__series-label">系列:</span>
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

        <!-- AI Provider/Model 显示 -->
        <div class="upload-header__ai-info">
          <el-popover
            placement="bottom"
            :width="280"
            trigger="click"
            popper-class="upload-header__ai-popover"
          >
            <template #reference>
              <button class="upload-header__ai-btn" :disabled="aiAnalyzing">
                <span class="upload-header__ai-btn-icon">{{ aiConfig?.providerIcon || '🤖' }}</span>
                <span class="upload-header__ai-btn-text">{{
                  aiConfig?.modelName || 'AI 模型'
                }}</span>
                <span v-if="aiAnalyzing" class="upload-header__ai-btn-badge">
                  {{ aiAnalyzingCount }}
                </span>
                <span v-else class="upload-header__ai-btn-arrow">▼</span>
              </button>
            </template>

            <!-- AI 配置弹出层 -->
            <div class="upload-header__ai-dropdown">
              <div class="upload-header__ai-dropdown-section">
                <div class="upload-header__ai-dropdown-label">AI 服务商</div>
                <div class="upload-header__ai-dropdown-options">
                  <button
                    v-for="p in availableProviders"
                    :key="p.key"
                    class="upload-header__ai-dropdown-option"
                    :class="{
                      'upload-header__ai-dropdown-option--active': aiConfig?.provider === p.key
                    }"
                    @click="$emit('provider-change', p.key)"
                  >
                    <span>{{ p.icon }}</span>
                    <span>{{ p.name }}</span>
                    <span class="upload-header__ai-dropdown-source">{{ p.source }}</span>
                  </button>
                </div>
              </div>

              <div class="upload-header__ai-dropdown-section">
                <div class="upload-header__ai-dropdown-label">模型</div>
                <div class="upload-header__ai-dropdown-options">
                  <button
                    v-for="m in aiConfig?.availableModels || []"
                    :key="m.key"
                    class="upload-header__ai-dropdown-option"
                    :class="{
                      'upload-header__ai-dropdown-option--active': aiConfig?.modelKey === m.key
                    }"
                    @click="$emit('model-change', m.key)"
                  >
                    <span>{{ m.name }}</span>
                    <span v-if="m.recommended" class="upload-header__ai-dropdown-badge">推荐</span>
                  </button>
                </div>
              </div>
            </div>
          </el-popover>
        </div>
      </div>

      <!-- 手动模式：显示完整路径 -->
      <div
        v-else
        key="manual"
        class="upload-header__path"
        :class="{ 'upload-header__path--empty': !targetPath }"
      >
        <el-icon v-if="targetPath"><FolderOpened /></el-icon>
        <el-icon v-else><Warning /></el-icon>
        <span>{{ targetPath || '请先选择分类' }}</span>
      </div>
    </Transition>

    <!-- 操作按钮区域 -->
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
</template>

<script setup>
import { ref } from 'vue'
import { FolderOpened, Warning, Picture, Delete, Upload, Loading } from '@element-plus/icons-vue'

const props = defineProps({
  uploadMode: { type: String, default: 'ai' },
  currentSeries: { type: String, default: 'desktop' },
  targetPath: { type: String, default: '' },
  aiConfig: { type: Object, default: null },
  aiAnalyzing: { type: Boolean, default: false },
  aiAnalyzingCount: { type: Number, default: 0 },
  availableProviders: { type: Array, default: () => [] },
  filesCount: { type: Number, default: 0 },
  errorCount: { type: Number, default: 0 },
  uploading: { type: Boolean, default: false },
  progress: { type: Number, default: 0 },
  canUpload: { type: Boolean, default: true },
  canStartUpload: { type: Boolean, default: false }
})

const emit = defineEmits([
  'mode-change',
  'series-change',
  'provider-change',
  'model-change',
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

// 处理模式切换
async function handleModeChange(mode) {
  if (isSwitching.value || props.uploadMode === mode) return

  isSwitching.value = true
  emit('mode-change', mode)

  // 等待动画完成
  await new Promise(resolve => setTimeout(resolve, 400))
  isSwitching.value = false
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.upload-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-3;
  margin-bottom: $spacing-4;
  flex-shrink: 0;
  flex-wrap: wrap;
  min-height: 48px;

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

  // AI 配置区域
  &__ai-config {
    display: flex;
    align-items: center;
    gap: $spacing-3;
    flex: 1;
    min-width: 0;
    min-height: 48px;
  }

  // 系列选择
  &__series {
    display: flex;
    align-items: center;
    gap: $spacing-2;
    flex: 1;
    min-width: 0;

    &-label {
      font-size: $font-size-sm;
      color: $gray-400;
      flex-shrink: 0;
    }

    &-btns {
      display: flex;
      gap: $spacing-1;
    }

    &-btn {
      display: flex;
      align-items: center;
      gap: $spacing-1;
      padding: $spacing-2 $spacing-3;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: $radius-md;
      color: $gray-300;
      font-size: $font-size-sm;
      cursor: pointer;
      transition: all $duration-normal;

      &:hover:not(&--active) {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.2);
      }

      &--active {
        background: rgba($primary-start, 0.2);
        border-color: rgba($primary-start, 0.5);
        color: $white;
      }
    }
  }

  // AI 信息
  &__ai-info {
    display: flex;
    align-items: center;
    gap: $spacing-2;
  }

  &__ai-btn {
    display: flex;
    align-items: center;
    gap: $spacing-2;
    padding: $spacing-2 $spacing-3;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: $radius-md;
    color: $gray-200;
    font-size: $font-size-sm;
    cursor: pointer;
    transition: all $duration-normal;
    max-width: 180px;

    &:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba($primary-start, 0.4);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    &-icon {
      font-size: 14px;
      flex-shrink: 0;
    }

    &-text {
      max-width: 100px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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
      font-size: 10px;
      color: $gray-400;
      flex-shrink: 0;
    }
  }

  // AI 下拉菜单
  &__ai-dropdown {
    &-section {
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
    }

    &-option {
      display: flex;
      align-items: center;
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
    }

    &-source {
      margin-left: auto;
      font-size: $font-size-xs;
      color: $gray-500;
    }

    &-badge {
      font-size: 10px;
      padding: 1px 4px;
      background: rgba($success, 0.2);
      color: $success;
      border-radius: $radius-sm;
    }
  }

  // 手动模式路径
  &__path {
    flex: 1;
    display: flex;
    align-items: center;
    gap: $spacing-2;
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

  // 操作按钮
  &__actions {
    display: flex;
    align-items: center;
    gap: $spacing-2;
    flex-shrink: 0;
  }

  &__stats {
    display: flex;
    align-items: center;
    gap: $spacing-2;
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

// 模式切换动画
.mode-fade-enter-active,
.mode-fade-leave-active {
  transition: opacity 0.3s ease;
}

.mode-fade-enter-from,
.mode-fade-leave-to {
  opacity: 0;
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
