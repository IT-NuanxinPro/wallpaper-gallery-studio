<template>
  <section class="ai-task-center">
    <div class="ai-task-center__header">
      <div>
        <div class="ai-task-center__eyebrow">AI Task Center</div>
        <div class="ai-task-center__title-row">
          <strong>任务中心</strong>
          <span v-if="taskStore.pendingCount > 0" class="ai-task-center__badge">
            {{ taskStore.pendingCount }} 待处理
          </span>
        </div>
      </div>

      <div class="ai-task-center__stats">
        <span>排队 {{ taskStore.queuedTasks.length }}</span>
        <span>处理中 {{ taskStore.activeTasks.length }}</span>
        <span>完成 {{ taskStore.completedTasks.length }}</span>
        <span v-if="taskStore.failedTasks.length > 0" class="ai-task-center__stat--error">
          失败 {{ taskStore.failedTasks.length }}
        </span>
      </div>
    </div>

    <div v-if="taskStore.persistenceWarning" class="ai-task-center__warning">
      {{ taskStore.persistenceWarning }}
    </div>

    <div v-if="visibleTasks.length > 0" class="ai-task-center__list">
      <article v-for="(task, index) in visibleTasks" :key="task.id" class="ai-task-center__item">
        <div class="ai-task-center__index">{{ index + 1 }}</div>
        <div class="ai-task-center__body">
          <div class="ai-task-center__name" :title="task.fileName">{{ task.fileName }}</div>
          <div class="ai-task-center__meta">
            <span>{{ getProviderLabel(task.provider) }}</span>
            <span>{{ getStatusLabel(task.status) }}</span>
            <span v-if="task.attempts > 0">第 {{ task.attempts }} 次</span>
            <span v-if="task.status === 'queued' && queuePosition(task) > 0">
              队列第 {{ queuePosition(task) }} 位
            </span>
          </div>
          <div v-if="task.error" class="ai-task-center__error" :title="task.error">
            {{ task.error }}
          </div>
        </div>

        <div class="ai-task-center__status" :class="`ai-task-center__status--${task.status}`">
          <span v-if="task.status === 'analyzing'" class="ai-task-center__spinner"></span>
          <span v-else-if="task.status === 'retrying'">⏱</span>
          <span v-else-if="task.status === 'completed'">✓</span>
          <span v-else-if="task.status === 'failed'">!</span>
          <span v-else>…</span>
        </div>

        <button
          v-if="task.status === 'failed'"
          class="ai-task-center__retry"
          @click="handleRetry(task.id)"
        >
          重试
        </button>
      </article>
    </div>

    <div v-else class="ai-task-center__empty">暂无 AI 分析任务</div>
  </section>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useAiTasksStore } from '@/stores/ai-tasks'
import { resumeAiTaskQueue, retryAiTask } from '@/services/ai/task-runner'

const taskStore = useAiTasksStore()

const visibleTasks = computed(() =>
  [...taskStore.tasks]
    .sort((a, b) => {
      const rank = { analyzing: 0, retrying: 1, queued: 2, failed: 3, completed: 4 }
      const rankDiff = (rank[a.status] ?? 9) - (rank[b.status] ?? 9)
      if (rankDiff !== 0) return rankDiff
      return (a.createdAt || 0) - (b.createdAt || 0)
    })
    .slice(0, 12)
)

function getProviderLabel(provider) {
  if (provider === 'sub2api') return 'Grok'
  if (provider === 'zhipu') return '智谱 GLM'
  if (provider === 'groq') return 'Groq'
  return provider || 'AI'
}

function getStatusLabel(status) {
  const labels = {
    queued: '排队中',
    analyzing: '分析中',
    retrying: '等待重试',
    completed: '已完成',
    failed: '失败'
  }
  return labels[status] || status
}

function queuePosition(task) {
  return taskStore.queuedTasks.findIndex(item => item.id === task.id) + 1
}

async function handleRetry(taskId) {
  try {
    await retryAiTask(taskId)
  } catch (error) {
    ElMessage.error(error.message || '任务重试失败')
  }
}

onMounted(async () => {
  await taskStore.initialize()
  resumeAiTaskQueue().catch(error => {
    console.warn('[AiTaskCenter] 自动续跑失败:', error)
  })
})
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.ai-task-center {
  flex-shrink: 0;
  margin-top: $spacing-3;
  padding: $spacing-3;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: $radius-lg;
  background: rgba(8, 12, 24, 0.5);

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $spacing-3;
    margin-bottom: $spacing-2;
  }

  &__eyebrow {
    color: $gray-500;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  &__title-row {
    display: flex;
    align-items: center;
    gap: $spacing-2;
    color: $white;
  }

  &__badge {
    padding: 2px 7px;
    border-radius: $radius-full;
    background: rgba($primary-start, 0.18);
    color: $gray-200;
    font-size: 10px;
  }

  &__stats {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: $spacing-2;
    color: $gray-400;
    font-size: 11px;
  }

  &__stat--error {
    color: $danger;
  }

  &__warning {
    margin-bottom: $spacing-2;
    padding: $spacing-2;
    border-radius: $radius-md;
    background: rgba($warning, 0.12);
    color: $warning;
    font-size: 11px;
  }

  &__list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: $spacing-2;
    max-height: 154px;
    overflow-y: auto;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: $spacing-2;
    min-width: 0;
    padding: $spacing-2;
    border-radius: $radius-md;
    background: rgba(255, 255, 255, 0.04);
  }

  &__index {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.06);
    color: $gray-400;
    font-size: 10px;
  }

  &__body {
    flex: 1;
    min-width: 0;
  }

  &__name {
    overflow: hidden;
    color: $gray-200;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 2px;
    color: $gray-500;
    font-size: 9px;
  }

  &__error {
    margin-top: 2px;
    overflow: hidden;
    color: $danger;
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__status {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.06);
    color: $gray-400;

    &--completed {
      background: rgba($success, 0.14);
      color: $success;
    }

    &--failed {
      background: rgba($danger, 0.14);
      color: $danger;
    }

    &--retrying {
      background: rgba($warning, 0.14);
      color: $warning;
    }

    &--analyzing {
      background: rgba($primary-start, 0.14);
      color: $primary-start;
    }
  }

  &__spinner {
    width: 10px;
    height: 10px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: task-spin 0.8s linear infinite;
  }

  &__retry {
    padding: 4px 7px;
    border: 0;
    border-radius: $radius-md;
    background: rgba($danger, 0.14);
    color: $danger;
    font-size: 10px;
    cursor: pointer;
  }

  &__empty {
    padding: $spacing-2;
    color: $gray-500;
    font-size: 11px;
    text-align: center;
  }
}

@keyframes task-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
