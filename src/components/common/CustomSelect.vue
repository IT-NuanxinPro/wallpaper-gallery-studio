<template>
  <div class="custom-select" :class="{ 'custom-select--open': isOpen }">
    <!-- 输入框 -->
    <div class="custom-select__input" @click="toggleDropdown">
      <input
        ref="inputRef"
        v-model="inputValue"
        type="text"
        :placeholder="placeholder"
        :readonly="!allowCreate"
        class="custom-select__field"
        @input="handleInput"
        @keydown="handleKeydown"
        @blur="handleBlur"
      />
      <div class="custom-select__suffix">
        <button
          v-if="clearable && modelValue"
          class="custom-select__clear"
          @click.stop="handleClear"
        >
          ×
        </button>
        <div class="custom-select__arrow" :class="{ 'custom-select__arrow--up': isOpen }">▼</div>
      </div>
    </div>

    <!-- 下拉面板 -->
    <Transition name="dropdown">
      <div v-if="isOpen" class="custom-select__dropdown">
        <div v-if="filteredOptions.length === 0" class="custom-select__empty">
          {{ allowCreate ? '输入新选项' : '暂无选项' }}
        </div>
        <div
          v-for="(option, index) in filteredOptions"
          :key="option"
          class="custom-select__option"
          :class="{
            'custom-select__option--selected': option === modelValue,
            'custom-select__option--highlighted': index === highlightedIndex
          }"
          @click="selectOption(option)"
          @mouseenter="highlightedIndex = index"
        >
          {{ option }}
        </div>
        <!-- 创建新选项 -->
        <div
          v-if="allowCreate && inputValue && !options.includes(inputValue)"
          class="custom-select__option custom-select__option--create"
          :class="{
            'custom-select__option--highlighted': highlightedIndex === filteredOptions.length
          }"
          @click="selectOption(inputValue)"
          @mouseenter="highlightedIndex = filteredOptions.length"
        >
          <span class="custom-select__create-icon">+</span>
          创建 "{{ inputValue }}"
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: '请选择' },
  allowCreate: { type: Boolean, default: false },
  clearable: { type: Boolean, default: false },
  filterable: { type: Boolean, default: true }
})

const emit = defineEmits(['update:modelValue', 'change'])

const inputRef = ref(null)
const isOpen = ref(false)
const inputValue = ref('')
const highlightedIndex = ref(-1)
const isTyping = ref(false) // 标记是否正在输入

// 过滤后的选项
const filteredOptions = computed(() => {
  // 如果不可过滤，或者不是在输入状态，显示所有选项
  if (!props.filterable || !isTyping.value || !inputValue.value.trim()) {
    return props.options
  }
  return props.options.filter(option =>
    option.toLowerCase().includes(inputValue.value.toLowerCase())
  )
})

// 监听 modelValue 变化
watch(
  () => props.modelValue,
  newValue => {
    inputValue.value = newValue || ''
  },
  { immediate: true }
)

// 切换下拉状态
function toggleDropdown() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    isTyping.value = false // 点击打开时不是输入状态
    nextTick(() => {
      if (props.allowCreate) {
        inputRef.value?.focus()
      }
    })
  }
}

// 处理输入
function handleInput() {
  isTyping.value = true // 标记为输入状态
  if (!isOpen.value) {
    isOpen.value = true
  }
  highlightedIndex.value = -1
}

// 处理键盘事件
function handleKeydown(e) {
  if (!isOpen.value && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
    isOpen.value = true
    return
  }

  if (!isOpen.value) return

  const maxIndex =
    filteredOptions.value.length +
    (props.allowCreate && inputValue.value && !props.options.includes(inputValue.value) ? 1 : 0) -
    1

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      highlightedIndex.value = highlightedIndex.value < maxIndex ? highlightedIndex.value + 1 : 0
      break
    case 'ArrowUp':
      e.preventDefault()
      highlightedIndex.value = highlightedIndex.value > 0 ? highlightedIndex.value - 1 : maxIndex
      break
    case 'Enter':
      e.preventDefault()
      if (highlightedIndex.value >= 0) {
        if (highlightedIndex.value < filteredOptions.value.length) {
          selectOption(filteredOptions.value[highlightedIndex.value])
        } else if (props.allowCreate && inputValue.value) {
          selectOption(inputValue.value)
        }
      } else if (props.allowCreate && inputValue.value) {
        selectOption(inputValue.value)
      }
      break
    case 'Escape':
      isOpen.value = false
      inputRef.value?.blur()
      break
  }
}

// 处理失焦
function handleBlur() {
  // 延迟关闭，允许点击选项
  setTimeout(() => {
    isOpen.value = false
    isTyping.value = false // 重置输入状态
    // 如果不允许创建且输入值不在选项中，恢复原值
    if (!props.allowCreate && !props.options.includes(inputValue.value)) {
      inputValue.value = props.modelValue || ''
    }
  }, 150)
}

// 选择选项
function selectOption(option) {
  inputValue.value = option
  emit('update:modelValue', option)
  emit('change', option)
  isOpen.value = false
  highlightedIndex.value = -1
}

// 清空
function handleClear() {
  inputValue.value = ''
  emit('update:modelValue', '')
  emit('change', '')
}

// 点击外部关闭
function handleClickOutside(e) {
  if (!e.target.closest('.custom-select')) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.custom-select {
  position: relative;
  width: 100%;

  &__input {
    position: relative;
    display: flex;
    align-items: center;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: $radius-lg;
    transition: all 0.2s ease;
    cursor: pointer;

    &:hover {
      border-color: rgba(255, 255, 255, 0.2);
    }

    .custom-select--open & {
      border-color: $primary-start;
      box-shadow: 0 0 0 3px rgba($primary-start, 0.15);
    }
  }

  &__field {
    flex: 1;
    padding: $spacing-3 $spacing-4;
    background: transparent;
    border: none;
    color: $white;
    font-size: $font-size-base;
    cursor: inherit;

    &::placeholder {
      color: $gray-500;
    }

    &:focus {
      outline: none;
      cursor: text;
    }

    &[readonly] {
      cursor: pointer;
    }
  }

  &__suffix {
    display: flex;
    align-items: center;
    gap: $spacing-1;
    padding-right: $spacing-3;
  }

  &__clear {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 50%;
    color: $gray-400;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
    }
  }

  &__arrow {
    color: $gray-400;
    font-size: 10px;
    transition: transform 0.2s ease;

    &--up {
      transform: rotate(180deg);
    }
  }

  &__dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 1000;
    margin-top: 4px;
    background: rgba(31, 41, 55, 0.98);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: $radius-lg;
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
    max-height: 200px;
    overflow-y: auto;

    &::-webkit-scrollbar {
      width: 6px;
    }

    &::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 3px;

      &:hover {
        background: rgba(255, 255, 255, 0.25);
      }
    }

    &::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 3px;
    }
  }

  &__empty {
    padding: $spacing-3 $spacing-4;
    color: $gray-500;
    font-size: $font-size-sm;
    text-align: center;
  }

  &__option {
    padding: $spacing-2 $spacing-4;
    color: $gray-300;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: $spacing-2;

    &:hover,
    &--highlighted {
      background: rgba($primary-start, 0.1);
      color: $white;
    }

    &--selected {
      background: rgba($primary-start, 0.2);
      color: $primary-start;
      font-weight: 500;
    }

    &--create {
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      color: $primary-start;
      font-weight: 500;

      &:hover,
      &--highlighted {
        background: rgba($primary-start, 0.15);
      }
    }
  }

  &__create-icon {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba($primary-start, 0.2);
    border-radius: 50%;
    font-size: 12px;
    font-weight: bold;
  }
}

// 下拉动画
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.95);
}
</style>
