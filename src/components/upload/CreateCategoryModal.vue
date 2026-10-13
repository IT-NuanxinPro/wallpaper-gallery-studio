<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" :style="{ zIndex }" @click.self="$emit('close')">
        <div class="modal">
          <div class="modal__header">
            <h3>📁 {{ modalTitle }}</h3>
            <button class="modal__close" @click="$emit('close')">
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
            <!-- 有父分类时，只能创建二级分类 -->
            <template v-if="parentCategory">
              <div class="modal__info">
                <div class="modal__info-icon">📂</div>
                <div class="modal__info-content">
                  <span class="modal__info-label">父分类</span>
                  <span class="modal__info-value">{{ parentCategory }}</span>
                </div>
              </div>
            </template>

            <!-- 没有父分类时，只能创建一级分类 -->
            <template v-else>
              <div class="modal__hint">
                <span class="modal__hint-icon">💡</span>
                <span>将在当前系列下创建一级分类</span>
              </div>
            </template>

            <div class="modal__form-group">
              <label>分类名称</label>
              <input
                ref="inputRef"
                v-model="form.name"
                type="text"
                class="modal__input"
                placeholder="请输入分类名称"
                maxlength="20"
                @keyup.enter="handleCreate"
              />
              <span class="modal__input-hint">支持中文、英文、数字，最多20个字符</span>
            </div>
          </div>

          <div class="modal__footer">
            <button class="modal__btn modal__btn--cancel" @click="$emit('close')">取消</button>
            <button
              class="modal__btn modal__btn--confirm"
              :disabled="creating || !form.name?.trim()"
              @click="handleCreate"
            >
              <span v-if="creating" class="modal__btn-loading"></span>
              {{ creating ? '创建中...' : '确认创建' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { reactive, computed, watch, ref, nextTick } from 'vue'
import { useModalZIndex } from '@/composables/useModalZIndex'

const props = defineProps({
  visible: { type: Boolean, default: false },
  parentCategory: { type: String, default: '' },
  creating: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'create'])
const zIndex = useModalZIndex(() => props.visible)

const inputRef = ref(null)
const form = reactive({ name: '' })

const modalTitle = computed(() => {
  return props.parentCategory ? '新建二级分类' : '新建一级分类'
})

watch(
  () => props.visible,
  v => {
    if (v) {
      form.name = ''
      // 自动聚焦输入框
      nextTick(() => {
        inputRef.value?.focus()
      })
    }
  }
)

function handleCreate() {
  if (!form.name?.trim()) return
  emit('create', {
    level: props.parentCategory ? 'l2' : 'l1',
    name: form.name.trim()
  })
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

    &:hover {
      background: rgba(239, 68, 68, 0.1);
      border-color: rgba(239, 68, 68, 0.3);
      color: #ef4444;
      transform: rotate(90deg);
    }
  }

  &__body {
    padding: $spacing-6;
  }

  &__info {
    display: flex;
    align-items: center;
    gap: $spacing-4;
    padding: $spacing-4;
    background: rgba($primary-start, 0.08);
    border: 1px solid rgba($primary-start, 0.2);
    border-radius: $radius-lg;
    margin-bottom: $spacing-5;

    &-icon {
      font-size: 24px;
    }

    &-content {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    &-label {
      font-size: $font-size-xs;
      color: $gray-400;
    }

    &-value {
      font-size: $font-size-base;
      color: $white;
      font-weight: 500;
    }
  }

  &__hint {
    display: flex;
    align-items: center;
    gap: $spacing-3;
    padding: $spacing-3 $spacing-4;
    background: rgba(251, 191, 36, 0.08);
    border: 1px solid rgba(251, 191, 36, 0.2);
    border-radius: $radius-lg;
    margin-bottom: $spacing-5;
    font-size: $font-size-sm;
    color: $gray-300;

    &-icon {
      font-size: 16px;
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

  &__form-group {
    label {
      display: block;
      color: $gray-300;
      font-size: $font-size-sm;
      font-weight: 500;
      margin-bottom: $spacing-2;
    }
  }

  &__input {
    width: 100%;
    padding: $spacing-3 $spacing-4;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: $radius-lg;
    color: $white;
    font-size: $font-size-base;
    transition: all 0.2s ease;

    &::placeholder {
      color: $gray-500;
    }

    &:hover {
      border-color: rgba(255, 255, 255, 0.2);
    }

    &:focus {
      outline: none;
      border-color: $primary-start;
      box-shadow: 0 0 0 3px rgba($primary-start, 0.15);
      background: rgba(0, 0, 0, 0.4);
    }

    &-hint {
      display: block;
      margin-top: $spacing-2;
      font-size: $font-size-xs;
      color: $gray-500;
    }
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

      &:hover {
        background: rgba(255, 255, 255, 0.1);
        color: $white;
      }
    }

    &--confirm {
      background: $primary-gradient;
      color: $white;
      min-width: 120px;

      &:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 4px 20px rgba($primary-start, 0.4);
      }

      &:active:not(:disabled) {
        transform: translateY(0);
      }

      &:disabled {
        opacity: 0.5;
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
