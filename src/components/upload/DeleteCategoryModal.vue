<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" :style="{ zIndex }" @click.self="handleCancel">
        <div class="modal">
          <div class="modal__header">
            <h3>⚠️ 删除确认</h3>
            <button class="modal__close" :disabled="deleting" @click="handleCancel">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M1 1L13 13M1 13L13 1"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </div>

          <div class="modal__body">
            <div class="modal__warning">
              <span class="modal__warning-icon">🗑️</span>
              <div class="modal__warning-content">
                <p class="modal__warning-title">确定要删除分类「{{ categoryName }}」吗？</p>
                <p v-if="hasContent" class="modal__warning-desc">
                  {{ contentWarning }}
                </p>
                <p class="modal__warning-tip">删除后无法恢复</p>
              </div>
            </div>
          </div>

          <div class="modal__footer">
            <button
              class="modal__btn modal__btn--cancel"
              :disabled="deleting"
              @click="handleCancel"
            >
              取消
            </button>
            <button
              class="modal__btn modal__btn--danger"
              :disabled="deleting"
              @click="handleConfirm"
            >
              <span v-if="deleting" class="modal__btn-loading"></span>
              {{ deleting ? '删除中...' : '确认删除' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import { useModalZIndex } from '@/composables/useModalZIndex'

const props = defineProps({
  visible: { type: Boolean, default: false },
  categoryName: { type: String, default: '' },
  hasSubDirs: { type: Boolean, default: false },
  hasImages: { type: Boolean, default: false },
  deleting: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'confirm'])
const zIndex = useModalZIndex(() => props.visible)

const hasContent = computed(() => props.hasSubDirs || props.hasImages)

const contentWarning = computed(() => {
  const parts = []
  if (props.hasSubDirs) parts.push('包含子分类')
  if (props.hasImages) parts.push('包含图片')
  return parts.join('，')
})

function handleCancel() {
  if (!props.deleting) {
    emit('close')
  }
}

function handleConfirm() {
  emit('confirm')
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal {
  width: 100%;
  max-width: 420px;
  background: linear-gradient(145deg, rgba(31, 41, 55, 0.98), rgba(17, 24, 39, 0.98));
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: $radius-xl;
  box-shadow:
    0 25px 50px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  overflow: hidden;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: $spacing-5 $spacing-6;
    background: rgba(255, 255, 255, 0.02);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);

    h3 {
      color: $white;
      font-size: $font-size-lg;
      font-weight: 600;
      margin: 0;
    }
  }

  &__close {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: $radius-lg;
    color: $gray-400;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover:not(:disabled) {
      background: rgba(239, 68, 68, 0.1);
      border-color: rgba(239, 68, 68, 0.3);
      color: #ef4444;
      transform: rotate(90deg);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &__body {
    padding: $spacing-6;
  }

  &__warning {
    display: flex;
    gap: $spacing-4;
    padding: $spacing-4;
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: $radius-lg;

    &-icon {
      font-size: 32px;
      flex-shrink: 0;
    }

    &-content {
      flex: 1;
    }

    &-title {
      margin: 0 0 $spacing-2;
      font-size: $font-size-base;
      font-weight: 500;
      color: $white;
    }

    &-desc {
      margin: 0 0 $spacing-2;
      font-size: $font-size-sm;
      color: #fca5a5;
    }

    &-tip {
      margin: 0;
      font-size: $font-size-xs;
      color: $gray-400;
    }
  }

  &__footer {
    display: flex;
    justify-content: flex-end;
    gap: $spacing-3;
    padding: $spacing-4 $spacing-6;
    background: rgba(0, 0, 0, 0.2);
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  &__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: $spacing-2;
    padding: $spacing-3 $spacing-5;
    border: none;
    border-radius: $radius-lg;
    font-size: $font-size-sm;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;

    &--cancel {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: $gray-400;

      &:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.1);
        color: $white;
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    &--danger {
      background: linear-gradient(135deg, #ef4444, #dc2626);
      color: $white;
      min-width: 120px;

      &:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4);
      }

      &:active:not(:disabled) {
        transform: translateY(0);
      }

      &:disabled {
        opacity: 0.7;
        cursor: not-allowed;
        transform: none;
      }
    }

    &-loading {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

// 动画
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;

  .modal {
    transform: scale(0.95) translateY(10px);
  }
}

.modal-enter-active .modal,
.modal-leave-active .modal {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
</style>
