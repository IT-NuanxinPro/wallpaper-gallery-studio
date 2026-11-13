<template>
  <Teleport to="body">
    <Transition name="publication-notice">
      <aside v-if="items.length" class="publication-notice" aria-label="视频发布通知">
        <button
          class="publication-notice__toggle"
          type="button"
          :aria-expanded="!collapsed"
          @click="collapsed = !collapsed"
        >
          <span class="publication-notice__activity" :class="{ 'is-active': hasRunning }" />
          <span>{{ hasRunning ? '正在发布视频' : '视频发布动态' }}</span>
          <span class="publication-notice__count">{{ items.length }}</span>
          <el-icon :class="{ 'is-collapsed': collapsed }"><ArrowUp /></el-icon>
        </button>
        <el-collapse-transition>
          <div v-show="!collapsed" class="publication-notice__list" data-scroll-region>
            <TransitionGroup name="publication-item" tag="div">
              <article
                v-for="item in items"
                :key="item.id"
                class="publication-notice__card"
                :class="`is-${item.status}`"
              >
                <div class="publication-notice__heading">
                  <svg
                    class="publication-notice__icon"
                    :class="{ 'is-spinning': running(item) }"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <template v-if="running(item)">
                      <circle
                        cx="12"
                        cy="12"
                        r="9"
                        stroke="currentColor"
                        opacity=".2"
                        stroke-width="2"
                      />
                      <path
                        d="M12 3a9 9 0 0 1 9 9"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                      />
                    </template>
                    <path
                      v-else-if="item.status === 'published'"
                      class="publication-notice__check"
                      d="m5 12 4 4L19 6"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                    <template v-else>
                      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" />
                      <path
                        d="M12 7v6m0 3h.01"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                      />
                    </template>
                  </svg>
                  <div
                    class="publication-notice__title"
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    <strong>{{ title(item) }}</strong>
                    <span>{{ detail(item) }}</span>
                  </div>
                  <button
                    v-if="item.status === 'published'"
                    type="button"
                    class="publication-notice__close"
                    aria-label="关闭发布完成提示"
                    @click="dismiss(item.id)"
                  >
                    <el-icon><Close /></el-icon>
                  </button>
                </div>
                <ol
                  v-if="running(item) && item.status !== 'submitting'"
                  class="publication-notice__stages"
                  aria-label="发布阶段"
                >
                  <li
                    v-for="(label, index) in stages"
                    :key="label"
                    :class="{ 'is-done': stage(item) > index, 'is-current': stage(item) === index }"
                    :aria-current="stage(item) === index ? 'step' : undefined"
                  >
                    <span class="publication-notice__track"><i /></span>{{ label }}
                  </li>
                </ol>
                <p
                  v-if="item.error || errors[item.id]"
                  class="publication-notice__error"
                  role="alert"
                >
                  {{ errorMessage(item.error) || `进度刷新失败：${errors[item.id]}` }}
                </p>
                <div
                  v-if="['published', 'failed', 'unavailable'].includes(item.status)"
                  class="publication-notice__actions"
                >
                  <el-button v-if="item.status === 'published'" link @click="showHistory(item.id)"
                    >查看已发布</el-button
                  >
                  <el-button
                    v-else-if="item.status === 'failed'"
                    link
                    :disabled="!canWrite"
                    :loading="retryingIds.includes(item.id)"
                    @click="$emit('retry', item.id)"
                    >继续发布</el-button
                  >
                  <el-button v-else link @click="$emit('refresh')">刷新进度</el-button>
                </div>
              </article>
            </TransitionGroup>
          </div>
        </el-collapse-transition>
      </aside>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ArrowUp, Close } from '@element-plus/icons-vue'
import { errorMessage } from './domain'

const props = defineProps({
  publications: { type: Array, default: () => [] },
  errors: { type: Object, default: () => ({}) },
  submitting: Boolean,
  canWrite: Boolean,
  retryingIds: { type: Array, default: () => [] }
})
const emit = defineEmits(['retry', 'refresh', 'history'])
const collapsed = ref(false)
const completedIds = ref([])
const observed = new Map()
const stages = ['云端排队', '写入资源', '部署网站']
watch(
  () => props.publications.map(item => [item.id, item.status]),
  states => {
    for (const [id, status] of states) {
      const previous = observed.get(id)
      if (previous && previous !== 'published' && status === 'published') {
        completedIds.value = [...new Set([...completedIds.value, id])]
        collapsed.value = false
      }
      if (previous !== status && status === 'failed') collapsed.value = false
      observed.set(id, status)
    }
  },
  { immediate: true }
)
watch(
  () => props.submitting,
  value => {
    if (value) collapsed.value = false
  }
)
const items = computed(() => [
  ...(props.submitting ? [{ id: 'submitting', status: 'submitting' }] : []),
  ...props.publications.filter(
    item => item.status !== 'published' || completedIds.value.includes(item.id)
  ),
  ...Object.entries(props.errors)
    .filter(([id]) => !props.publications.some(item => item.id === id))
    .map(([id, error]) => ({ id, status: 'unavailable', error }))
])
const hasRunning = computed(() => items.value.some(running))
function running(item) {
  return !['published', 'failed', 'unavailable'].includes(item.status)
}
function stage(item) {
  if (item.status === 'deploying' || item.deploymentId) return 2
  if (item.status === 'publishing' || item.metadataCommitSha) return 1
  return 0
}
function title(item) {
  if (item.status === 'submitting') return '正在提交发布'
  if (item.status === 'unavailable') return '暂时无法获取发布进度'
  const count = item.jobs?.length || 0
  if (item.status === 'published') return `${count} 个视频已发布`
  if (item.status === 'failed') return `${count} 个视频发布未完成`
  return `${count} 个视频 · ${stages[stage(item)]}`
}
function detail(item) {
  if (item.status === 'published') return '网站部署完成，视频已移入发布历史'
  if (item.status === 'failed') return '已完成的阶段会保留，可继续发布'
  if (item.status === 'unavailable') return '任务状态已保留，请稍后刷新'
  if (item.status === 'submitting') return '正在确认已保存的审核版本'
  return [
    '已加入云端队列，可以继续处理其他视频',
    '正在同步视频资源与元数据',
    '等待网站部署成功后确认发布'
  ][stage(item)]
}
function showHistory(id) {
  emit('history')
  dismiss(id)
}
function dismiss(id) {
  completedIds.value = completedIds.value.filter(value => value !== id)
}
</script>

<style scoped lang="scss">
.publication-notice {
  position: fixed;
  z-index: 1800;
  top: max(18px, env(safe-area-inset-top));
  right: max(16px, calc((100vw - 600px) / 2));
  width: min(380px, calc(100vw - 32px));
  color: #eef4fc;
  background: rgba(32, 39, 51, 0.92);
  border: 1px solid rgba(210, 225, 247, 0.18);
  border-radius: 22px;
  box-shadow:
    0 16px 48px rgba(0, 0, 0, 0.3),
    inset 0 1px rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(28px) saturate(1.5);
  overflow: hidden;
  font-family: inherit;
  &__toggle {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    padding: 13px 17px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    text-align: left;
    > .el-icon {
      margin-left: auto;
      transition: transform 220ms ease;
    }
    .is-collapsed {
      transform: rotate(180deg);
    }
    &:hover {
      background: rgba(255, 255, 255, 0.035);
    }
  }
  &__activity {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #a4d8bd;
  }
  &__activity.is-active {
    background: #a9ceff;
  }
  &__count {
    color: #aebdd0;
    font-variant-numeric: tabular-nums;
  }
  &__list {
    max-height: min(390px, 48dvh);
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }
  &__card {
    padding: 16px 17px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  &__heading {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }
  &__icon {
    width: 24px;
    height: 24px;
    flex: none;
    color: #9fcaff;
  }
  &__title {
    display: grid;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }
  &__title strong {
    font-size: 13px;
    font-weight: 600;
    line-height: 1.5;
  }
  &__title span {
    font-size: 11px;
    color: #b4c0d1;
    line-height: 1.6;
  }
  &__close {
    border: 0;
    background: transparent;
    color: #b4c0d1;
    padding: 4px;
    cursor: pointer;
    border-radius: 6px;
  }
  &__close:hover {
    background: rgba(255, 255, 255, 0.08);
  }
  &__stages {
    display: flex;
    list-style: none;
    padding: 0;
    margin: 17px 0 0;
    gap: 8px;
  }
  &__stages li {
    flex: 1;
    min-width: 0;
    font-size: 10px;
    color: #95a2b5;
  }
  &__track {
    display: block;
    position: relative;
    overflow: hidden;
    height: 3px;
    margin-bottom: 8px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.1);
  }
  &__track i {
    display: block;
    height: 100%;
    background: #9fcaff;
    transform: scaleX(0);
    transform-origin: left;
    transition: transform 300ms ease;
  }
  &__stages .is-done {
    color: #d5e5f9;
    i {
      transform: scaleX(1);
    }
  }
  &__stages .is-current {
    color: #b8d6ff;
    i {
      width: 50%;
      animation: publication-flow 1.6s ease-in-out infinite;
    }
  }
  &__error {
    font-size: 12px;
    line-height: 1.6;
    color: #edbcac;
    overflow-wrap: anywhere;
    margin: 12px 0 0;
  }
  &__actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 12px;
    :deep(.el-button) {
      color: #b9d6ff;
      font-size: 12px;
    }
  }
  .is-published &__icon {
    color: #9ad6b5;
  }
  .is-published strong {
    color: #b5e6cb;
  }
  .is-failed &__icon,
  .is-unavailable &__icon {
    color: #edbcac;
  }
  &__check {
    stroke-dasharray: 22;
    stroke-dashoffset: 0;
    animation: publication-check 350ms ease-out;
  }
  .is-spinning {
    animation: publication-spin 1.2s linear infinite;
  }
  button:focus-visible {
    outline: 2px solid #9fcaff;
    outline-offset: -3px;
  }
  @media (max-width: 980px) {
    right: max(16px, calc((100vw - 380px) / 2));
  }
}
.publication-notice-enter-active,
.publication-item-enter-active {
  transition:
    transform 300ms cubic-bezier(0.2, 0, 0, 1),
    opacity 240ms ease;
}
.publication-notice-leave-active,
.publication-item-leave-active {
  transition:
    transform 180ms ease-in,
    opacity 180ms ease;
}
.publication-notice-enter-from,
.publication-notice-leave-to {
  transform: translateY(-12px) scale(0.97);
  opacity: 0;
}
.publication-item-enter-from,
.publication-item-leave-to {
  transform: translateY(-6px);
  opacity: 0;
}
@keyframes publication-spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes publication-flow {
  from {
    transform: translateX(-110%);
  }
  to {
    transform: translateX(210%);
  }
}
@keyframes publication-check {
  from {
    stroke-dashoffset: 22;
  }
}
@media (prefers-reduced-motion: reduce) {
  .publication-notice,
  .publication-notice *,
  .publication-notice-enter-active,
  .publication-notice-leave-active {
    animation: none !important;
    transition: none !important;
  }
  .publication-notice__stages .is-current i {
    transform: scaleX(1);
    opacity: 0.65;
  }
}
</style>
