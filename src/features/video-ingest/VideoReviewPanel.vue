<template>
  <section class="video-review" aria-labelledby="video-review-title">
    <div class="video-review__heading">
      <div>
        <h2 id="video-review-title">{{ job.filename }}</h2>
        <p>
          {{ job.status === 'published' ? '发布记录' : '内容审核' }} ·
          {{ JOB_STATUS[job.status] || job.status }}<span v-if="revision"> · v{{ revision }}</span>
        </p>
      </div>
      <Transition name="studio-feedback"
        ><el-tag v-if="dirty && !isPublished" type="warning" size="small"
          >草稿未保存</el-tag
        ></Transition
      >
    </div>

    <template v-if="job.result">
      <video
        v-if="previewUrl"
        :key="job.id"
        class="video-review__player"
        crossorigin="anonymous"
        :src="previewUrl"
        :poster="selectedFrame?.url || selectedFrame?.thumbnailUrl"
        controls
        playsinline
        preload="metadata"
        @error="previewFailed = true"
      >
        浏览器不支持视频预览。
      </video>
      <Transition name="studio-feedback"
        ><p v-if="previewFailed" class="video-review__hint" role="status">
          预览地址可能已过期。<button type="button" class="text-action" @click="refreshResources">
            刷新资源地址
          </button>
        </p></Transition
      >
      <p class="video-review__metadata">
        {{ job.result.metadata?.width }} × {{ job.result.metadata?.height }} ·
        {{ Number(job.result.metadata?.duration || 0).toFixed(1) }} 秒 ·
        {{ formatBytes(job.result.metadata?.size || job.size) }} ·
        {{ job.result.metadata?.codec || 'MP4' }}
      </p>

      <fieldset v-if="!isPublished" class="video-review__frames" :disabled="!editable || busy">
        <legend>
          选择封面 <span>云端候选 {{ job.result.frames?.length || 0 }} 帧</span>
        </legend>
        <div class="video-review__frame-grid">
          <button
            v-for="frame in job.result.frames || []"
            :key="frame.id"
            type="button"
            class="video-review__frame"
            :class="{ 'is-selected': draft.selectedFrameId === frame.id }"
            :aria-pressed="draft.selectedFrameId === frame.id"
            :aria-label="`选择 ${Number(frame.timestamp).toFixed(1)} 秒处的封面`"
            @click="update('selectedFrameId', frame.id)"
          >
            <img
              v-if="(frame.thumbnailUrl || frame.url) && !failedFrames.includes(frame.id)"
              crossorigin="anonymous"
              :src="frame.thumbnailUrl || frame.url"
              :alt="`${Number(frame.timestamp).toFixed(1)} 秒候选封面`"
              loading="lazy"
              @error="failedFrames.push(frame.id)"
            />
            <span v-else class="video-review__frame-fallback">封面暂不可用</span>
            <span class="video-review__frame-caption">
              {{ Number(frame.timestamp).toFixed(1) }}s
              <span v-if="draft.selectedFrameId === frame.id">已选</span>
            </span>
          </button>
        </div>
      </fieldset>
      <Transition name="studio-feedback"
        ><p v-if="failedFrames.length" class="video-review__hint">
          封面加载失败。<button type="button" class="text-action" @click="refreshResources">
            刷新候选帧
          </button>
        </p></Transition
      >

      <el-collapse-transition
        ><div v-if="conflict && !isPublished" class="video-review__conflict" role="alert">
          <strong>{{ conflict.message }}</strong>
          <p>
            当前服务端版本
            {{ conflict.remoteRevision }}。核对后可以采纳远端内容，或使用最新版本提交这份草稿。
          </p>
          <div class="video-review__actions">
            <el-button size="small" :disabled="busy" @click="$emit('accept-remote')"
              >采纳远端内容</el-button
            >
            <el-button
              size="small"
              type="warning"
              :disabled="busy || !editable"
              @click="$emit('reapply')"
              >提交本地草稿</el-button
            >
          </div>
        </div></el-collapse-transition
      >

      <div v-if="editable && !isPublished" class="video-review__ai">
        <span class="video-review__section-label">辅助填写</span>
        <div class="video-review__ai-controls">
          <strong :title="model">{{ model || '未选择模型' }}</strong>
          <el-tag :type="hasModelReady ? 'success' : 'warning'" size="small">
            {{
              hasModelReady ? '当前标签页已配置' : hasCredentials ? '未选择模型' : '未配置 API Key'
            }}
          </el-tag>
          <el-button :loading="busy" :disabled="busy || !!conflict" @click="$emit('analyze')">
            {{ autoAnalyzing ? '正在自动分析' : analysisError ? '重试分析封面' : '分析所选封面' }}
          </el-button>
        </div>
        <p class="video-review__hint">
          与图片上传、AI 工坊共用当前标签页配置。<router-link to="/settings#ai-config">
            {{ hasModelReady ? '管理 AI 配置' : '去设置 AI' }} </router-link
          >；也可直接人工填写。
        </p>
        <el-collapse-transition>
          <p v-if="analysisError" class="video-review__analysis-error" role="alert">
            {{ analysisError }}
          </p>
        </el-collapse-transition>
      </div>

      <Transition name="studio-panel" mode="out-in"
        ><div v-if="isPublished" class="video-review__published" role="status">
          <div class="video-review__published-heading">
            <el-icon><CircleCheck /></el-icon>
            <div>
              <h3>已发布到画廊</h3>
              <p>内容审核与发布已完成，可在已发布历史中查看。</p>
            </div>
          </div>
          <dl class="video-review__summary">
            <div>
              <dt>展示标题</dt>
              <dd>{{ draft.displayTitle || job.filename }}</dd>
            </div>
            <div>
              <dt>分类</dt>
              <dd>{{ usageLabel }} · {{ draft.topic }}</dd>
            </div>
            <div>
              <dt>文件名</dt>
              <dd>{{ draft.filename }}</dd>
            </div>
            <div>
              <dt>描述</dt>
              <dd>{{ draft.description || '—' }}</dd>
            </div>
            <div>
              <dt>关键词</dt>
              <dd>{{ (draft.keywords || []).join(' · ') || '—' }}</dd>
            </div>
          </dl>
          <el-button @click="$emit('back-to-pending')">返回待办</el-button>
        </div>

        <form v-else class="video-review__form" @submit.prevent="$emit('save')">
          <fieldset :disabled="!editable || busy">
            <div class="video-review__fields">
              <div class="video-review__destination video-review__wide">
                <el-icon><Monitor /></el-icon>
                <span>发布到电脑壁纸</span>
              </div>
              <div class="video-review__field video-review__wide">
                <label for="video-topic">主题分类</label>
                <el-select
                  id="video-topic"
                  :model-value="draft.topic"
                  filterable
                  allow-create
                  default-first-option
                  :reserve-keyword="false"
                  :disabled="!editable || busy"
                  placeholder="搜索已有分类，或输入新主题后按 Enter"
                  @update:model-value="update('topic', $event)"
                >
                  <el-option
                    v-for="topic in topicSuggestions"
                    :key="topic"
                    :label="topic"
                    :value="topic"
                  />
                </el-select>
                <span v-if="topicsError" class="video-review__hint"
                  >已有分类暂时无法读取，仍可直接输入主题后按 Enter 确认。</span
                >
              </div>
              <label class="video-review__wide">
                发布文件名
                <input
                  :value="draft.filename"
                  maxlength="150"
                  placeholder="描述性的文件名.mp4"
                  @input="update('filename', $event.target.value)"
                />
              </label>
              <label class="video-review__wide">
                展示标题
                <input
                  :value="draft.displayTitle"
                  maxlength="200"
                  placeholder="面向访客的视频标题"
                  @input="update('displayTitle', $event.target.value)"
                />
              </label>
              <label class="video-review__wide">
                描述
                <textarea
                  :value="draft.description"
                  rows="3"
                  maxlength="2000"
                  placeholder="描述画面内容与氛围"
                  @input="update('description', $event.target.value)"
                />
              </label>
              <label class="video-review__wide">
                关键词
                <input
                  :value="keywordText"
                  maxlength="600"
                  placeholder="多个关键词用逗号分隔"
                  @focus="keywordEditing = true"
                  @blur="keywordEditing = false"
                  @input="updateKeywords($event.target.value)"
                />
              </label>
            </div>
          </fieldset>
          <p v-if="draft.ai" class="video-review__hint">
            AI：{{ draft.ai.model }} · 置信度 {{ Math.round((draft.ai.confidence || 0) * 100) }}%
            <span v-if="draft.ai.frameId !== draft.selectedFrameId">
              · 封面已更换，保存时清除旧分析标记</span
            >
          </p>
        </form></Transition
      >
      <div v-if="!isPublished" class="video-review__footer">
        <div class="video-review__save-state" aria-live="polite">
          <span class="video-review__save-dot" :class="{ 'is-ready': publishReady }" />
          <span>{{ publishHint }}</span>
        </div>
        <div class="video-review__footer-actions">
          <el-button
            v-if="editable"
            :loading="busy"
            :disabled="busy || publishing || !!conflict"
            @click="$emit('save')"
            >保存审核</el-button
          >
          <el-button
            type="primary"
            :icon="Promotion"
            :loading="publishing"
            :disabled="!editable || busy || publishing"
            @click="publish"
          >
            {{ job.status === 'publishing' ? '视频发布中' : '直接发布视频' }}
          </el-button>
        </div>
      </div>
    </template>
    <div v-else class="video-review__waiting">
      <el-icon :size="36"><VideoCamera /></el-icon>
      <p>{{ waitingMessage }}</p>
      <p class="video-review__hint">可以离开此页，重新进入后会自动恢复云端任务。</p>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { VideoCamera, CircleCheck, Monitor, Promotion } from '@element-plus/icons-vue'
import { JOB_STATUS, VIDEO_USAGES, formatBytes, canPublish } from './domain'

const props = defineProps({
  job: { type: Object, required: true },
  draft: { type: Object, required: true },
  revision: Number,
  dirty: Boolean,
  editable: Boolean,
  busy: Boolean,
  publishing: Boolean,
  conflict: Object,
  hasCredentials: Boolean,
  hasModelReady: Boolean,
  model: { type: String, default: '' },
  autoAnalyzing: Boolean,
  analysisError: { type: String, default: '' },
  topicSuggestions: { type: Array, default: () => [] },
  topicsError: String
})
const emit = defineEmits([
  'update:draft',
  'save',
  'publish',
  'publish-blocked',
  'analyze',
  'accept-remote',
  'reapply',
  'refresh',
  'back-to-pending'
])
const isPublished = computed(() => props.job.status === 'published')
const publishReady = computed(
  () => props.editable && canPublish(props.job) && !props.dirty && !props.conflict
)
const publishHint = computed(() => {
  if (props.job.status === 'publishing') return '云端正在发布，可继续处理其他视频'
  if (!props.editable) return '当前任务暂不可发布'
  if (props.conflict) return '请先处理审核版本冲突'
  if (props.dirty) return '有未保存的修改，请先保存审核'
  if (!canPublish(props.job)) return '完善信息并保存审核后即可发布'
  return '审核已保存，可以直接发布'
})
function publish() {
  if (!publishReady.value) return emit('publish-blocked', publishHint.value)
  emit('publish')
}

const usageLabel = computed(
  () => VIDEO_USAGES.find(usage => usage.value === props.draft.usage)?.label || props.draft.usage
)
const failedFrames = ref([])
const previewFailed = ref(false)
const previewUrl = ref('')
const refreshRequested = ref(false)
const selectedFrame = computed(() =>
  props.job.result?.frames?.find(frame => frame.id === props.draft.selectedFrameId)
)
const keywordText = ref('')
const keywordEditing = ref(false)
const waitingMessage = computed(
  () =>
    ({
      uploading: '上传源视频后，云端将生成预览和 5 帧候选封面。',
      queued: '视频已上传，正在等待云端处理。',
      processing: '正在生成兼容视频、轻量预览和候选封面。',
      failed: '处理失败，请查看错误详情并重试。',
      expired: '任务已过期，请重新选择视频创建任务。'
    })[props.job.status] || '正在等待处理结果。'
)

function update(field, value) {
  emit('update:draft', { ...props.draft, [field]: value })
}
function updateKeywords(value) {
  keywordText.value = value
  update(
    'keywords',
    value
      .split(/[,，、]/)
      .map(keyword => keyword.trim())
      .filter(Boolean)
  )
}
function refreshResources() {
  refreshRequested.value = true
  emit('refresh')
}
watch(
  () => [props.job.id, props.draft.keywords],
  () => {
    if (!keywordEditing.value) keywordText.value = (props.draft.keywords || []).join(', ')
  },
  { immediate: true }
)
watch(
  () => props.job,
  (job, previous) => {
    if (!previewUrl.value || job.id !== previous?.id || refreshRequested.value) {
      previewUrl.value = job.result?.preview?.url || ''
      previewFailed.value = false
      refreshRequested.value = false
    }
    failedFrames.value = []
  },
  { immediate: true }
)
</script>

<style scoped lang="scss">
.video-review {
  &__analysis-error {
    margin: 10px 0 0;
    color: #efb4a0;
    font-size: 12px;
    line-height: 1.6;
  }
  --review-text: var(--studio-text, #f4f6fb);
  --review-muted: var(--studio-muted, #b1b9c9);
  --review-border: var(--studio-border, rgba(255, 255, 255, 0.13));
  --review-accent: var(--studio-accent, #7db7ff);
  color: var(--review-text);
  &__heading {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 16px;
    margin-bottom: 20px;
  }
  h2 {
    margin: 0 0 5px;
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -0.018em;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  &__heading p,
  &__metadata {
    margin: 0;
    color: var(--review-muted);
    font-size: 12px;
    line-height: 1.5;
    font-variant-numeric: tabular-nums;
  }
  &__player {
    display: block;
    width: 100%;
    max-height: 430px;
    aspect-ratio: 16 / 9;
    background: #080b11;
    border-radius: 17px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  }
  &__metadata {
    margin: 10px 0 22px;
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
  }
  legend {
    font-weight: 500;
    font-size: 13px;
    margin-bottom: 10px;
  }
  legend span {
    color: var(--review-muted);
    margin-left: 8px;
    font-size: 12px;
    font-weight: 400;
  }
  &__frame-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
  }
  &__frame {
    border: 2px solid transparent;
    padding: 3px;
    border-radius: 13px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.035);
    color: var(--review-text);
    cursor: pointer;
    transition:
      border-color 160ms,
      background 160ms;
  }
  &__frame.is-selected {
    border-color: var(--review-accent);
    background: rgba(125, 183, 255, 0.12);
  }
  &__frame img,
  &__frame-fallback {
    display: block;
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    border-radius: 8px;
  }
  &__frame-fallback {
    font-size: 11px;
    padding: 10px 2px;
    box-sizing: border-box;
  }
  &__frame-caption {
    display: flex;
    justify-content: space-between;
    padding: 7px 3px 4px;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  &__frame:disabled {
    cursor: default;
  }
  &__conflict {
    margin-top: 20px;
    padding: 16px;
    border: 1px solid #6d593c;
    background: #2e281e;
    border-radius: 16px;
    font-size: 13px;
  }
  &__conflict p {
    line-height: 1.6;
  }
  &__actions,
  &__ai-controls,
  &__footer {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  &__ai {
    margin-top: 22px;
    padding: 15px 16px;
    background: rgba(120, 139, 168, 0.065);
    border-radius: 17px;
  }
  &__section-label {
    display: block;
    color: var(--review-muted);
    font-size: 12px;
    margin-bottom: 10px;
  }
  &__ai-controls strong {
    max-width: 100%;
    overflow-wrap: anywhere;
    font-size: 13px;
    font-weight: 500;
  }
  &__ai-controls .el-button {
    margin-left: auto;
  }
  &__form {
    margin-top: 20px;
  }
  &__fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  &__fields label,
  &__field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 13px;
    color: #d0d7e3;
  }
  &__wide {
    grid-column: 1 / -1;
  }
  &__destination {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--review-muted);
    font-size: 12px;
  }
  input,
  textarea {
    box-sizing: border-box;
    width: 100%;
    min-height: 38px;
    border: 1px solid var(--review-border);
    border-radius: 11px;
    padding: 10px 12px;
    background: rgba(8, 13, 23, 0.24);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.08);
    color: var(--review-text);
    font: inherit;
    line-height: 1.5;
    caret-color: var(--review-accent);
    transition: border-color 160ms;
  }
  input::placeholder,
  textarea::placeholder {
    color: #919aab;
  }
  textarea {
    resize: vertical;
    min-height: 84px;
  }
  input:disabled,
  textarea:disabled {
    opacity: 0.65;
  }
  button:focus-visible,
  input:focus-visible,
  textarea:focus-visible {
    outline: 2px solid var(--review-accent);
    outline-offset: 3px;
  }
  &__hint {
    color: var(--review-muted);
    font-size: 12px;
    line-height: 1.65;
    margin: 10px 0 0;
  }
  &__hint a,
  .text-action {
    color: #a8d0ff;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .text-action {
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    cursor: pointer;
  }
  &__footer {
    position: sticky;
    z-index: 2;
    bottom: calc(-1 * var(--review-padding, 22px));
    margin: 24px calc(-1 * var(--review-padding, 22px)) calc(-1 * var(--review-padding, 22px));
    padding: 14px var(--review-padding, 22px) 16px;
    border-top: 1px solid var(--review-border);
    background: rgba(25, 31, 42, 0.94);
    backdrop-filter: blur(24px) saturate(1.4);
    box-shadow: 0 -8px 24px rgba(8, 12, 20, 0.08);
    justify-content: space-between;
  }
  &__save-state {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
    color: var(--review-muted);
  }
  &__save-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #d9ba83;
    flex: none;
    &.is-ready {
      background: #9bd5b7;
    }
  }
  &__footer-actions {
    display: flex;
    gap: 8px;
    margin-left: auto;
    :deep(.el-button) {
      margin: 0;
      border-radius: 12px;
      min-height: 38px;
    }
  }
  &__waiting {
    padding: 72px 20px;
    color: var(--review-muted);
    text-align: center;
  }
  &__published {
    border-top: 1px solid var(--review-border);
    padding-top: 20px;
  }
  &__published-heading {
    display: flex;
    align-items: start;
    gap: 10px;
  }
  &__published-heading .el-icon {
    color: #89b6a0;
    font-size: 22px;
  }
  &__published-heading h3 {
    margin: 0 0 5px;
    font-size: 16px;
  }
  &__published-heading p {
    margin: 0;
    color: var(--review-muted);
    font-size: 12px;
    line-height: 1.6;
  }
  &__summary {
    margin: 24px 0;
    display: grid;
    gap: 16px;
  }
  &__summary div {
    display: grid;
    grid-template-columns: 70px 1fr;
    gap: 14px;
    font-size: 13px;
    line-height: 1.6;
  }
  &__summary dt {
    color: var(--review-muted);
  }
  &__summary dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  @media (max-width: 520px) {
    &__frame-grid {
      display: flex;
      overflow-x: auto;
      padding-bottom: 5px;
    }
    &__frame {
      flex: 0 0 108px;
    }
    &__fields {
      grid-template-columns: 1fr;
    }
    &__ai-controls .el-button {
      margin-left: 0;
      width: 100%;
    }
    &__footer {
      align-items: stretch;
      flex-direction: column;
    }
    &__footer-actions {
      margin-left: 0;
      :deep(.el-button) {
        flex: 1;
      }
    }
  }
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      transition: none !important;
      animation: none !important;
    }
  }
}
</style>
