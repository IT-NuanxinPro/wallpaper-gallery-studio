<template>
  <div class="stats-bar">
    <div class="stats-bar__title">
      <span>📊</span>
      壁纸统计
    </div>
    <div class="stats-bar__items">
      <div class="stats-bar__item stats-bar__item--desktop">
        <span class="stats-bar__icon">🖥️</span>
        <span class="stats-bar__label">桌面</span>
        <span class="stats-bar__count">
          <AnimatedNumber :value="statsData?.total?.desktop || 0" :delay="1.2" />
        </span>
        <span v-if="latestRelease?.added?.desktop > 0" class="stats-bar__delta">
          +{{ latestRelease.added.desktop }}
        </span>
      </div>
      <div class="stats-bar__item stats-bar__item--mobile">
        <span class="stats-bar__icon">📱</span>
        <span class="stats-bar__label">手机</span>
        <span class="stats-bar__count">
          <AnimatedNumber :value="statsData?.total?.mobile || 0" :delay="1.2" />
        </span>
        <span v-if="latestRelease?.added?.mobile > 0" class="stats-bar__delta">
          +{{ latestRelease.added.mobile }}
        </span>
      </div>
      <div class="stats-bar__item stats-bar__item--avatar">
        <span class="stats-bar__icon">👤</span>
        <span class="stats-bar__label">头像</span>
        <span class="stats-bar__count">
          <AnimatedNumber :value="statsData?.total?.avatar || 0" :delay="1.2" />
        </span>
        <span v-if="latestRelease?.added?.avatar > 0" class="stats-bar__delta">
          +{{ latestRelease.added.avatar }}
        </span>
      </div>
    </div>
    <button class="stats-bar__history-btn" @click="$emit('show-history')">
      <el-icon><Clock /></el-icon>
      发布历史
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Clock } from '@element-plus/icons-vue'
import AnimatedNumber from '@/components/common/AnimatedNumber.vue'

const props = defineProps({
  statsData: { type: Object, default: null }
})

defineEmits(['show-history'])

const latestRelease = computed(() => props.statsData?.releases?.[0] || null)
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.stats-bar {
  display: flex;
  align-items: center;
  gap: $spacing-4;
  padding: $spacing-3 $spacing-4;
  background: $glass-bg;
  backdrop-filter: blur($glass-blur);
  border: 1px solid $glass-border;
  border-radius: $radius-xl;
  flex-shrink: 0;

  &__title {
    display: flex;
    align-items: center;
    gap: $spacing-2;
    font-size: $font-size-sm;
    font-weight: 600;
    color: $gray-300;
    white-space: nowrap;
  }

  &__items {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: $spacing-4;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: $spacing-1;
    padding: $spacing-2 $spacing-3;
    background: rgba(255, 255, 255, 0.03);
    border-radius: $radius-lg;
    border-left: 3px solid transparent;

    &--desktop {
      border-left-color: $primary-start;
    }

    &--mobile {
      border-left-color: $success;
    }

    &--avatar {
      border-left-color: $warning;
    }
  }

  &__icon {
    font-size: 14px;
  }

  &__label {
    font-size: $font-size-xs;
    color: $gray-500;
    margin-right: $spacing-1;
  }

  &__count {
    font-size: $font-size-sm;
    font-weight: 600;
    color: $white;
  }

  &__delta {
    font-size: 10px;
    color: $success;
    font-weight: 500;
    padding: 1px 4px;
    background: rgba($success, 0.15);
    border-radius: $radius-sm;
  }

  &__history-btn {
    display: flex;
    align-items: center;
    gap: $spacing-1;
    padding: $spacing-2 $spacing-3;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: $radius-lg;
    color: $gray-300;
    font-size: $font-size-xs;
    cursor: pointer;
    transition: all $duration-normal;
    white-space: nowrap;

    &:hover {
      background: rgba($primary-start, 0.1);
      border-color: rgba($primary-start, 0.3);
      color: $primary-start;
    }

    .el-icon {
      font-size: 12px;
    }
  }
}
</style>
