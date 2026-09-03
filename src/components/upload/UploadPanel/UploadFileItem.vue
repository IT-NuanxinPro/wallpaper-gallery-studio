<template>
  <article
    class="upload-file-item"
    :class="[
      `upload-file-item--${file.status}`,
      { 'upload-file-item--selected': isSelected, 'upload-file-item--checked': isChecked }
    ]"
    @click="$emit('select', file)"
  >
    <el-checkbox
      v-if="showCheckbox"
      :model-value="isChecked"
      class="upload-file-item__checkbox"
      aria-label="选择图片"
      @click.stop
      @update:model-value="$emit('toggle-check', file.id)"
    />

    <div class="upload-file-item__thumb">
      <img :src="file.preview" :alt="file.name" draggable="false" />
      <div v-if="file.status === 'uploading'" class="upload-file-item__progress">
        <el-progress type="circle" :percentage="file.progress" :width="38" :stroke-width="4" />
      </div>
      <span v-else-if="file.status === 'success'" class="upload-file-item__result">✓</span>
      <span
        v-else-if="file.status === 'error'"
        class="upload-file-item__result upload-file-item__result--error"
      >
        !
      </span>
    </div>

    <div class="upload-file-item__body">
      <div class="upload-file-item__name" :title="file.name">{{ file.name }}</div>

      <div class="upload-file-item__status-line">
        <span
          class="upload-file-item__status-dot"
          :class="`upload-file-item__status-dot--${statusTone}`"
        ></span>
        <span :title="statusTitle">{{ statusText }}</span>
        <span v-if="modelLabel" class="upload-file-item__model">{{ modelLabel }}</span>
      </div>

      <button
        v-if="file.status === 'pending' && file.targetPath"
        class="upload-file-item__path"
        :title="file.targetPath"
        @click.stop="$emit('change-target', file)"
      >
        <span>{{ seriesIcon }}</span>
        <span>{{ compactPath }}</span>
        <span v-if="file.aiMetadata && uploadMode === 'ai'" class="upload-file-item__ai-mark">
          AI
        </span>
      </button>

      <button
        v-else-if="file.status === 'pending' && uploadMode === 'ai'"
        class="upload-file-item__path upload-file-item__path--waiting"
        @click.stop="$emit('change-target', file)"
      >
        <span>{{ file.aiMetadata ? '🤖' : '⏳' }}</span>
        <span>{{ file.aiMetadata ? '确认推荐分类' : '等待 AI 分类' }}</span>
      </button>
    </div>

    <div class="upload-file-item__actions">
      <button
        v-if="file.status === 'pending' && file.aiMetadata && uploadMode === 'ai'"
        title="编辑 AI 分析结果"
        @click.stop="$emit('edit-ai', file)"
      >
        ✎
      </button>
      <button
        v-if="file.status === 'pending' || file.status === 'error'"
        title="移除图片"
        class="upload-file-item__remove"
        @click.stop="$emit('remove', file.id)"
      >
        ×
      </button>
    </div>
  </article>
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
const aiTask = computed(() => aiTasksStore.getTaskByFileId(props.file.id))
const showCheckbox = computed(
  () => (props.file.status === 'pending' || props.file.status === 'error') && !props.uploading
)

const queuePosition = computed(() => {
  if (aiTask.value?.status !== AI_TASK_STATUS.QUEUED) return 0
  return aiTasksStore.queuedTasks.findIndex(task => task.id === aiTask.value.id) + 1
})

const statusInfo = computed(() => {
  if (props.file.status === 'uploading') {
    return { text: `上传中 ${props.file.progress}%`, title: '正在上传到 GitHub', tone: 'active' }
  }
  if (props.file.status === 'success') {
    return { text: '上传成功', title: '图片已上传成功', tone: 'success' }
  }
  if (props.file.status === 'error') {
    return { text: '上传失败', title: props.file.error || '上传失败', tone: 'failed' }
  }

  const task = aiTask.value
  if (!task || props.uploadMode !== 'ai') {
    return {
      text: props.file.targetPath ? '等待上传' : '待选择目录',
      title: props.file.targetPath || '请先选择目录',
      tone: props.file.targetPath ? 'ready' : 'waiting'
    }
  }

  if (task.status === AI_TASK_STATUS.QUEUED) {
    return {
      text: queuePosition.value > 0 ? `排队第 ${queuePosition.value} 位` : '排队中',
      title: '等待前面的 AI 任务完成',
      tone: 'waiting'
    }
  }
  if (task.status === AI_TASK_STATUS.ANALYZING) {
    return { text: 'AI 分析中', title: '正在识别图片并推荐分类', tone: 'active' }
  }
  if (task.status === AI_TASK_STATUS.RETRYING) {
    return {
      text: `自动重试 ${task.attempts || 1}/${task.maxAttempts || 3}`,
      title: task.error,
      tone: 'warning'
    }
  }
  if (task.status === AI_TASK_STATUS.FAILED) {
    return { text: 'AI 分析失败', title: task.error || '请在右侧任务栏重试', tone: 'failed' }
  }
  return { text: 'AI 分类完成', title: '分类结果已就绪，确认后即可上传', tone: 'success' }
})

const statusText = computed(() => statusInfo.value.text)
const statusTitle = computed(() => statusInfo.value.title)
const statusTone = computed(() => statusInfo.value.tone)

const modelLabel = computed(() => {
  const key = aiTask.value?.modelKey || ''
  const labels = {
    'sub2api-grok-4.6': 'Grok 4.6',
    'sub2api-grok-4.5': 'Grok 4.5',
    'zhipu-glm-4v-flash': 'GLM-4V',
    'zhipu-glm-4.1v-thinking-flash': 'GLM Thinking',
    'groq-qwen3.6-27b': 'Groq Qwen'
  }
  return labels[key] || (key ? key.split('-').slice(-2).join(' ') : '')
})

const seriesIcon = computed(
  () => ({ desktop: '🖥️', mobile: '📱', avatar: '👤' })[props.file.targetSeries] || '📁'
)

const compactPath = computed(() => {
  if (!props.file.targetPath) return ''
  const parts = props.file.targetPath.split('/').filter(Boolean)
  return parts.slice(-2).join(' / ')
})
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.upload-file-item {
  position: relative;
  display: grid;
  grid-template-columns: 70px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 10px;
  min-width: 0;
  height: 94px;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: $radius-lg;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.065), rgba(255, 255, 255, 0.035));
  cursor: pointer;
  transition: 0.18s ease;

  &:hover {
    border-color: rgba(255, 255, 255, 0.18);
    background: linear-gradient(145deg, rgba(255, 255, 255, 0.085), rgba(255, 255, 255, 0.045));
    transform: translateY(-1px);
  }

  &--selected,
  &--checked {
    border-color: rgba($primary-start, 0.55);
    box-shadow: 0 0 0 1px rgba($primary-start, 0.15);
  }

  &--error {
    border-color: rgba($danger, 0.32);
  }

  &__checkbox {
    position: absolute;
    top: 13px;
    left: 13px;
    z-index: 3;
    opacity: 0;
    transition: opacity 0.18s ease;

    .upload-file-item:hover &,
    .upload-file-item--checked & {
      opacity: 1;
    }

    :deep(.el-checkbox__inner) {
      border-color: rgba(255, 255, 255, 0.6);
      background: rgba(4, 7, 14, 0.72);
    }
  }

  &__thumb {
    position: relative;
    width: 70px;
    height: 70px;
    overflow: hidden;
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.22);

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  &__progress {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(3, 6, 14, 0.72);
  }

  &__result {
    position: absolute;
    right: 5px;
    bottom: 5px;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: $success;
    color: $white;
    font-size: 11px;
    font-weight: 800;

    &--error {
      background: $danger;
    }
  }

  &__body {
    min-width: 0;
  }

  &__name {
    overflow: hidden;
    margin-bottom: 7px;
    color: $gray-100;
    font-size: 12px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__status-line {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    margin-bottom: 7px;
    color: $gray-400;
    font-size: 10px;
  }

  &__status-dot {
    width: 6px;
    height: 6px;
    flex: 0 0 6px;
    border-radius: 50%;
    background: $gray-500;

    &--active {
      background: $primary-start;
      box-shadow: 0 0 0 3px rgba($primary-start, 0.14);
      animation: upload-file-pulse 1.5s ease-in-out infinite;
    }

    &--success,
    &--ready {
      background: $success;
    }

    &--warning,
    &--waiting {
      background: $warning;
    }

    &--failed {
      background: $danger;
    }
  }

  &__model {
    overflow: hidden;
    margin-left: auto;
    color: $gray-600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__path {
    display: flex;
    align-items: center;
    gap: 5px;
    max-width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    color: #aab5d5;
    font-size: 10px;
    cursor: pointer;

    span:nth-child(2) {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &:hover {
      color: $white;
    }

    &--waiting {
      color: $warning;
    }
  }

  &__ai-mark {
    flex-shrink: 0;
    padding: 2px 4px;
    border-radius: 4px;
    background: rgba($primary-start, 0.14);
    color: #cdb8ff;
    font-size: 8px;
    font-weight: 700;
  }

  &__actions {
    display: flex;
    flex-direction: column;
    gap: 5px;

    button {
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      padding: 0;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.035);
      color: $gray-500;
      cursor: pointer;
      opacity: 0;
      transition: 0.18s ease;
    }

    button:hover {
      border-color: rgba($primary-start, 0.32);
      color: $white;
    }

    .upload-file-item__remove:hover {
      border-color: rgba($danger, 0.35);
      color: $danger;
    }

    .upload-file-item:hover & button {
      opacity: 1;
    }
  }
}

@keyframes upload-file-pulse {
  50% {
    opacity: 0.45;
  }
}
</style>
