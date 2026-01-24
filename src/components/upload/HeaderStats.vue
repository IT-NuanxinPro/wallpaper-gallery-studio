<template>
  <div class="header-stats">
    <!-- 统计信息 -->
    <div class="header-stats__items">
      <div class="header-stats__item">
        <span class="header-stats__icon">🖥️</span>
        <span class="header-stats__value">
          <AnimatedNumber :value="stats.desktop" />
        </span>
      </div>
      <div class="header-stats__item">
        <span class="header-stats__icon">📱</span>
        <span class="header-stats__value">
          <AnimatedNumber :value="stats.mobile" />
        </span>
      </div>
      <div class="header-stats__item">
        <span class="header-stats__icon">👤</span>
        <span class="header-stats__value">
          <AnimatedNumber :value="stats.avatar" />
        </span>
      </div>
      <button class="header-stats__refresh" :disabled="loading" @click="$emit('refresh')">
        <el-icon :class="{ 'is-loading': loading }"><Refresh /></el-icon>
      </button>
    </div>

    <!-- API 配额 -->
    <div class="header-stats__quota">
      <div class="header-stats__quota-info">
        <span class="header-stats__quota-label">API</span>
        <span class="header-stats__quota-value">
          <AnimatedNumber :value="rateLimit.remaining" :duration="0.4" />/{{ rateLimit.limit }}
        </span>
      </div>
      <div class="header-stats__quota-bar">
        <div
          class="header-stats__quota-fill"
          :style="{ width: quotaPercent + '%' }"
          :class="quotaClass"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import AnimatedNumber from '@/components/common/AnimatedNumber.vue'

const props = defineProps({
  stats: { type: Object, required: true },
  rateLimit: { type: Object, required: true },
  loading: { type: Boolean, default: false }
})

defineEmits(['refresh'])

const quotaPercent = computed(() =>
  Math.round((props.rateLimit.remaining / props.rateLimit.limit) * 100)
)
const quotaClass = computed(() => {
  const p = quotaPercent.value
  if (p > 50) return 'header-stats__quota-fill--good'
  if (p > 20) return 'header-stats__quota-fill--warning'
  return 'header-stats__quota-fill--danger'
})
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.header-stats {
  display: flex;
  align-items: center;
  gap: $spacing-4;
  margin-left: auto;

  &__items {
    display: flex;
    align-items: center;
    gap: $spacing-2;
    padding: $spacing-2 $spacing-3;
    background: $glass-bg;
    backdrop-filter: blur($glass-blur);
    border: 1px solid $glass-border;
    border-radius: $radius-lg;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: $spacing-1;
    padding: $spacing-1 $spacing-2;
  }

  &__icon {
    font-size: 14px;
  }
  &__value {
    font-size: $font-size-sm;
    font-weight: 600;
    color: $white;
  }

  &__refresh {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: $radius-md;
    color: $gray-400;
    cursor: pointer;
    margin-left: $spacing-2;

    &:hover {
      background: rgba(255, 255, 255, 0.2);
      color: $white;
    }
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .is-loading {
      animation: spin 1s linear infinite;
    }
  }

  &__quota {
    display: flex;
    flex-direction: column;
    gap: $spacing-1;
    padding: $spacing-2 $spacing-3;
    background: $glass-bg;
    backdrop-filter: blur($glass-blur);
    border: 1px solid $glass-border;
    border-radius: $radius-lg;
    min-width: 120px;

    &-info {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
    }
    &-label {
      color: $gray-400;
    }
    &-value {
      color: $white;
      font-weight: 500;
    }
    &-bar {
      height: 3px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 2px;
      overflow: hidden;
    }
    &-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.3s ease;
      &--good {
        background: linear-gradient(90deg, #10b981, #34d399);
      }
      &--warning {
        background: linear-gradient(90deg, #f59e0b, #fbbf24);
      }
      &--danger {
        background: linear-gradient(90deg, #ef4444, #f87171);
      }
    }
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
