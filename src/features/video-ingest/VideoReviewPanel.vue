<template>
  <section class="video-review" aria-labelledby="video-review-title">
    <div class="video-review__heading">
      <div>
        <h2 id="video-review-title">{{ job.filename }}</h2>
        <p>审核版本 {{ revision }} · {{ JOB_STATUS[job.status] || job.status }}</p>
      </div>
      <el-tag v-if="dirty" type="warning" size="small">草稿未保存</el-tag>
    </div>

    <template v-if="job.result">
      <video
        v-if="previewUrl"
        :key="job.id"
        class="video-review__player"
        :src="previewUrl"
        :poster="selectedFrame?.url || selectedFrame?.thumbnailUrl"
        controls
        playsinline
        preload="metadata"
        @error="previewFailed = true"
      >
        浏览器不支持视频预览。
      </video>
      <p v-if="previewFailed" class="video-review__hint" role="status">
        预览地址可能已过期。<button type="button" class="text-action" @click="refreshResources">
          刷新资源地址
        </button>
      </p>
      <p class="video-review__metadata">
        {{ job.result.metadata?.width }} × {{ job.result.metadata?.height }} ·
        {{ Number(job.result.metadata?.duration || 0).toFixed(1) }} 秒 ·
        {{ formatBytes(job.result.metadata?.size || job.size) }} ·
        {{ job.result.metadata?.codec || 'MP4' }}
      </p>

      <fieldset class="video-review__frames" :disabled="!editable || busy">
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
      <p v-if="failedFrames.length" class="video-review__hint">
        封面加载失败。<button type="button" class="text-action" @click="refreshResources">
          刷新候选帧
        </button>
      </p>

      <div v-if="conflict" class="video-review__conflict" role="alert">
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
      </div>

      <div v-if="editable" class="video-review__ai">
        <label :for="`video-ai-model-${job.id}`">AI 分类模型</label>
        <div class="video-review__ai-controls">
          <select
            :id="`video-ai-model-${job.id}`"
            :value="modelKey"
            :disabled="busy || !models.length"
            @change="$emit('update:modelKey', $event.target.value)"
          >
            <option v-if="!models.length" value="">暂无已配置模型</option>
            <option v-for="model in models" :key="model.key" :value="model.key">
              {{ model.name }}
            </option>
          </select>
          <el-button
            :loading="busy"
            :disabled="busy || !models.length || !!conflict"
            @click="$emit('analyze')"
          >
            分析所选封面
          </el-button>
        </div>
        <p class="video-review__hint">
          复用工作台已有 AI 凭证；更换封面后可重新分析。未配置凭证时可前往<router-link
            to="/settings"
            >设置</router-link
          >，也可直接人工填写。
        </p>
      </div>

      <form class="video-review__form" @submit.prevent="$emit('save')">
        <fieldset :disabled="!editable || busy">
          <div class="video-review__fields">
            <label>
              视频用途
              <select :value="draft.usage" @change="update('usage', $event.target.value)">
                <option v-for="usage in VIDEO_USAGES" :key="usage.value" :value="usage.value">
                  {{ usage.label }}
                </option>
              </select>
            </label>
            <label>
              主题分类
              <input
                :value="draft.topic"
                list="video-topics"
                maxlength="80"
                placeholder="选择已有视频分类或直接输入"
                @input="update('topic', $event.target.value)"
              />
              <datalist id="video-topics">
                <option v-for="topic in topicSuggestions" :key="topic" :value="topic" />
              </datalist>
              <span v-if="topicsError" class="video-review__hint"
                >已有视频分类暂时无法读取，仍可直接输入主题；刷新任务后重试。</span
              >
            </label>
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
        <div class="video-review__footer">
          <p class="video-review__hint">
            {{ editable ? '保存审核后，可在左侧勾选并批量发布。' : '该任务当前不可编辑。' }}
          </p>
          <el-button
            v-if="editable"
            type="primary"
            native-type="submit"
            :loading="busy"
            :disabled="busy || !!conflict"
            >保存审核</el-button
          >
        </div>
      </form>
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
import { VideoCamera } from '@element-plus/icons-vue'
import { JOB_STATUS, VIDEO_USAGES, formatBytes } from './domain'

const props = defineProps({
  job: { type: Object, required: true },
  draft: { type: Object, required: true },
  revision: Number,
  dirty: Boolean,
  editable: Boolean,
  busy: Boolean,
  conflict: Object,
  models: { type: Array, default: () => [] },
  modelKey: String,
  topicSuggestions: { type: Array, default: () => [] },
  topicsError: String
})
const emit = defineEmits([
  'update:draft',
  'update:modelKey',
  'save',
  'analyze',
  'accept-remote',
  'reapply',
  'refresh'
])
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
@use '@/styles/variables' as *;
.video-review {
  color: $gray-100;
  &__heading {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 20px;
  }
  h2 {
    font-size: 18px;
    margin: 0 0 6px;
    overflow-wrap: anywhere;
  }
  &__heading p,
  &__metadata {
    color: $gray-300;
    font-size: 13px;
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  &__player {
    display: block;
    width: 100%;
    max-height: 320px;
    background: #090d18;
    border-radius: 12px;
  }
  &__metadata {
    margin: 12px 0 24px;
  }
  fieldset {
    min-width: 0;
    border: 0;
    padding: 0;
    margin: 0;
  }
  legend {
    font-weight: 600;
    font-size: 14px;
    margin-bottom: 12px;
  }
  legend span {
    font-size: 12px;
    color: $gray-300;
    font-weight: 400;
    margin-left: 8px;
  }
  &__frame-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
  }
  &__frame {
    border: 2px solid transparent;
    padding: 0;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    color: $gray-100;
    cursor: pointer;
  }
  &__frame.is-selected {
    border-color: $primary-start;
    background: rgba($primary-start, 0.18);
  }
  &__frame img,
  &__frame-fallback {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 10;
    object-fit: cover;
  }
  &__frame-fallback {
    font-size: 11px;
    padding: 10px 2px;
    box-sizing: border-box;
  }
  &__frame-caption {
    display: flex;
    justify-content: space-between;
    padding: 6px;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  &__frame:disabled {
    cursor: default;
  }
  &__conflict {
    margin-top: 20px;
    padding: 16px;
    border: 1px solid rgba($warning, 0.5);
    background: rgba($warning, 0.08);
    border-radius: 12px;
    font-size: 13px;
  }
  &__conflict p {
    color: $gray-200;
    line-height: 1.6;
  }
  &__actions,
  &__ai-controls,
  &__footer {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  &__ai {
    margin-top: 24px;
    padding-bottom: 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  }
  &__ai > label {
    display: block;
    margin-bottom: 8px;
    color: $gray-200;
    font-size: 13px;
  }
  &__ai-controls select {
    min-width: 0;
    flex: 1;
  }
  &__form {
    margin-top: 20px;
  }
  &__fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  &__fields label {
    display: flex;
    flex-direction: column;
    gap: 8px;
    color: $gray-200;
    font-size: 13px;
  }
  &__wide {
    grid-column: 1 / -1;
  }
  input,
  select,
  textarea {
    box-sizing: border-box;
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    padding: 10px 12px;
    background: rgba(0, 0, 0, 0.18);
    color: $white;
    font: inherit;
    caret-color: $primary-start;
  }
  input::placeholder,
  textarea::placeholder {
    color: $gray-400;
  }
  select {
    color-scheme: dark;
  }
  textarea {
    resize: vertical;
    min-height: 82px;
  }
  input:disabled,
  select:disabled,
  textarea:disabled {
    opacity: 0.7;
  }
  button:focus-visible,
  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    outline: 2px solid $primary-start;
    outline-offset: 3px;
  }
  &__hint {
    color: $gray-300;
    font-size: 12px;
    line-height: 1.65;
    margin: 10px 0 0;
  }
  &__hint a,
  .text-action {
    color: #c4b5fd;
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
    margin-top: 20px;
    justify-content: space-between;
  }
  &__waiting {
    padding: 64px 16px;
    color: $gray-300;
    text-align: center;
  }
  @media (max-width: 520px) {
    &__frame-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    &__fields {
      grid-template-columns: 1fr;
    }
    &__ai-controls,
    &__footer {
      align-items: stretch;
      flex-direction: column;
    }
    &__actions {
      flex-wrap: wrap;
    }
  }
}
</style>
