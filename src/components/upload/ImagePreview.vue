<template>
  <div class="image-preview" :class="{ 'image-preview--collapsed': collapsed }">
    <div class="image-preview__section">
      <div class="image-preview__header">
        <h3>
          <el-icon><Picture /></el-icon>预览
        </h3>
        <button
          v-if="collapsed"
          class="image-preview__toggle"
          :aria-label="collapsed ? '展开预览' : '收起预览'"
          @click="$emit('toggle')"
        >
          <el-icon class="image-preview__toggle-icon"
            ><ArrowDown v-if="collapsed" /><ArrowUp v-else
          /></el-icon>
        </button>
      </div>
      <div class="image-preview__body" :class="{ 'image-preview__body--hidden': collapsed }">
        <div class="image-preview__main">
          <Transition name="preview" mode="out-in">
            <div v-if="file" :key="file.id" class="image-preview__content">
              <div class="image-preview__img-wrapper">
                <img :src="file.preview" class="image-preview__img" />
              </div>
              <div class="image-preview__info">
                <p class="image-preview__name">{{ file.file.name }}</p>
                <div class="image-preview__meta">
                  <span>{{ formatSize(file.file.size) }}</span>
                  <span>{{ getFileType(file.file.type) }}</span>
                </div>
              </div>
            </div>
            <div v-else class="image-preview__empty">
              <el-icon class="image-preview__empty-icon"><Picture /></el-icon>
              <p>点击左侧图片预览</p>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Picture, ArrowDown, ArrowUp } from '@element-plus/icons-vue'
defineProps({
  collapsed: { type: Boolean, default: false },
  file: { type: Object, default: null }
})

defineEmits(['toggle'])

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function getFileType(type) {
  const map = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WebP' }
  return map[type] || type.split('/')[1]?.toUpperCase() || '未知'
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.image-preview {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;

  &__section {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--studio-surface);
    border: 1px solid var(--studio-border);
    border-radius: 16px;
    padding: $spacing-4;
    min-height: 0;
    overflow: hidden;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $spacing-3;
    flex-shrink: 0;
    margin-bottom: $spacing-3;

    h3 {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: $font-size-sm;
      font-weight: 600;
      color: $white;
      margin: 0;
    }
  }

  &__toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    color: $gray-400;
    font-size: $font-size-xs;
    cursor: pointer;
    transition: all $duration-normal;

    &:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.14);
      color: $white;
    }
  }

  &__toggle-icon {
    font-size: 11px;
    line-height: 1;
  }

  &__main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  &__body {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
    overflow: hidden;
    transition: opacity 0.34s ease;

    &--hidden {
      opacity: 0;
      pointer-events: none;
    }
  }

  &__content {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  &__img-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    background: rgba(0, 0, 0, 0.2);
    border-radius: $radius-lg;
    overflow: hidden;
  }

  &__img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    transition: opacity $duration-normal;
  }

  &__info {
    flex-shrink: 0;
    margin-top: $spacing-3;
    text-align: center;
  }

  &__name {
    font-size: $font-size-sm;
    color: $gray-300;
    margin: 0 0 $spacing-2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__meta {
    display: flex;
    justify-content: center;
    gap: $spacing-2;
    span {
      font-size: $font-size-xs;
      color: $gray-500;
      padding: $spacing-1 $spacing-2;
      background: rgba(255, 255, 255, 0.05);
      border-radius: $radius-sm;
    }
  }

  &__empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--studio-muted);
    &-icon {
      font-size: 30px;
      opacity: 1;
      margin-bottom: $spacing-3;
    }
    p {
      margin: 0;
      font-size: $font-size-sm;
    }
  }

  &--collapsed {
    .image-preview__section {
      padding: 12px $spacing-4;
    }

    .image-preview__header {
      margin-bottom: 0;
      min-height: 28px;
    }
  }
}

.preview-enter-active,
.preview-leave-active {
  transition: all $duration-normal $ease-out;
}
.preview-enter-from {
  opacity: 0;
  transform: scale(0.95);
}
.preview-leave-to {
  opacity: 0;
  transform: scale(1.02);
}
</style>
