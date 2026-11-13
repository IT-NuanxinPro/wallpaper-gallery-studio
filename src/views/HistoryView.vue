<template>
  <MainLayout>
    <div ref="viewRef" class="history-view">
      <GlassCard :hoverable="false" class="history-view__card">
        <div class="history-view__header">
          <h2 class="history-view__title">上传历史</h2>
          <div class="history-view__stats">
            <span class="history-view__stat history-view__stat--success">
              <el-icon><CircleCheck /></el-icon>
              {{ historyStore.successCount }} 成功
            </span>
            <span class="history-view__stat history-view__stat--error">
              <el-icon><CircleClose /></el-icon>
              {{ historyStore.errorCount }} 失败
            </span>
          </div>
          <el-button
            v-if="historyStore.records.length > 0"
            type="danger"
            plain
            size="small"
            @click="handleClearHistory"
          >
            清空历史
          </el-button>
        </div>

        <div class="history-view__body">
          <Transition name="studio-panel">
            <div v-if="historyStore.records.length === 0" key="empty" class="history-view__empty">
              <el-empty description="暂无上传记录" />
            </div>

            <TransitionGroup
              v-else
              key="records"
              name="studio-list"
              tag="div"
              class="history-view__list"
              data-scroll-region
            >
              <div
                v-for="(records, date) in groupedRecords"
                :key="date"
                class="history-view__group"
              >
                <button
                  type="button"
                  class="history-view__date-header"
                  :aria-expanded="!!expandedDates[date]"
                  @click="toggleDate(date)"
                >
                  <el-icon
                    class="history-view__date-arrow"
                    :class="{ 'is-expanded': expandedDates[date] }"
                  >
                    <ArrowRight />
                  </el-icon>
                  <span class="history-view__date">{{ date }}</span>
                  <span class="history-view__date-count">{{ records.length }} 条</span>
                </button>
                <el-collapse-transition>
                  <TransitionGroup
                    v-show="expandedDates[date]"
                    name="studio-list"
                    tag="div"
                    class="history-view__items"
                  >
                    <div
                      v-for="record in records"
                      :key="record.id"
                      class="history-view__item"
                      :class="`history-view__item--${record.status}`"
                      @click="showPreview(record)"
                    >
                      <div class="history-view__item-icon">
                        <el-icon
                          v-if="record.status === 'success'"
                          class="history-view__icon--success"
                        >
                          <CircleCheck />
                        </el-icon>
                        <el-icon v-else class="history-view__icon--error">
                          <CircleClose />
                        </el-icon>
                      </div>
                      <div class="history-view__item-info">
                        <span class="history-view__item-name">{{ record.filename }}</span>
                        <span class="history-view__item-category">{{ record.category }}</span>
                      </div>
                      <div class="history-view__item-time">
                        {{ formatTime(record.timestamp) }}
                      </div>
                    </div>
                  </TransitionGroup>
                </el-collapse-transition>
              </div>
            </TransitionGroup>
          </Transition>
        </div>
      </GlassCard>

      <el-dialog
        v-model="previewVisible"
        :title="previewRecord?.filename"
        class="history-view__preview-dialog"
      >
        <div class="history-view__preview">
          <p><strong>分类：</strong>{{ previewRecord?.category }}</p>
          <p><strong>系列：</strong>{{ previewRecord?.series }}</p>
          <p><strong>状态：</strong>{{ previewRecord?.status === 'success' ? '成功' : '失败' }}</p>
          <p>
            <strong>时间：</strong
            >{{ previewRecord ? formatDateTime(previewRecord.timestamp) : '' }}
          </p>
        </div>
      </el-dialog>
    </div>
  </MainLayout>
</template>

<script setup>
import { ref, computed, reactive, watch } from 'vue'
import { CircleCheck, CircleClose, ArrowRight } from '@element-plus/icons-vue'
import { ElMessageBox, ElMessage, ElCollapseTransition } from 'element-plus'
import MainLayout from '@/components/MainLayout.vue'
import GlassCard from '@/components/GlassCard.vue'
import { useHistoryStore } from '@/stores/history'

const historyStore = useHistoryStore()

const viewRef = ref(null)
const previewVisible = ref(false)
const previewRecord = ref(null)
const initialized = ref(false)

const expandedDates = reactive({})

const groupedRecords = computed(() => historyStore.getRecordsByDate())

watch(
  groupedRecords,
  records => {
    if (!initialized.value && Object.keys(records).length > 0) {
      const firstDate = Object.keys(records)[0]
      expandedDates[firstDate] = true
      initialized.value = true
    }
  },
  { immediate: true }
)

function toggleDate(date) {
  expandedDates[date] = !expandedDates[date]
}

function showPreview(record) {
  previewRecord.value = record
  previewVisible.value = true
}

async function handleClearHistory() {
  try {
    await ElMessageBox.confirm('确定要清空所有上传历史吗？此操作不可恢复。', '清空确认', {
      confirmButtonText: '确定清空',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger'
    })
    historyStore.clearHistory()
    ElMessage.success('历史记录已清空')
  } catch {
    return
  }
}

function formatTime(timestamp) {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function formatDateTime(timestamp) {
  return new Date(timestamp).toLocaleString('zh-CN')
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.history-view {
  display: flex;
  flex: 1;
  min-height: 0;
  height: 100%;
  padding: 0;
  overflow: hidden;

  &__card {
    flex: 1;
    min-height: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  &__header {
    flex-wrap: wrap;
    display: flex;
    align-items: center;
    gap: $spacing-4;
    margin-bottom: $spacing-4;
    padding-bottom: $spacing-4;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    flex-shrink: 0;
  }

  &__title {
    font-size: $font-size-xl;
    font-weight: 600;
    color: $white;
    margin: 0;
    flex: 1;
  }

  &__stats {
    display: flex;
    gap: $spacing-4;
  }

  &__stat {
    display: flex;
    align-items: center;
    gap: $spacing-1;
    font-size: $font-size-sm;

    &--success {
      color: $success;
    }

    &--error {
      color: $danger;
    }
  }

  &__body {
    position: relative;
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  &__body > .studio-panel-leave-active {
    position: absolute;
    inset: 0;
  }
  &__empty {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: $spacing-8;
  }

  &__list {
    position: relative;
    min-height: 0;
    flex: 1;
    overflow-y: auto;
    padding-right: $spacing-2;

    &::-webkit-scrollbar {
      width: 6px;
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }

    &::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 3px;
    }
  }

  &__group {
    margin-bottom: $spacing-3;
  }

  &__date-header {
    width: 100%;
    border: 0;
    text-align: left;
    display: flex;
    align-items: center;
    gap: $spacing-2;
    padding: $spacing-2 $spacing-3;
    background: rgba(255, 255, 255, 0.05);
    border-radius: $radius-md;
    cursor: pointer;
    transition: background $duration-normal;
    margin-bottom: $spacing-2;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
    }
  }

  &__date-arrow {
    color: $gray-400;
    font-size: 12px;
    transition: transform $duration-normal;

    &.is-expanded {
      transform: rotate(90deg);
    }
  }

  &__date {
    color: $gray-300;
    font-size: $font-size-sm;
    font-weight: 500;
    flex: 1;
  }

  &__date-count {
    color: $gray-500;
    font-size: $font-size-xs;
  }

  &__items {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: $spacing-2;
    padding-left: $spacing-4;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: $spacing-3;
    padding: $spacing-3;
    background: rgba(255, 255, 255, 0.05);
    border-radius: $radius-md;
    cursor: pointer;
    transition: background $duration-normal;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    &--success {
      border-left: 3px solid $success;
    }

    &--error {
      border-left: 3px solid $danger;
    }

    &-icon {
      flex-shrink: 0;
    }

    &-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    &-name {
      color: $gray-200;
      font-size: $font-size-sm;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    &-category {
      color: $gray-500;
      font-size: $font-size-xs;
    }

    &-time {
      color: $gray-500;
      font-size: $font-size-xs;
      flex-shrink: 0;
    }
  }

  &__icon {
    &--success {
      color: $success;
    }

    &--error {
      color: $danger;
    }
  }

  &__preview {
    p {
      margin-bottom: $spacing-2;
      color: var(--studio-muted);
    }
  }

  :deep(.history-view__preview-dialog) {
    width: 90%;
    max-width: 600px;
  }
}

.history-view__items > .studio-list-enter-active,
.history-view__items > .studio-list-leave-active,
.history-view__items > .studio-list-move {
  transition:
    opacity 220ms var(--studio-ease-out),
    transform 240ms var(--studio-ease-out),
    background-color 140ms ease;
}
.history-view__date-header:focus-visible {
  outline: 2px solid var(--studio-accent);
  outline-offset: 2px;
}
@media (max-width: 600px) {
  .history-view__header {
    gap: 12px;
  }
  .history-view__title {
    flex-basis: 100%;
    font-size: 20px;
  }
  .history-view__stats {
    flex: 1;
    gap: 12px;
  }
  .history-view__stat {
    font-size: 12px;
  }
  .history-view__items {
    padding-left: 4px;
  }
  .history-view__empty {
    padding: 16px;
  }
}
</style>
