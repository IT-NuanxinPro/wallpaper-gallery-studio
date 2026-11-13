<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div
        v-if="visible"
        class="confirm-dialog__overlay"
        :style="{ zIndex }"
        @click.self="handleCancel"
      >
        <div class="confirm-dialog">
          <div class="confirm-dialog__header">
            <el-icon
              class="confirm-dialog__icon"
              :class="`confirm-dialog__icon--${type}`"
              :size="32"
            >
              <component :is="iconComponent" />
            </el-icon>
            <h3 class="confirm-dialog__title">{{ title }}</h3>
          </div>

          <div class="confirm-dialog__content">
            <p>{{ message }}</p>

            <div v-if="requireInput" class="confirm-dialog__input">
              <p class="confirm-dialog__input-hint">
                请输入 <strong>{{ confirmText }}</strong> 以确认操作
              </p>
              <el-input v-model="inputValue" :placeholder="confirmText" />
            </div>
          </div>

          <div class="confirm-dialog__footer">
            <el-button @click="handleCancel">{{ cancelText }}</el-button>
            <el-button
              :type="type === 'danger' ? 'danger' : 'primary'"
              :disabled="requireInput && inputValue !== confirmText"
              :loading="loading"
              @click="handleConfirm"
            >
              {{ confirmButtonText }}
            </el-button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Warning, CircleCheck, CircleClose, InfoFilled } from '@element-plus/icons-vue'
import { useModalZIndex } from '@/composables/useModalZIndex'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: '确认'
  },
  message: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    default: 'warning',
    validator: v => ['warning', 'danger', 'success', 'info'].includes(v)
  },
  confirmButtonText: {
    type: String,
    default: '确定'
  },
  cancelText: {
    type: String,
    default: '取消'
  },
  requireInput: {
    type: Boolean,
    default: false
  },
  confirmText: {
    type: String,
    default: 'DELETE'
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['confirm', 'cancel', 'update:visible'])
const zIndex = useModalZIndex(() => props.visible)

const inputValue = ref('')

const iconComponent = computed(() => {
  const icons = {
    warning: Warning,
    danger: CircleClose,
    success: CircleCheck,
    info: InfoFilled
  }
  return icons[props.type] || Warning
})

function handleConfirm() {
  emit('confirm')
}

function handleCancel() {
  emit('cancel')
  emit('update:visible', false)
}

watch(
  () => props.visible,
  val => {
    if (val) {
      inputValue.value = ''
    }
  }
)
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.confirm-dialog {
  &__overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  background: $glass-bg;
  backdrop-filter: blur($glass-blur);
  border: 1px solid $glass-border;
  border-radius: $radius-lg;
  padding: $spacing-6;
  width: 100%;
  max-width: 400px;
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  overscroll-behavior: contain;
  box-shadow: $shadow-xl;

  &__header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: $spacing-3;
    margin-bottom: $spacing-4;
  }

  &__icon {
    &--warning {
      color: $warning;
    }

    &--danger {
      color: $danger;
    }

    &--success {
      color: $success;
    }

    &--info {
      color: $info;
    }
  }

  &__title {
    font-size: $font-size-lg;
    font-weight: 600;
    color: $white;
    margin: 0;
  }

  &__content {
    text-align: center;
    color: $gray-300;
    margin-bottom: $spacing-6;

    p {
      margin: 0;
    }
  }

  &__input {
    margin-top: $spacing-4;

    &-hint {
      font-size: $font-size-sm;
      color: $gray-400;
      margin-bottom: $spacing-2;

      strong {
        color: $danger;
      }
    }
  }

  &__footer {
    display: flex;
    justify-content: center;
    gap: $spacing-3;
  }
}

.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 180ms ease;
  .confirm-dialog {
    transition:
      transform 240ms var(--studio-ease-out),
      opacity 180ms ease;
  }
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
  .confirm-dialog {
    opacity: 0;
    transform: translateY(-8px) scale(0.97);
  }
}
</style>
