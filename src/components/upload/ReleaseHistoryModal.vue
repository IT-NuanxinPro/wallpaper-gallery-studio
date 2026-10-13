<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="visible"
        class="release-modal__overlay"
        :style="{ zIndex }"
        @click.self="$emit('close')"
      >
        <div class="release-modal">
          <!-- 头部 -->
          <div class="release-modal__header">
            <h3 class="release-modal__title"><span>📦</span> 发布历史</h3>
            <button class="release-modal__close" @click="$emit('close')">
              <el-icon><Close /></el-icon>
            </button>
          </div>

          <!-- 统计概览 -->
          <div class="release-modal__summary">
            <div class="release-modal__summary-item">
              <span class="release-modal__summary-label">本周新增</span>
              <span class="release-modal__summary-value">{{ weeklyAdded }}</span>
            </div>
            <div class="release-modal__summary-item">
              <span class="release-modal__summary-label">本月新增</span>
              <span class="release-modal__summary-value">{{ monthlyAdded }}</span>
            </div>
            <div class="release-modal__summary-item">
              <span class="release-modal__summary-label">总发布</span>
              <span class="release-modal__summary-value">{{ releases.length }} 次</span>
            </div>
          </div>

          <!-- 趋势图 -->
          <div class="release-modal__chart">
            <div class="release-modal__chart-title">📈 增量趋势（最近10次）</div>
            <div class="release-modal__chart-bars">
              <div
                v-for="(item, index) in chartData"
                :key="index"
                class="release-modal__chart-bar-wrap"
              >
                <div class="release-modal__chart-bar-container">
                  <div
                    class="release-modal__chart-bar"
                    :style="{ height: item.height + '%' }"
                    :title="`${item.tag}: +${item.total}`"
                  >
                    <span class="release-modal__chart-bar-value">
                      {{ item.total }}
                    </span>
                  </div>
                </div>
                <div class="release-modal__chart-bar-label">
                  <span class="release-modal__chart-bar-version">{{ item.label }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 历史列表 -->
          <div class="release-modal__list">
            <div class="release-modal__list-title">📋 发布记录</div>
            <div class="release-modal__list-content">
              <div
                v-for="release in releases"
                :key="release.tag"
                class="release-modal__item"
                @click="openRelease(release.tag)"
              >
                <div class="release-modal__item-main">
                  <span class="release-modal__item-tag">{{ release.tag }}</span>
                  <span class="release-modal__item-date">
                    {{ release.date }}
                    <span v-if="release.publisher" class="release-modal__item-publisher">
                      · {{ release.publisher }}
                    </span>
                  </span>
                </div>
                <div class="release-modal__item-stats">
                  <span v-if="release.added.desktop > 0" class="release-modal__item-delta desktop">
                    🖥️ +{{ release.added.desktop }}
                  </span>
                  <span v-if="release.added.mobile > 0" class="release-modal__item-delta mobile">
                    📱 +{{ release.added.mobile }}
                  </span>
                  <span v-if="release.added.avatar > 0" class="release-modal__item-delta avatar">
                    👤 +{{ release.added.avatar }}
                  </span>
                  <span v-if="release.added.bing > 0" class="release-modal__item-delta bing">
                    🌄 +{{ release.added.bing }}
                  </span>
                  <span v-if="getTotalAdded(release) === 0" class="release-modal__item-delta empty">
                    无变更
                  </span>
                </div>
                <el-icon class="release-modal__item-arrow"><ArrowRight /></el-icon>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import { Close, ArrowRight } from '@element-plus/icons-vue'
import { useConfigStore } from '@/stores/config'
import { useModalZIndex } from '@/composables/useModalZIndex'

const props = defineProps({
  visible: { type: Boolean, default: false },
  statsData: { type: Object, default: null }
})

defineEmits(['close'])
const zIndex = useModalZIndex(() => props.visible)

const configStore = useConfigStore()

const releases = computed(() => props.statsData?.releases || [])

// 本周新增
const weeklyAdded = computed(() => {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  return releases.value
    .filter(r => new Date(r.date) >= weekAgo)
    .reduce((sum, r) => sum + getTotalAdded(r), 0)
})

// 本月新增
const monthlyAdded = computed(() => {
  const now = new Date()
  const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1)
  return releases.value
    .filter(r => new Date(r.date) >= monthAgo)
    .reduce((sum, r) => sum + getTotalAdded(r), 0)
})

// 图表数据
const chartData = computed(() => {
  const data = releases.value.slice(0, 10).reverse()
  const maxTotal = Math.max(...data.map(r => getTotalAdded(r)), 1)

  return data.map(r => {
    // 格式化日期为 M/D
    const date = new Date(r.date)
    const dateStr = `${date.getMonth() + 1}/${date.getDate()}`

    return {
      tag: r.tag,
      total: getTotalAdded(r),
      height: (getTotalAdded(r) / maxTotal) * 100,
      label: r.tag,
      date: dateStr
    }
  })
})

function getTotalAdded(release) {
  if (!release?.added) return 0
  return (
    (release.added.desktop || 0) +
    (release.added.mobile || 0) +
    (release.added.avatar || 0) +
    (release.added.bing || 0)
  )
}

function openRelease(tag) {
  const { owner, repo } = configStore.config
  window.open(`https://github.com/${owner}/${repo}/releases/tag/${tag}`, '_blank')
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.release-modal {
  width: 90%;
  max-width: 720px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, rgba(30, 30, 50, 0.95), rgba(20, 20, 40, 0.98));
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: $radius-2xl;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
  overflow: hidden;

  &__overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: $spacing-4 $spacing-5;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  &__title {
    display: flex;
    align-items: center;
    gap: $spacing-2;
    font-size: $font-size-lg;
    font-weight: 600;
    color: $white;
    margin: 0;
  }

  &__close {
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
      background: rgba(255, 255, 255, 0.1);
      color: $white;
    }
  }

  &__summary {
    display: flex;
    gap: $spacing-3;
    padding: $spacing-4 $spacing-5;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);

    &-item {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: $spacing-1;
      padding: $spacing-3;
      background: rgba(255, 255, 255, 0.03);
      border-radius: $radius-lg;
    }

    &-label {
      font-size: $font-size-xs;
      color: $gray-400;
    }

    &-value {
      font-size: $font-size-xl;
      font-weight: 700;
      background: $primary-gradient;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
  }

  &__chart {
    padding: $spacing-4 $spacing-5;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);

    &-title {
      font-size: $font-size-sm;
      color: $gray-300;
      margin-bottom: $spacing-3;
    }

    &-bars {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      height: 100px;
      gap: $spacing-1;
    }

    &-bar-wrap {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      height: 100%;
    }

    &-bar-container {
      flex: 1;
      width: 100%;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }

    &-bar {
      width: 100%;
      max-width: 40px;
      min-height: 4px;
      background: $primary-gradient;
      border-radius: $radius-sm $radius-sm 0 0;
      position: relative;
      transition: height 0.3s ease;
      cursor: pointer;

      &:hover {
        filter: brightness(1.2);
      }

      &-value {
        position: absolute;
        top: -18px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 10px;
        color: $gray-300;
        white-space: nowrap;
      }
    }

    &-bar-label {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-top: $spacing-1;
      flex-shrink: 0;
    }

    &-bar-version {
      font-size: 9px;
      color: $gray-400;
      font-weight: 500;
    }
  }

  &__list {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: $spacing-4 $spacing-5;

    &-title {
      font-size: $font-size-sm;
      color: $gray-300;
      margin-bottom: $spacing-3;
      flex-shrink: 0;
    }

    &-content {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: $spacing-2;

      &::-webkit-scrollbar {
        width: 4px;
      }

      &::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 2px;
      }
    }
  }

  &__item {
    display: flex;
    align-items: center;
    gap: $spacing-3;
    padding: $spacing-3;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid transparent;
    border-radius: $radius-lg;
    cursor: pointer;
    transition: all $duration-normal;

    &:hover {
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(255, 255, 255, 0.1);
    }

    &-main {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 80px;
    }

    &-tag {
      font-size: $font-size-sm;
      font-weight: 600;
      color: $white;
    }

    &-date {
      font-size: $font-size-xs;
      color: $gray-500;
    }

    &-publisher {
      color: $primary-start;
      font-weight: 500;
    }

    &-stats {
      flex: 1;
      display: flex;
      flex-wrap: wrap;
      gap: $spacing-2;
    }

    &-delta {
      font-size: $font-size-xs;
      padding: 2px 6px;
      border-radius: $radius-sm;

      &.desktop {
        background: rgba($primary-start, 0.15);
        color: $primary-start;
      }

      &.mobile {
        background: rgba($success, 0.15);
        color: $success;
      }

      &.avatar {
        background: rgba($warning, 0.15);
        color: $warning;
      }

      &.bing {
        background: rgba(#60a5fa, 0.15);
        color: #60a5fa;
      }

      &.empty {
        background: rgba(255, 255, 255, 0.05);
        color: $gray-500;
      }
    }

    &-arrow {
      color: $gray-500;
      font-size: 14px;
      flex-shrink: 0;
    }
  }
}

// 动画
.modal-enter-active {
  transition: opacity 0.2s ease;

  .release-modal {
    transition: transform 0.2s ease;
  }
}

.modal-leave-active {
  transition: opacity 0.15s ease;

  .release-modal {
    transition: transform 0.15s ease;
  }
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;

  .release-modal {
    transform: scale(0.95) translateY(10px);
  }
}

.modal-enter-to,
.modal-leave-from {
  opacity: 1;

  .release-modal {
    transform: scale(1) translateY(0);
  }
}
</style>
