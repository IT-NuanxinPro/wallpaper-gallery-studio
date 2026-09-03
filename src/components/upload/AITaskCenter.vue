<template>
  <section class="ai-task-center" :class="{ 'ai-task-center--collapsed': collapsed }">
    <button class="ai-task-center__header" @click="collapsed = !collapsed">
      <span class="ai-task-center__title">
        <span class="ai-task-center__icon">✦</span>
        <span>
          <strong>AI 任务</strong>
          <small>{{ summaryText }}</small>
        </span>
      </span>
      <span class="ai-task-center__header-right">
        <span v-if="taskStore.failedTasks.length" class="ai-task-center__failure-dot">
          {{ taskStore.failedTasks.length }}
        </span>
        <span class="ai-task-center__chevron">{{ collapsed ? '⌄' : '⌃' }}</span>
      </span>
    </button>

    <div v-show="!collapsed" class="ai-task-center__content">
      <div class="ai-task-center__metrics">
        <span
          ><i class="ai-task-center__dot ai-task-center__dot--active"></i>分析
          {{ taskStore.activeTasks.length }}</span
        >
        <span
          ><i class="ai-task-center__dot ai-task-center__dot--queued"></i>排队
          {{ taskStore.queuedTasks.length }}</span
        >
        <span
          ><i class="ai-task-center__dot ai-task-center__dot--success"></i>完成
          {{ taskStore.completedTasks.length }}</span
        >
        <span v-if="taskStore.failedTasks.length"
          ><i class="ai-task-center__dot ai-task-center__dot--failed"></i>失败
          {{ taskStore.failedTasks.length }}</span
        >
      </div>

      <div v-if="taskStore.persistenceWarning" class="ai-task-center__warning">
        {{ taskStore.persistenceWarning }}
      </div>

      <div v-if="visibleTasks.length" class="ai-task-center__list">
        <article v-for="task in visibleTasks" :key="task.id" class="ai-task-center__item">
          <span
            class="ai-task-center__task-state"
            :class="`ai-task-center__task-state--${task.status}`"
          >
            <span
              v-if="['analyzing', 'retrying'].includes(task.status)"
              class="ai-task-center__spinner"
            ></span>
            <span v-else-if="task.status === 'completed'">✓</span>
            <span v-else-if="task.status === 'failed'">!</span>
            <span v-else>{{ queuePosition(task) }}</span>
          </span>

          <span class="ai-task-center__task-copy">
            <strong :title="task.fileName">{{ task.fileName }}</strong>
            <small>
              {{ getModelLabel(task) }}
              <span>·</span>
              {{ getStatusLabel(task) }}
            </small>
            <em v-if="task.error" :title="task.error">{{ task.error }}</em>
          </span>

          <button
            v-if="task.status === 'failed'"
            class="ai-task-center__retry"
            @click.stop="handleRetry(task.id)"
          >
            重试
          </button>
        </article>
      </div>

      <div class="ai-task-center__footer">
        <span>{{ batchLabel }}</span>
        <span class="ai-task-center__footer-actions">
          <button :disabled="taskStore.completedTasks.length === 0" @click="handleClearFinished">
            移除已完成
          </button>
          <button :disabled="taskStore.pendingCount > 0" @click="handleClearAll">清空任务</button>
        </span>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAiTasksStore } from '@/stores/ai-tasks'
import { useUploadStore } from '@/stores/upload'
import { useCredentialsStore } from '@/stores/credentials'
import { resumeAiTaskQueue, retryAiTask } from '@/services/ai/task-runner'

const taskStore = useAiTasksStore()
const uploadStore = useUploadStore()
const credentialsStore = useCredentialsStore()
const collapsed = ref(false)
const userToggled = ref(false)

const visibleTasks = computed(() => {
  const currentBatch = taskStore.currentBatchId
  return [...taskStore.tasks]
    .filter(task => task.batchId === currentBatch || task.status !== 'completed')
    .sort((first, second) => {
      const rank = { analyzing: 0, retrying: 1, queued: 2, failed: 3, completed: 4 }
      return (
        (rank[first.status] ?? 9) - (rank[second.status] ?? 9) ||
        (first.createdAt || 0) - (second.createdAt || 0)
      )
    })
    .slice(0, 30)
})

const summaryText = computed(() => {
  if (taskStore.activeTasks.length) {
    return `${taskStore.activeTasks.length} 分析中 · ${taskStore.queuedTasks.length} 排队`
  }
  if (taskStore.queuedTasks.length) return `${taskStore.queuedTasks.length} 个等待处理`
  if (taskStore.failedTasks.length) return `${taskStore.failedTasks.length} 个需要处理`
  return `本批次完成 ${taskStore.completedTasks.length}/${taskStore.completedTasks.length}`
})

const batchLabel = computed(() => {
  const currentCount = taskStore.tasks.filter(
    task => task.batchId === taskStore.currentBatchId
  ).length
  return currentCount ? `当前批次 · ${currentCount} 张` : '任务会在图片上传成功后自动清理'
})

function queuePosition(task) {
  return taskStore.queuedTasks.findIndex(item => item.id === task.id) + 1
}

function getModelLabel(task) {
  const labels = {
    'sub2api-grok-4.6': 'Grok 4.6',
    'sub2api-grok-4.5': 'Grok 4.5',
    'zhipu-glm-4v-flash': 'GLM-4V Flash',
    'zhipu-glm-4.1v-thinking-flash': 'GLM Thinking',
    'groq-qwen3.6-27b': 'Groq Qwen',
    'cloudflare-llama-3.2': 'Cloudflare Llama',
    'cloudflare-llava-1.5': 'Cloudflare LLaVA'
  }
  return labels[task.modelKey] || task.modelKey || task.provider || 'AI'
}

function getStatusLabel(task) {
  const labels = {
    queued: queuePosition(task) > 0 ? `队列第 ${queuePosition(task)} 位` : '排队中',
    analyzing: '分析中',
    retrying: `自动重试 ${task.attempts || 1}/${task.maxAttempts || 3}`,
    completed: '已完成',
    failed: '分析失败'
  }
  return labels[task.status] || task.status
}

async function handleRetry(taskId) {
  try {
    await retryAiTask(taskId)
  } catch (error) {
    ElMessage.error(error.message || '任务重试失败')
  }
}

async function handleClearFinished() {
  const count = taskStore.completedTasks.length
  if (!count) return
  try {
    await ElMessageBox.confirm(
      `将同时从待上传列表移除对应的 ${count} 张图片，避免任务与图片状态不一致。确定继续吗？`,
      '移除已完成任务',
      { confirmButtonText: '移除', cancelButtonText: '取消', type: 'warning' }
    )
    const fileIds = taskStore.completedTasks.map(task => task.fileId)
    await uploadStore.removeFiles(fileIds)
    ElMessage.success(`已移除 ${count} 个完成任务及对应图片`)
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error.message || '清理完成任务失败')
    }
  }
}

async function handleClearAll() {
  if (taskStore.pendingCount > 0) return
  try {
    await ElMessageBox.confirm(
      '将清除已完成和失败任务，并同时移除对应的待上传图片。确定继续吗？',
      '清空 AI 任务',
      { confirmButtonText: '清空', cancelButtonText: '取消', type: 'warning' }
    )
    const fileIds = taskStore.tasks.map(task => task.fileId)
    await uploadStore.removeFiles(fileIds)
    if (taskStore.tasks.length > 0) await taskStore.clearAll()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error.message || '清空任务失败')
    }
  }
}

watch(
  () => [taskStore.pendingCount, taskStore.failedTasks.length],
  ([pending, failed], [previousPending, previousFailed] = []) => {
    if (pending > 0 || failed > 0) {
      if (!userToggled.value || pending > previousPending || failed > previousFailed) {
        collapsed.value = false
      }
      return
    }
    if (previousPending > 0) {
      collapsed.value = true
      userToggled.value = false
    }
  }
)

watch(collapsed, () => {
  userToggled.value = true
})

watch(
  () => credentialsStore.availableProviders.map(provider => provider.key).join(','),
  providerKeys => {
    const available = new Set(providerKeys.split(',').filter(Boolean))
    const hasRunnableTask = taskStore.tasks.some(
      task => ['queued', 'retrying'].includes(task.status) && available.has(task.provider)
    )
    if (hasRunnableTask) {
      resumeAiTaskQueue().catch(error => {
        console.warn('[AiTaskCenter] 凭证更新后续跑失败:', error)
      })
    }
  }
)

onMounted(async () => {
  await taskStore.initialize()
  if (taskStore.pendingCount === 0 && taskStore.failedTasks.length === 0) collapsed.value = true
  resumeAiTaskQueue().catch(error => {
    console.warn('[AiTaskCenter] 自动续跑失败:', error)
  })
})
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.ai-task-center {
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: min(420px, 52vh);
  overflow: hidden;
  border: 1px solid rgba($primary-start, 0.18);
  border-radius: $radius-xl;
  background: linear-gradient(180deg, rgba($primary-start, 0.09), rgba(8, 12, 24, 0.62));
  backdrop-filter: blur($glass-blur);
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.16);
  flex: 0 1 auto;
  transition: max-height 0.24s ease;

  &--collapsed {
    max-height: 52px;
    flex: 0 0 52px;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 52px;
    padding: 0 13px;
    border: 0;
    background: transparent;
    color: $white;
    cursor: pointer;
  }

  &__title,
  &__header-right {
    display: flex;
    align-items: center;
  }

  &__title {
    gap: 9px;
    min-width: 0;
    text-align: left;

    > span:last-child {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    strong {
      font-size: 13px;
    }

    small {
      overflow: hidden;
      color: $gray-500;
      font-size: 9px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  &__icon {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 9px;
    background: rgba($primary-start, 0.16);
    color: #cdb8ff;
  }

  &__header-right {
    gap: 7px;
  }

  &__failure-dot {
    min-width: 20px;
    padding: 3px 6px;
    border-radius: $radius-full;
    background: rgba($danger, 0.16);
    color: $danger;
    font-size: 9px;
    text-align: center;
  }

  &__chevron {
    color: $gray-500;
  }

  &__content {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    padding: 0 10px 10px;
  }

  &__metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px;
    padding: 8px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: $radius-md;
    background: rgba(3, 7, 18, 0.22);
    color: $gray-400;
    font-size: 9px;

    span {
      display: flex;
      align-items: center;
      gap: 5px;
    }
  }

  &__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: $gray-500;

    &--active {
      background: $primary-start;
    }
    &--queued {
      background: $warning;
    }
    &--success {
      background: $success;
    }
    &--failed {
      background: $danger;
    }
  }

  &__warning {
    margin-top: 7px;
    padding: 7px;
    border-radius: $radius-md;
    background: rgba($warning, 0.11);
    color: $warning;
    font-size: 9px;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-height: 0;
    margin-top: 8px;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 7px;
    border-radius: $radius-md;
    background: rgba(255, 255, 255, 0.035);
  }

  &__task-state {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    flex: 0 0 24px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.06);
    color: $gray-400;
    font-size: 9px;

    &--analyzing {
      background: rgba($primary-start, 0.14);
      color: $primary-start;
    }
    &--retrying {
      background: rgba($warning, 0.14);
      color: $warning;
    }
    &--completed {
      background: rgba($success, 0.14);
      color: $success;
    }
    &--failed {
      background: rgba($danger, 0.14);
      color: $danger;
    }
  }

  &__spinner {
    width: 10px;
    height: 10px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: ai-task-spin 0.8s linear infinite;
  }

  &__task-copy {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;

    strong,
    em {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    strong {
      color: $gray-200;
      font-size: 10px;
      font-style: normal;
    }

    small {
      color: $gray-500;
      font-size: 8px;
    }

    em {
      color: $danger;
      font-size: 8px;
      font-style: normal;
    }
  }

  &__retry {
    padding: 4px 7px;
    border: 1px solid rgba($danger, 0.24);
    border-radius: 7px;
    background: rgba($danger, 0.1);
    color: $danger;
    font-size: 9px;
    cursor: pointer;
  }

  &__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    color: $gray-600;
    font-size: 8px;
  }

  &__footer-actions {
    display: flex;
    gap: 5px;

    button {
      padding: 4px 6px;
      border: 0;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.05);
      color: $gray-400;
      font-size: 8px;
      cursor: pointer;

      &:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
    }
  }
}

@keyframes ai-task-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
