<template>
  <el-dialog
    v-model="visible"
    title="上传进度"
    width="520px"
    :close-on-click-modal="false"
    :close-on-press-escape="!uploading"
    :show-close="!uploading"
    class="upload-progress-modal"
    align-center
  >
    <div class="upload-progress">
      <!-- 总体进度 -->
      <div class="upload-progress__summary">
        <div class="upload-progress__stats">
          <span class="upload-progress__stat">
            <span class="upload-progress__stat-value">{{ successCount }}</span>
            <span class="upload-progress__stat-label">成功</span>
          </span>
          <span v-if="errorCount > 0" class="upload-progress__stat upload-progress__stat--error">
            <span class="upload-progress__stat-value">{{ errorCount }}</span>
            <span class="upload-progress__stat-label">失败</span>
          </span>
          <span class="upload-progress__stat">
            <span class="upload-progress__stat-value">{{ pendingCount }}</span>
            <span class="upload-progress__stat-label">等待</span>
          </span>
        </div>
        <el-progress
          :percentage="totalProgress"
          :status="progressStatus"
          :stroke-width="8"
          class="upload-progress__bar"
        />
        <p class="upload-progress__hint">
          {{ uploading ? `正在上传 ${currentIndex + 1}/${totalCount}...` : statusText }}
        </p>
      </div>

      <!-- 文件列表 -->
      <div class="upload-progress__list">
        <div
          v-for="file in displayFiles"
          :key="file.id"
          class="upload-progress__item"
          :class="`upload-progress__item--${file.status}`"
        >
          <img :src="file.preview" class="upload-progress__item-thumb" />
          <div class="upload-progress__item-info">
            <span class="upload-progress__item-name">{{ file.name }}</span>
            <span class="upload-progress__item-status">
              <template v-if="file.status === 'pending'">等待上传</template>
              <template v-else-if="file.status === 'uploading'">
                <el-icon class="is-loading"><Loading /></el-icon>
                上传中 {{ file.progress }}%
              </template>
              <template v-else-if="file.status === 'success'">
                <el-icon><CircleCheck /></el-icon>
                上传成功
              </template>
              <template v-else-if="file.status === 'error'">
                <el-icon><CircleClose /></el-icon>
                {{ file.error || '上传失败' }}
              </template>
            </span>
          </div>
          <el-progress
            v-if="file.status === 'uploading'"
            type="circle"
            :percentage="file.progress"
            :width="40"
            :stroke-width="4"
            :show-text="false"
            class="upload-progress__item-circle"
          />
          <span
            v-else-if="file.status === 'success'"
            class="upload-progress__item-badge upload-progress__item-badge--success"
            >✓</span
          >
          <span
            v-else-if="file.status === 'error'"
            class="upload-progress__item-badge upload-progress__item-badge--error"
            >!</span
          >
        </div>
      </div>
    </div>

    <template #footer>
      <div class="upload-progress__footer">
        <el-button v-if="!uploading && errorCount > 0" type="warning" @click="$emit('retry')">
          重试失败
        </el-button>
        <el-button v-if="!uploading" type="primary" @click="handleClose">
          {{ errorCount > 0 ? '关闭' : '完成' }}
        </el-button>
        <el-button v-else disabled>上传中...</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Loading, CircleCheck, CircleClose } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  files: { type: Array, default: () => [] },
  uploading: { type: Boolean, default: false },
  currentIndex: { type: Number, default: -1 }
})

const emit = defineEmits(['update:modelValue', 'retry', 'close'])

const visible = computed({
  get: () => props.modelValue,
  set: val => emit('update:modelValue', val)
})

// 保存文件快照和统计（不受外部文件清理影响）
const snapshotFiles = ref([])
const finalStats = ref({ success: 0, error: 0, total: 0 })

// 显示用的文件列表（优先使用快照）
const displayFiles = computed(() => {
  // 上传中或有文件时显示实时数据
  if (props.uploading || props.files.length > 0) {
    return props.files
  }
  // 上传结束且文件被清理后显示快照
  return snapshotFiles.value
})

// 统计数据
const totalCount = computed(() => displayFiles.value.length || finalStats.value.total)
const successCount = computed(() => {
  if (displayFiles.value.length > 0) {
    return displayFiles.value.filter(f => f.status === 'success').length
  }
  return finalStats.value.success
})
const errorCount = computed(() => {
  if (displayFiles.value.length > 0) {
    return displayFiles.value.filter(f => f.status === 'error').length
  }
  return finalStats.value.error
})
const pendingCount = computed(() => displayFiles.value.filter(f => f.status === 'pending').length)

const totalProgress = computed(() => {
  const total = totalCount.value
  if (total === 0) return 100
  const completed = successCount.value + errorCount.value
  return Math.round((completed / total) * 100)
})

const progressStatus = computed(() => {
  if (props.uploading) return ''
  if (errorCount.value > 0) return 'warning'
  return 'success'
})

const statusText = computed(() => {
  if (props.uploading) return '上传中...'
  if (errorCount.value > 0) return `完成，${errorCount.value} 个文件上传失败`
  return '全部上传成功！'
})

// 监听上传状态变化，在上传结束时保存快照
watch(
  () => props.uploading,
  (newVal, oldVal) => {
    if (oldVal && !newVal && props.files.length > 0) {
      // 上传刚结束，保存文件快照和统计
      snapshotFiles.value = props.files.map(f => ({
        id: f.id,
        name: f.name,
        preview: f.preview,
        status: f.status,
        progress: f.progress,
        error: f.error
      }))
      finalStats.value = {
        success: props.files.filter(f => f.status === 'success').length,
        error: props.files.filter(f => f.status === 'error').length,
        total: props.files.length
      }
    }
  }
)

// 弹窗打开时重置
watch(
  () => props.modelValue,
  val => {
    if (val && props.uploading) {
      snapshotFiles.value = []
      finalStats.value = { success: 0, error: 0, total: 0 }
    }
  }
)

function handleClose() {
  // 关闭时清理快照
  snapshotFiles.value = []
  finalStats.value = { success: 0, error: 0, total: 0 }
  emit('close')
  visible.value = false
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.upload-progress {
  &__summary {
    text-align: center;
    margin-bottom: $spacing-4;
    padding-bottom: $spacing-4;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  &__stats {
    display: flex;
    justify-content: center;
    gap: $spacing-6;
    margin-bottom: $spacing-4;
  }

  &__stat {
    display: flex;
    flex-direction: column;
    align-items: center;

    &-value {
      font-size: $font-size-2xl;
      font-weight: 700;
      color: $success;
    }

    &-label {
      font-size: $font-size-xs;
      color: $gray-500;
    }

    &--error &-value {
      color: $danger;
    }
  }

  &__bar {
    margin-bottom: $spacing-2;
  }

  &__hint {
    margin: 0;
    font-size: $font-size-sm;
    color: $gray-400;
  }

  &__list {
    max-height: 400px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: $spacing-2;

    &::-webkit-scrollbar {
      width: 4px;
    }

    &::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 2px;
    }
  }

  &__item {
    display: flex;
    align-items: center;
    gap: $spacing-3;
    padding: $spacing-2;
    background: rgba(255, 255, 255, 0.03);
    border-radius: $radius-md;
    border: 1px solid transparent;

    &--success {
      border-color: rgba($success, 0.2);
      background: rgba($success, 0.05);
    }

    &--error {
      border-color: rgba($danger, 0.2);
      background: rgba($danger, 0.05);
    }

    &--uploading {
      border-color: rgba($primary-start, 0.3);
      background: rgba($primary-start, 0.05);
    }

    &-thumb {
      width: 40px;
      height: 40px;
      object-fit: cover;
      border-radius: $radius-sm;
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
      font-size: $font-size-sm;
      color: $gray-200;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &-status {
      display: flex;
      align-items: center;
      gap: $spacing-1;
      font-size: $font-size-xs;
      color: $gray-500;

      .el-icon {
        font-size: 12px;
      }

      .is-loading {
        animation: spin 1s linear infinite;
      }
    }

    &-badge {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      font-size: 12px;
      font-weight: bold;
      flex-shrink: 0;

      &--success {
        background: $success;
        color: $white;
      }

      &--error {
        background: $danger;
        color: $white;
      }
    }

    &-circle {
      flex-shrink: 0;
    }
  }

  &__footer {
    display: flex;
    justify-content: flex-end;
    gap: $spacing-2;
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

<!-- 全局样式覆盖 el-dialog -->
<style lang="scss">
.upload-progress-modal {
  .el-dialog {
    margin-top: 5vh !important;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
  }

  .el-dialog__body {
    overflow: hidden;
    flex: 1;
    padding: 16px 20px;
  }
}
</style>
