<template>
  <section class="video-job-queue" aria-label="视频任务列表">
    <div class="video-job-queue__navigation">
      <el-segmented
        class="video-job-queue__tabs"
        :model-value="tab"
        :options="[
          { label: `待办 ${pendingJobs.length}`, value: 'pending' },
          { label: `已发布 ${publishedJobs.length}`, value: 'published' }
        ]"
        aria-label="视频任务分区"
        @update:model-value="$emit('update:tab', $event)"
      />
    </div>
    <div class="video-job-queue__toolbar">
      <template v-if="tab === 'pending'">
        <el-segmented
          v-model="filter"
          class="video-job-queue__filters"
          :options="filters"
          aria-label="按任务状态筛选"
        />
        <el-button v-if="publishable.length && canWrite" link @click="toggleAll">
          {{ allSelected ? '取消全选' : '批量选择' }}
        </el-button>
      </template>
      <span v-else class="video-job-queue__history-label">已发布内容 · 只读查看</span>
    </div>
    <el-collapse-transition
      ><div v-if="tab === 'pending' && selected.length" class="video-job-queue__bulk" role="status">
        <span>已选 {{ selected.length }} / 30</span>
        <el-button
          type="primary"
          size="small"
          :disabled="!canWrite || publishing"
          :loading="publishing"
          @click="$emit('publish')"
          >批量发布</el-button
        >
      </div></el-collapse-transition
    >
    <div class="video-job-queue__viewport">
      <Transition name="studio-feedback"
        ><div v-if="!visibleJobs.length" class="video-job-queue__empty">
          <el-icon><VideoCamera /></el-icon>
          <strong>{{
            loading
              ? '正在加载任务'
              : tab === 'published'
                ? '暂无发布记录'
                : pendingJobs.length
                  ? '此状态下没有任务'
                  : '待办已清空'
          }}</strong>
          <p>
            {{
              tab === 'published'
                ? '发布完成的视频会保留在这里。'
                : '添加视频后，在这里跟进上传、审核与发布。'
            }}
          </p>
        </div></Transition
      >
      <TransitionGroup
        :aria-hidden="!visibleJobs.length"
        :inert="!visibleJobs.length"
        name="studio-list"
        tag="ul"
        class="video-job-queue__list"
        data-scroll-region
        tabindex="0"
        aria-label="视频队列，可独立滚动"
      >
        <li
          v-for="job in visibleJobs"
          :key="job.id"
          class="video-job-queue__item"
          :class="{ 'is-active': selectedJobId === job.id }"
        >
          <div class="video-job-queue__row">
            <span v-if="tab === 'pending'" class="video-job-queue__check">
              <el-checkbox
                v-if="canPublish(job)"
                :model-value="selected.includes(job.id)"
                :disabled="!canWrite || publishing"
                :aria-label="`加入批量发布 ${job.filename}`"
                @change="toggleJob(job.id, $event)"
              />
            </span>
            <button
              class="video-job-queue__select"
              type="button"
              :aria-current="selectedJobId === job.id ? 'true' : undefined"
              :disabled="busy"
              @click="$emit('select', job.id)"
            >
              <span class="video-job-queue__thumbnail">
                <img
                  v-if="thumbnail(job) && !failedImages.includes(job.id)"
                  :src="thumbnail(job)"
                  alt=""
                  crossorigin="anonymous"
                  loading="lazy"
                  @error="failedImages.push(job.id)"
                />
                <el-icon v-else><VideoCamera /></el-icon>
              </span>
              <span class="video-job-queue__copy">
                <strong :title="job.filename">{{ job.filename }}</strong>
                <span
                  >{{ formatBytes(job.size)
                  }}<template v-if="job.result?.metadata?.duration">
                    · {{ Number(job.result.metadata.duration).toFixed(0) }} 秒</template
                  ></span
                >
                <span class="video-job-queue__next">{{ nextStep(job) }}</span>
              </span>
            </button>
            <el-tag :type="statusType(job.status)" size="small" effect="plain">{{
              analyzingJobId === job.id ? '分析中' : JOB_STATUS[job.status] || job.status
            }}</el-tag>
          </div>
          <Transition name="studio-feedback"
            ><p v-if="job.error" class="video-job-queue__error">
              {{ errorMessage(job.error) }}
            </p></Transition
          >
          <div
            v-if="['uploading', 'failed', 'expired'].includes(job.status)"
            class="video-job-queue__actions"
          >
            <el-button
              v-if="job.status === 'uploading'"
              link
              :disabled="!canWrite || activeJobIds.includes(job.id)"
              @click="$emit('resume', job.id)"
              >{{ activeJobIds.includes(job.id) ? '本页上传中' : '重选源视频继续' }}</el-button
            >
            <el-button
              v-if="job.status === 'failed'"
              link
              :disabled="!canWrite || retryingIds.includes(job.id)"
              :loading="retryingIds.includes(job.id)"
              @click="$emit('retry', job)"
              >{{ job.publicationId ? '继续发布' : '重试处理' }}</el-button
            >
            <span v-if="job.status === 'expired'">请重新添加源视频</span>
          </div>
        </li>
      </TransitionGroup>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { VideoCamera } from '@element-plus/icons-vue'
import { canPublish, canReview, errorMessage, formatBytes, JOB_STATUS } from './domain'

const props = defineProps({
  jobs: { type: Array, default: () => [] },
  tab: { type: String, default: 'pending' },
  selectedIds: { type: Array, default: () => [] },
  selectedJobId: String,
  canWrite: Boolean,
  busy: Boolean,
  publishing: Boolean,
  loading: Boolean,
  activeJobIds: { type: Array, default: () => [] },
  retryingIds: { type: Array, default: () => [] },
  analyzingJobId: { type: String, default: '' },
  analysisErrors: { type: Object, default: () => ({}) }
})
const emit = defineEmits([
  'update:tab',
  'update:selectedIds',
  'select',
  'publish',
  'resume',
  'retry'
])
const filter = ref('all')
const failedImages = ref([])
const filters = [
  { label: '全部', value: 'all' },
  { label: '待审核', value: 'review' },
  { label: '处理中', value: 'processing' },
  { label: '需处理', value: 'failed' }
]
const pendingJobs = computed(() => props.jobs.filter(job => job.status !== 'published'))
const publishedJobs = computed(() => props.jobs.filter(job => job.status === 'published'))
const publishable = computed(() => pendingJobs.value.filter(canPublish))
const selected = computed(() =>
  props.selectedIds.filter(id => publishable.value.some(job => job.id === id))
)
const allSelected = computed(
  () =>
    publishable.value.length > 0 && publishable.value.every(job => selected.value.includes(job.id))
)
const visibleJobs = computed(() =>
  props.tab === 'published'
    ? publishedJobs.value
    : pendingJobs.value.filter(
        job =>
          ({
            all: true,
            review: canReview(job),
            processing: ['queued', 'processing', 'publishing'].includes(job.status),
            failed: ['failed', 'expired', 'uploading'].includes(job.status)
          })[filter.value]
      )
)
function toggleAll() {
  emit(
    'update:selectedIds',
    allSelected.value ? [] : publishable.value.slice(0, 30).map(job => job.id)
  )
}
function toggleJob(id, checked) {
  emit(
    'update:selectedIds',
    checked
      ? [...new Set([...selected.value, id])].slice(0, 30)
      : selected.value.filter(value => value !== id)
  )
}
function thumbnail(job) {
  const frames = job.result?.frames || []
  const frame = frames.find(item => item.id === job.review?.selectedFrameId) || frames[0]
  return frame?.thumbnailUrl || frame?.url || ''
}
function statusType(status) {
  return status === 'published'
    ? 'success'
    : ['failed', 'expired'].includes(status)
      ? 'danger'
      : canReview({ status })
        ? 'warning'
        : 'info'
}
function nextStep(job) {
  if (props.analyzingJobId === job.id) return '正在自动分析封面'
  if (props.analysisErrors[job.id]) return '分析已暂停，打开任务后可重试'
  if (props.activeJobIds.includes(job.id)) return '正在上传源视频'
  if (canPublish(job)) return '审核已保存，可发布'
  return (
    {
      uploading: '继续上传源视频',
      queued: '等待云端生成预览',
      processing: '正在生成预览与封面',
      awaiting_ai: '选择封面，完善发布信息',
      awaiting_review: '检查信息并保存审核',
      publishing: '发布中，完成后移入历史',
      published: '已归档，可查看发布信息',
      failed: '处理失败，可重试',
      expired: '任务过期，需要重新上传'
    }[job.status] || ''
  )
}
</script>

<style scoped lang="scss">
.video-job-queue {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  color: var(--studio-text, #f4f6fb);
  &__navigation {
    flex: none;
    display: flex;
    padding: 3px 4px 17px;
  }
  &__tabs {
    width: 100%;
    min-height: 40px;
    border-radius: 999px;
    padding: 4px;
    background: rgba(84, 96, 117, 0.26);
    border: 1px solid rgba(255, 255, 255, 0.13);
    box-shadow:
      inset 0 1px rgba(255, 255, 255, 0.13),
      0 2px 7px rgba(0, 0, 0, 0.1);
    backdrop-filter: blur(22px) saturate(1.5);
    --el-segmented-item-selected-bg-color: rgba(182, 201, 230, 0.18);
    --el-segmented-item-selected-color: #fff;
  }
  &__tabs :deep(.el-segmented__group) {
    display: flex;
    width: 100%;
  }
  &__tabs :deep(.el-segmented__item) {
    flex: 1;
    min-height: 30px;
    border-radius: 999px;
    font-size: 13px;
  }
  &__tabs :deep(.el-segmented__item-selected) {
    border-radius: 999px;
    box-shadow:
      inset 0 1px rgba(255, 255, 255, 0.19),
      0 1px 3px rgba(0, 0, 0, 0.18);
  }
  &__toolbar {
    min-height: 44px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    padding: 0 4px 12px;
  }
  &__filters {
    --el-segmented-bg-color: transparent;
    --el-segmented-item-selected-bg-color: rgba(155, 180, 219, 0.13);
    --el-segmented-item-selected-color: #dceaff;
    --el-segmented-color: #b1b9c9;
    font-size: 11px;
  }
  &__filters :deep(.el-segmented__item),
  &__filters :deep(.el-segmented__item-selected) {
    border-radius: 999px;
  }
  &__bulk {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 0 4px 10px;
    padding: 10px 12px;
    background: rgba(106, 151, 217, 0.15);
    border-radius: 16px;
    font-size: 12px;
  }
  &__history-label {
    font-size: 12px;
    color: var(--studio-muted);
  }
  &__viewport {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  &__list {
    position: relative;
    height: 100%;
    min-height: 0;
    overscroll-behavior: contain;
    list-style: none;
    padding: 0;
    margin: 0;
    overflow: auto;
    scrollbar-width: thin;
  }
  &__item {
    padding: 14px 10px;
    border-radius: 17px;
    transition:
      background 180ms,
      opacity 220ms var(--studio-ease-out),
      transform 240ms var(--studio-ease-out);
  }
  &__item + &__item {
    margin-top: 4px;
  }
  &__item:hover {
    background: rgba(134, 151, 180, 0.09);
  }
  &__item.is-active {
    background: rgba(122, 160, 213, 0.16);
    box-shadow: inset 0 1px rgba(255, 255, 255, 0.07);
  }
  &__row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  &__check {
    width: 16px;
    flex: none;
  }
  &__row :deep(.el-checkbox) {
    margin: 0;
  }
  &__row :deep(.el-tag) {
    flex: none;
    font-size: 10px;
    padding: 0 6px;
    border-radius: 999px;
    border: 0;
  }
  &__select {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    gap: 12px;
    color: inherit;
    border: 0;
    background: none;
    padding: 0;
    text-align: left;
    cursor: pointer;
  }
  &__list:focus-visible {
    outline: 2px solid var(--studio-accent, #7db7ff);
    outline-offset: -2px;
    border-radius: 14px;
  }
  &__select:focus-visible {
    outline: 2px solid var(--studio-accent, #7db7ff);
    outline-offset: 4px;
    border-radius: 11px;
  }
  &__thumbnail {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 68px;
    height: 58px;
    overflow: hidden;
    border-radius: 11px;
    background: rgba(6, 11, 20, 0.42);
    color: #9aa8bd;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
  }
  &__thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  &__copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 4px;
  }
  &__copy strong {
    font-size: 13px;
    font-weight: 550;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__copy > span {
    font-size: 11px;
    line-height: 1.4;
    color: var(--studio-muted, #b1b9c9);
  }
  &__copy .video-job-queue__next {
    color: #bccbdf;
    font-size: 10px;
  }
  &__error {
    margin: 8px 0 0;
    color: #ffb6b6;
    font-size: 12px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  &__actions {
    margin: 8px 0 0 92px;
    font-size: 12px;
    color: var(--studio-muted, #b1b9c9);
  }
  &__empty {
    position: absolute;
    inset: 0;
    z-index: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    justify-content: center;
    padding: 24px;
    text-align: center;
  }
  &__empty .el-icon {
    color: #8a98af;
    font-size: 30px;
  }
  &__empty strong {
    font-size: 14px;
    font-weight: 500;
  }
  &__empty p {
    margin: 0;
    color: var(--studio-muted, #b1b9c9);
    font-size: 12px;
    line-height: 1.7;
  }
  @media (max-width: 520px) {
    &__row {
      gap: 7px;
    }
    &__item {
      padding: 13px 8px;
    }
    &__thumbnail {
      flex-basis: 60px;
      height: 56px;
    }
    &__copy .video-job-queue__next {
      font-size: 10px;
    }
    &__select {
      gap: 10px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      transition: none !important;
    }
  }
}
</style>
