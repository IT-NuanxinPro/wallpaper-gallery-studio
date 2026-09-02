<template>
  <el-tooltip placement="top" :disabled="!file.aiMetadata" popper-class="upload-panel__ai-tooltip">
    <template #content>
      <div class="ai-tooltip-content">
        <div v-if="aiFilename" class="ai-tooltip-section">
          <span class="ai-tooltip-label">🤖 AI 文件名</span>
          <span class="ai-tooltip-value">{{ aiFilename }}</span>
        </div>
        <div class="ai-tooltip-section">
          <span class="ai-tooltip-label">📁 推荐分类</span>
          <span class="ai-tooltip-value">{{ aiCategory }}</span>
        </div>
        <div v-if="file.aiMetadata?.description" class="ai-tooltip-section">
          <span class="ai-tooltip-label">📝 描述</span>
          <span class="ai-tooltip-value">{{ file.aiMetadata.description }}</span>
        </div>
        <div v-if="aiKeywords.length > 0" class="ai-tooltip-section">
          <span class="ai-tooltip-label">🏷️ 关键词</span>
          <div class="ai-tooltip-tags">
            <span v-for="tag in aiKeywords" :key="tag" class="ai-tooltip-tag">
              {{ tag }}
            </span>
          </div>
        </div>
      </div>
    </template>

    <div
      class="upload-file-item"
      :class="[
        `upload-file-item--${file.status}`,
        { 'upload-file-item--selected': isSelected },
        { 'upload-file-item--checked': isChecked }
      ]"
      @click="$emit('select', file)"
    >
      <!-- 复选框 -->
      <el-checkbox
        v-if="showCheckbox"
        :model-value="isChecked"
        class="upload-file-item__checkbox"
        @click.stop
        @update:model-value="$emit('toggle-check', file.id)"
      />

      <!-- 图片预览 -->
      <img :src="file.preview" class="upload-file-item__img" draggable="false" />

      <!-- AI 任务状态 -->
      <div
        v-if="aiTaskBadge"
        class="upload-file-item__ai-task"
        :class="`upload-file-item__ai-task--${aiTaskBadge.tone}`"
        :title="aiTaskBadge.title"
      >
        <span v-if="aiTaskBadge.loading" class="upload-file-item__ai-task-spinner"></span>
        <span>{{ aiTaskBadge.text }}</span>
      </div>

      <!-- 上传中遮罩 -->
      <div v-if="file.status === 'uploading'" class="upload-file-item__overlay">
        <el-progress type="circle" :percentage="file.progress" :width="36" :stroke-width="3" />
      </div>

      <!-- 成功/失败徽章 -->
      <span
        v-else-if="file.status === 'success'"
        class="upload-file-item__badge upload-file-item__badge--success"
      >
        ✓
      </span>
      <span
        v-else-if="file.status === 'error'"
        class="upload-file-item__badge upload-file-item__badge--error"
      >
        !
      </span>

      <!-- 删除按钮 -->
      <button
        v-if="file.status === 'pending' || file.status === 'error'"
        class="upload-file-item__remove"
        @click.stop="$emit('remove', file.id)"
      >
        ×
      </button>

      <!-- AI 编辑按钮 -->
      <button
        v-if="file.status === 'pending' && file.aiMetadata && uploadMode === 'ai'"
        class="upload-file-item__edit-ai"
        title="编辑 AI 分析结果"
        @click.stop="$emit('edit-ai', file)"
      >
        ✏️
      </button>

      <!-- 目标路径标签 -->
      <div
        v-if="file.status === 'pending' && file.targetPath"
        class="upload-file-item__path"
        :class="[
          `upload-file-item__path--${file.targetSeries}`,
          { 'upload-file-item__path--ai': file.aiMetadata && uploadMode === 'ai' }
        ]"
        :title="file.targetPath"
        @click.stop="$emit('change-target', file)"
      >
        <span class="upload-file-item__path-icon">{{ seriesIcon }}</span>
        <span class="upload-file-item__path-text">{{ shortPath }}</span>
        <span v-if="file.aiMetadata && uploadMode === 'ai'" class="upload-file-item__path-ai">
          🤖
        </span>
      </div>

      <!-- AI 模式下：等待分类的文件 -->
      <div
        v-else-if="file.status === 'pending' && uploadMode === 'ai' && !file.targetPath"
        class="upload-file-item__path upload-file-item__path--waiting"
        :title="file.aiMetadata ? 'AI 分析完成，点击确认分类' : '等待 AI 分析'"
        @click.stop="$emit('change-target', file)"
      >
        <span v-if="file.aiMetadata" class="upload-file-item__path-icon">🤖</span>
        <span v-else class="upload-file-item__path-icon upload-file-item__path-icon--loading">
          ⏳
        </span>
        <span class="upload-file-item__path-text">
          {{ file.aiMetadata ? '点击确认' : '分析中...' }}
        </span>
      </div>
    </div>
  </el-tooltip>
</template>

<script setup>
import { computed } from 'vue'
import { AI_TASK_STATUS, useAiTasksStore } from '@/stores/ai-tasks'

const props = defineProps({
  file: { type: Object, required: true },
  isSelected: { type: Boolean, default: false },
  isChecked: { type: Boolean, default: false },
  uploading: { type: Boolean, default: false },
  uploadMode: { type: String, default: 'ai' }
})

defineEmits(['select', 'remove', 'change-target', 'toggle-check', 'edit-ai'])

const aiTasksStore = useAiTasksStore()

// 是否显示复选框
const showCheckbox = computed(
  () => (props.file.status === 'pending' || props.file.status === 'error') && !props.uploading
)

const aiTask = computed(() => aiTasksStore.getTaskByFileId(props.file.id))

const queuePosition = computed(() => {
  const task = aiTask.value
  if (!task || task.status !== AI_TASK_STATUS.QUEUED) return 0

  const queued = aiTasksStore.tasks
    .filter(candidate => candidate.status === AI_TASK_STATUS.QUEUED)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))

  const index = queued.findIndex(candidate => candidate.id === task.id)
  return index >= 0 ? index + 1 : 0
})

const aiTaskBadge = computed(() => {
  if (props.uploadMode !== 'ai') return null

  const task = aiTask.value
  if (!task) return null

  if (task.status === AI_TASK_STATUS.QUEUED) {
    return {
      text: queuePosition.value > 0 ? `排队第 ${queuePosition.value} 位` : '排队中',
      title: '等待前面的 AI 分析任务完成',
      tone: 'queued',
      loading: false
    }
  }

  if (task.status === AI_TASK_STATUS.ANALYZING) {
    return {
      text: '分析中',
      title: 'AI 正在分析这张图片',
      tone: 'analyzing',
      loading: true
    }
  }

  if (task.status === AI_TASK_STATUS.RETRYING) {
    return {
      text: task.attempts > 0 ? `重试中 · ${task.attempts}` : '重试中',
      title: task.error || '请求受限或暂时失败，正在自动重试',
      tone: 'retrying',
      loading: true
    }
  }

  if (task.status === AI_TASK_STATUS.FAILED) {
    return {
      text: '分析失败',
      title: task.error || 'AI 分析失败，可在任务中心重试',
      tone: 'failed',
      loading: false
    }
  }

  return null
})

// 获取系列图标
const seriesIcon = computed(() => {
  const icons = {
    desktop: '🖥️',
    mobile: '📱',
    avatar: '👤'
  }
  return icons[props.file.targetSeries] || '📁'
})

// 获取简短路径
const shortPath = computed(() => {
  if (!props.file.targetPath) return ''
  const parts = props.file.targetPath.split('/')
  return parts[parts.length - 1] || parts[parts.length - 2] || props.file.targetPath
})

// 获取 AI 推荐的文件名
const aiFilename = computed(() => {
  if (!props.file.aiMetadata) return ''

  if (props.file.aiMetadata.suggestedFilename) {
    return props.file.aiMetadata.suggestedFilename
  }

  if (
    props.file.aiMetadata.filenameSuggestions &&
    props.file.aiMetadata.filenameSuggestions.length > 0
  ) {
    return props.file.aiMetadata.filenameSuggestions[0]
  }

  if (props.file.aiMetadata.displayTitle) {
    return props.file.aiMetadata.displayTitle
  }

  return ''
})

// 获取 AI 推荐的完整分类路径
const aiCategory = computed(() => {
  if (!props.file.aiMetadata) return ''

  const metadata = props.file.aiMetadata
  const series = metadata.series || metadata.primary || ''
  const category = metadata.category || metadata.secondary || ''
  const subcategory = metadata.subcategory || metadata.third || ''

  const parts = []
  if (series) parts.push(series)
  if (category) parts.push(category)
  if (subcategory) parts.push(subcategory)

  return parts.join('/') || '未分类'
})

// 获取 AI 提取的关键词
const aiKeywords = computed(() => {
  if (!props.file.aiMetadata) return []
  const keywords = props.file.aiMetadata.keywords || props.file.aiMetadata.tags || []
  return Array.isArray(keywords) ? keywords : []
})
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.upload-file-item {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: $radius-lg;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all $duration-normal;

  &:hover {
    border-color: rgba(255, 255, 255, 0.3);
    transform: scale(1.03);
  }

  &--selected {
    border-color: $primary-start;
    box-shadow: 0 0 0 2px rgba($primary-start, 0.3);
  }

  &--checked {
    border-color: rgba($primary-start, 0.5);

    .upload-file-item__checkbox {
      opacity: 1;
    }
  }

  &--success {
    border-color: $success;
  }

  &--error {
    border-color: $danger;
  }

  &__img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
  }

  &__ai-task {
    position: absolute;
    top: 6px;
    left: 6px;
    z-index: 3;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: calc(100% - 72px);
    padding: 4px 8px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: $radius-full;
    color: $white;
    font-size: 10px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    backdrop-filter: blur(10px);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22);
    pointer-events: none;

    &--queued {
      background: rgba(64, 73, 95, 0.82);
    }

    &--analyzing {
      background: rgba($primary-start, 0.88);
    }

    &--retrying {
      background: rgba($warning, 0.9);
    }

    &--failed {
      background: rgba($danger, 0.9);
    }
  }

  &__ai-task-spinner {
    width: 8px;
    height: 8px;
    flex-shrink: 0;
    border: 1.5px solid rgba(255, 255, 255, 0.35);
    border-top-color: $white;
    border-radius: 50%;
    animation: ai-task-spin 0.8s linear infinite;
  }

  &__checkbox {
    position: absolute;
    top: 4px;
    left: 4px;
    z-index: 4;
    opacity: 0;
    transition: opacity $duration-normal;

    .upload-file-item:hover & {
      opacity: 1;
    }

    :deep(.el-checkbox__inner) {
      background: rgba(0, 0, 0, 0.6);
      border-color: rgba(255, 255, 255, 0.5);
    }

    :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
      background: $primary-start;
      border-color: $primary-start;
    }
  }

  &__overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.7);
  }

  &__badge {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-size: 11px;
    font-weight: bold;

    &--success {
      background: $success;
      color: $white;
    }

    &--error {
      background: $danger;
      color: $white;
    }
  }

  &__remove {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.7);
    border: none;
    border-radius: 50%;
    color: $white;
    font-size: 14px;
    cursor: pointer;
    opacity: 0;
    transition: all $duration-normal;

    .upload-file-item:hover & {
      opacity: 1;
    }

    &:hover {
      background: $danger;
    }
  }

  &__edit-ai {
    position: absolute;
    top: 4px;
    right: 28px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(102, 126, 234, 0.8);
    border: none;
    border-radius: 50%;
    color: $white;
    font-size: 10px;
    cursor: pointer;
    opacity: 0;
    transition: all $duration-normal;

    .upload-file-item:hover & {
      opacity: 1;
    }

    &:hover {
      background: $primary-start;
      transform: scale(1.1);
    }
  }

  &__path {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 2px 6px;
    background: rgba(0, 0, 0, 0.75);
    color: $gray-300;
    font-size: 10px;
    text-align: center;
    cursor: pointer;
    transition: all $duration-normal;

    &:hover {
      background: rgba($primary-start, 0.8);
      color: $white;
    }

    &-icon {
      font-size: 9px;
    }

    &-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &--desktop {
      border-top: 2px solid $primary-start;
    }

    &--mobile {
      border-top: 2px solid $success;
    }

    &--avatar {
      border-top: 2px solid $warning;
    }

    &--ai {
      background: rgba($primary-start, 0.6);
    }

    &--waiting {
      background: rgba($warning, 0.7);
      color: $white;
      border-top: 2px solid $warning;
    }

    &-ai {
      font-size: 9px;
      margin-left: 2px;
    }

    &-icon--loading {
      animation: pulse 1.5s ease-in-out infinite;
    }
  }
}

@keyframes ai-task-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>

<style lang="scss">
@use './upload-tooltip.scss';
</style>
