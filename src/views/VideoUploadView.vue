<template>
  <MainLayout>
    <div class="video-workspace">
      <div class="video-workspace__heading">
        <div>
          <h1>视频工作台</h1>
          <p>上传视频、选择云端封面、审核并批量发布。</p>
        </div>
        <el-button :disabled="!configured" :loading="loading" @click="refresh">刷新任务</el-button>
      </div>

      <GlassCard v-if="!configured" :hoverable="false" class="video-workspace__unconfigured">
        <el-icon :size="40"><VideoCamera /></el-icon>
        <h2>视频服务尚未配置</h2>
        <p>部署工作台时设置 VITE_VIDEO_API_URL，即可启用视频上传、处理和发布。</p>
        <router-link to="/upload">返回图片上传</router-link>
      </GlassCard>

      <template v-else>
        <el-alert
          v-if="authStore.permissionChecked && !canWrite"
          title="当前账号没有写入权限，可查看任务和审核结果。"
          type="warning"
          :closable="false"
        />
        <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />

        <GlassCard :hoverable="false" padding="20px" class="video-workspace__upload">
          <div
            class="video-workspace__dropzone"
            :class="{ 'is-dragging': dragging }"
            @dragover.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @drop.prevent="handleDrop"
          >
            <el-icon :size="28"><UploadFilled /></el-icon>
            <div>
              <strong>选择或拖入源视频</strong>
              <p>单文件 ≤ 250 MB · 同时上传 2 个视频 · 最多并行 3 个分块</p>
            </div>
            <el-button type="primary" :disabled="!canWrite" @click="fileInput?.click()"
              >选择视频</el-button
            >
            <input
              ref="fileInput"
              type="file"
              accept=".mp4,.avi,.flv,.mov,.m4v,.webm,.mkv"
              multiple
              hidden
              @change="handleFiles"
            />
            <input
              ref="resumeInput"
              type="file"
              accept=".mp4,.avi,.flv,.mov,.m4v,.webm,.mkv"
              hidden
              @change="handleResume"
            />
          </div>
          <p class="video-workspace__hint">
            上传中可暂停；刷新后重选原视频，核对文件内容后继续。视频文件仅保留在当前页面内存中。
          </p>
          <div v-if="transfers.length" class="video-workspace__transfers" aria-live="polite">
            <div v-for="transfer in transfers" :key="transfer.id" class="video-workspace__transfer">
              <div class="video-workspace__transfer-title">
                <strong>{{ transfer.filename }}</strong>
                <span>{{ transferLabels[transfer.stage] || transfer.stage }}</span>
                <el-button
                  v-if="isTransferring(transfer)"
                  size="small"
                  @click="pauseTransfer(transfer.id)"
                  >暂停</el-button
                >
              </div>
              <el-progress
                :percentage="transfer.percent"
                :status="
                  transfer.stage === 'error'
                    ? 'exception'
                    : transfer.stage === 'done'
                      ? 'success'
                      : undefined
                "
                :stroke-width="5"
              />
              <p v-if="transfer.error" class="video-workspace__transfer-error">
                {{ transfer.error }}
              </p>
              <el-button
                v-if="transfer.jobId && ['paused', 'error'].includes(transfer.stage)"
                link
                type="primary"
                :disabled="!canWrite"
                @click="chooseResume(transfer.jobId)"
                >重选源视频继续</el-button
              >
            </div>
          </div>
        </GlassCard>

        <div class="video-workspace__content">
          <div class="video-workspace__queue">
            <GlassCard :hoverable="false" padding="20px" class="video-workspace__jobs">
              <div class="video-workspace__section-heading">
                <h2>
                  云端任务 <span>{{ jobs.length }}</span>
                </h2>
                <span class="video-workspace__hint">每 5 秒刷新</span>
              </div>
              <div class="video-workspace__tools">
                <select v-model="statusFilter" aria-label="按任务状态筛选">
                  <option value="all">全部状态</option>
                  <option value="review">待分析 / 审核</option>
                  <option value="uploading">待上传</option>
                  <option value="processing">排队 / 处理中</option>
                  <option value="published">已发布</option>
                  <option value="failed">失败 / 过期</option>
                </select>
                <el-button
                  size="small"
                  :disabled="!canWrite || !publishableJobs.length"
                  @click="toggleAll"
                  >{{ allSelected ? '取消全选' : '选择待发布' }}</el-button
                >
              </div>
              <div class="video-workspace__bulk">
                <span>已选 {{ selectedIds.length }} / 30 个</span>
                <el-button
                  type="primary"
                  size="small"
                  :disabled="!canWrite || !selectedIds.length || publishing"
                  :loading="publishing"
                  @click="publishSelected"
                  >批量发布</el-button
                >
              </div>
              <div v-if="!filteredJobs.length" class="video-workspace__empty">
                {{
                  loading
                    ? '正在加载云端任务…'
                    : jobs.length
                      ? '当前筛选下没有任务。'
                      : '还没有视频任务，选择源视频开始。'
                }}
              </div>
              <ul v-else class="video-workspace__job-list">
                <li
                  v-for="job in filteredJobs"
                  :key="job.id"
                  class="video-workspace__job"
                  :class="{ 'is-active': selectedJobId === job.id }"
                >
                  <div class="video-workspace__job-row">
                    <input
                      v-model="selectedIds"
                      type="checkbox"
                      :value="job.id"
                      :disabled="!canWrite || !canPublish(job)"
                      :aria-label="`选择发布 ${job.filename}`"
                    />
                    <button
                      type="button"
                      class="video-workspace__job-select"
                      :aria-current="selectedJobId === job.id ? 'true' : undefined"
                      :disabled="reviewBusy"
                      @click="selectJob(job.id)"
                    >
                      <strong>{{ job.review?.displayTitle || job.filename }}</strong>
                      <span>{{ job.filename }} · {{ formatBytes(job.size) }}</span>
                    </button>
                    <el-tag :type="statusType(job.status)" size="small">{{
                      JOB_STATUS[job.status] || job.status
                    }}</el-tag>
                  </div>
                  <p v-if="job.error" class="video-workspace__transfer-error">
                    {{ errorMessage(job.error) }}
                  </p>
                  <div class="video-workspace__job-actions">
                    <el-button
                      v-if="job.status === 'uploading'"
                      link
                      type="primary"
                      :disabled="!canWrite || hasActiveTransfer(job.id)"
                      @click="chooseResume(job.id)"
                      >{{ hasActiveTransfer(job.id) ? '本页上传中' : '重选源视频继续' }}</el-button
                    >
                    <el-button
                      v-if="job.status === 'failed'"
                      link
                      type="warning"
                      :disabled="!canWrite || retryingIds.includes(job.id)"
                      :loading="retryingIds.includes(job.id)"
                      @click="retryJob(job)"
                      >{{ job.publicationId ? '重试发布批次' : '重试云端处理' }}</el-button
                    >
                    <span v-if="job.status === 'expired'" class="video-workspace__hint"
                      >重新选择视频可创建新任务</span
                    >
                    <span v-if="job.createdAt" class="video-workspace__date">{{
                      formatDate(job.createdAt)
                    }}</span>
                  </div>
                </li>
              </ul>
            </GlassCard>

            <GlassCard :hoverable="false" padding="20px" class="video-workspace__publications">
              <div class="video-workspace__section-heading"><h2>发布批次</h2></div>
              <p v-if="!publications.length" class="video-workspace__hint">
                提交批量发布后，在这里跟踪数据写入与站点部署。
              </p>
              <article
                v-for="publication in publications"
                :key="publication.id"
                class="video-workspace__publication"
              >
                <div class="video-workspace__section-heading">
                  <strong>{{ publication.jobs?.length || 0 }} 个视频</strong>
                  <el-tag :type="statusType(publication.status)" size="small">{{
                    PUBLICATION_STATUS[publication.status] || publication.status
                  }}</el-tag>
                </div>
                <p class="video-workspace__hint">
                  批次 {{ publication.id.slice(0, 12) }} · {{ formatDate(publication.createdAt) }}
                </p>
                <ol class="video-workspace__stages" aria-label="发布阶段">
                  <li
                    v-for="(label, index) in publicationStages"
                    :key="label"
                    :class="{ 'is-complete': publicationStage(publication) >= index }"
                  >
                    {{ label }}
                  </li>
                </ol>
                <p v-if="publication.metadataCommitSha" class="video-workspace__hint">
                  数据提交 {{ publication.metadataCommitSha.slice(0, 10) }}
                </p>
                <p v-if="publication.deploymentId" class="video-workspace__hint">
                  部署 {{ publication.deploymentId }}
                </p>
                <p v-if="publication.error" class="video-workspace__transfer-error">
                  {{ errorMessage(publication.error) }}
                </p>
                <el-button
                  v-if="publication.status === 'failed'"
                  size="small"
                  type="warning"
                  :disabled="!canWrite || retryingIds.includes(publication.id)"
                  :loading="retryingIds.includes(publication.id)"
                  @click="retryPublication(publication.id)"
                  >继续发布</el-button
                >
                <p v-if="publicationErrors[publication.id]" class="video-workspace__transfer-error">
                  进度刷新失败：{{ publicationErrors[publication.id] }}
                </p>
              </article>
              <p
                v-for="(message, id) in missingPublicationErrors"
                :key="id"
                class="video-workspace__transfer-error"
              >
                批次 {{ id.slice(0, 12) }} 加载失败：{{ message }}
              </p>
            </GlassCard>
          </div>

          <GlassCard :hoverable="false" padding="24px" class="video-workspace__review">
            <VideoReviewPanel
              v-if="selectedJob && reviewDraft"
              v-model:draft="reviewDraft"
              :job="selectedJob"
              :revision="draftRevision"
              :dirty="isDirty"
              :editable="canWrite && canReview(selectedJob)"
              :busy="reviewBusy"
              :conflict="conflict"
              :has-credentials="credentialsStore.hasCredentials"
              :topic-suggestions="topics"
              :topics-error="topicsError"
              @save="saveReview()"
              @analyze="analyzeReview"
              @accept-remote="workspace.acceptRemoteReview()"
              @reapply="saveReview(true)"
              @refresh="refresh"
            />
            <div v-else class="video-workspace__review-empty">
              <el-icon :size="44"><VideoCamera /></el-icon>
              <h2>选择一个任务查看详情</h2>
              <p>云端处理完成后，即可预览视频和审核候选封面。</p>
            </div>
          </GlassCard>
        </div>
      </template>
    </div>
  </MainLayout>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { UploadFilled, VideoCamera } from '@element-plus/icons-vue'
import MainLayout from '@/components/MainLayout.vue'
import GlassCard from '@/components/GlassCard.vue'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useCredentialsStore } from '@/stores/credentials'
import { analyzeImage, CLASSIFIER_CONFIG } from '@/services/ai/classifier'
import VideoReviewPanel from '@/features/video-ingest/VideoReviewPanel.vue'
import { createVideoApi } from '@/features/video-ingest/api'
import { createVideoUploader } from '@/features/video-ingest/uploader'
import { createVideoWorkspace } from '@/features/video-ingest/workspace'
import {
  canPublish,
  canReview,
  errorMessage,
  formatBytes,
  JOB_STATUS,
  PUBLICATION_STATUS,
  validateVideoFile
} from '@/features/video-ingest/domain'

const authStore = useAuthStore()
const configStore = useConfigStore()
const credentialsStore = useCredentialsStore()
const api = createVideoApi({
  baseUrl: import.meta.env.VITE_VIDEO_API_URL,
  getToken: () => authStore.token
})
const configured = api.configured
const workspace = createVideoWorkspace({ api, owner: authStore.user?.login })
const uploader = createVideoUploader({ api })
const {
  jobs,
  publications,
  topics,
  topicsError,
  selectedJob,
  selectedJobId,
  selectedIds,
  loading,
  error,
  publicationErrors,
  reviewDraft,
  draftRevision,
  conflict,
  isDirty,
  hasUnsavedDrafts,
  publishableJobs,
  reviewBusy,
  publishing
} = workspace
const fileInput = ref(null)
const resumeInput = ref(null)
const resumeJobId = ref('')
const dragging = ref(false)
const statusFilter = ref('all')
const transfers = ref([])
const retryingIds = ref([])
const controllers = new Map()
const canWrite = computed(() => authStore.canUpload)

const filteredJobs = computed(() =>
  jobs.value.filter(
    job =>
      ({
        all: true,
        review: canReview(job),
        uploading: job.status === 'uploading',
        processing: ['queued', 'processing', 'publishing'].includes(job.status),
        published: job.status === 'published',
        failed: ['failed', 'expired'].includes(job.status)
      })[statusFilter.value]
  )
)
const allSelected = computed(
  () =>
    publishableJobs.value.length > 0 &&
    publishableJobs.value.every(job => selectedIds.value.includes(job.id))
)
const missingPublicationErrors = computed(() =>
  Object.fromEntries(
    Object.entries(publicationErrors.value).filter(
      ([id]) => !publications.value.some(publication => publication.id === id)
    )
  )
)
const transferLabels = {
  waiting: '等待上传',
  hashing: '校验文件',
  uploading: '上传分块',
  completing: '确认上传',
  done: '已提交云端',
  paused: '已暂停',
  error: '上传失败'
}
const publicationStages = ['排队', '写入', '部署', '完成']

function isTransferring(transfer) {
  return ['waiting', 'hashing', 'uploading', 'completing'].includes(transfer.stage)
}
function hasActiveTransfer(jobId) {
  return transfers.value.some(transfer => transfer.jobId === jobId && isTransferring(transfer))
}
function statusType(status) {
  return status === 'published'
    ? 'success'
    : ['failed', 'expired'].includes(status)
      ? 'danger'
      : ['awaiting_ai', 'awaiting_review'].includes(status)
        ? 'warning'
        : 'info'
}
function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    : ''
}
function publicationStage(publication) {
  if (publication.status === 'published') return 3
  if (publication.status === 'deploying' || publication.deploymentId) return 2
  if (publication.status === 'publishing' || publication.metadataCommitSha) return 1
  return 0
}

async function refresh() {
  await Promise.allSettled([workspace.refresh(), workspace.loadTopics()])
}
function toggleAll() {
  selectedIds.value = allSelected.value ? [] : publishableJobs.value.slice(0, 30).map(job => job.id)
}
async function selectJob(id) {
  workspace.selectJob(id)
  if (window.innerWidth < 780) {
    await nextTick()
    document
      .querySelector('.video-workspace__review')
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
}
function pauseTransfer(id) {
  controllers.get(id)?.abort()
}

async function addFiles(files, resumeJob = null) {
  if (!canWrite.value) return
  await Promise.allSettled(
    Array.from(files).map(async file => {
      try {
        validateVideoFile(file)
      } catch (failure) {
        ElMessage.error(`${file.name}：${errorMessage(failure)}`)
        return
      }
      const id = globalThis.crypto.randomUUID()
      const transfer = reactive({
        id,
        filename: file.name,
        jobId: resumeJob?.id || '',
        stage: 'waiting',
        percent: 0,
        error: ''
      })
      transfers.value.push(transfer)
      const controller = new globalThis.AbortController()
      controllers.set(id, controller)
      try {
        await uploader.upload(file, {
          job: resumeJob,
          signal: controller.signal,
          onProgress: progress => Object.assign(transfer, progress),
          onJob: job => {
            transfer.jobId = job.id
            workspace.upsertJob(job)
          }
        })
        transfer.stage = 'done'
        transfer.percent = 100
      } catch (failure) {
        transfer.stage = failure.name === 'AbortError' ? 'paused' : 'error'
        transfer.error = errorMessage(failure)
      } finally {
        controllers.delete(id)
      }
    })
  )
  await refresh()
}

function handleFiles(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  addFiles(files)
}
function handleDrop(event) {
  dragging.value = false
  addFiles(event.dataTransfer.files)
}
function chooseResume(id) {
  if (hasActiveTransfer(id)) return
  resumeJobId.value = id
  resumeInput.value?.click()
}
function handleResume(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  const job = jobs.value.find(item => item.id === resumeJobId.value)
  if (file && job) addFiles([file], job)
}

async function saveReview(useLatest = false) {
  try {
    await workspace.saveReview({ useLatest })
    ElMessage.success('审核已保存')
  } catch (failure) {
    ElMessage.error(errorMessage(failure))
  }
}
async function analyzeReview() {
  if (!credentialsStore.hasCredentials) {
    ElMessage.warning('请在设置中填写当前标签页的 API Key')
    return
  }
  try {
    await workspace.analyzeReview({
      analyzeImage,
      modelKey: CLASSIFIER_CONFIG.defaultModel,
      providerType: 'sub2api',
      credentials: credentialsStore.getCredentialsByProvider('sub2api')
    })
    ElMessage.success('封面分析完成，建议已保存，可继续人工审核')
  } catch (failure) {
    ElMessage.error(errorMessage(failure))
  }
}
async function publishSelected() {
  try {
    await workspace.publishSelected()
    ElMessage.success('发布批次已加入云端队列')
  } catch (failure) {
    ElMessage.error(errorMessage(failure))
    await refresh()
  }
}
async function retryJob(job) {
  retryingIds.value.push(job.id)
  try {
    await workspace.retryJob(job)
    ElMessage.success('已加入重试队列')
    await refresh()
  } catch (failure) {
    ElMessage.error(errorMessage(failure))
  } finally {
    retryingIds.value = retryingIds.value.filter(id => id !== job.id)
  }
}
async function retryPublication(id) {
  retryingIds.value.push(id)
  try {
    await workspace.retryPublication(id)
    ElMessage.success('发布批次已恢复')
    await refresh()
  } catch (failure) {
    ElMessage.error(errorMessage(failure))
  } finally {
    retryingIds.value = retryingIds.value.filter(item => item !== id)
  }
}

function beforeUnload(event) {
  if (controllers.size || hasUnsavedDrafts.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onBeforeRouteLeave(async () => {
  if (!controllers.size && !hasUnsavedDrafts.value) return true
  try {
    await ElMessageBox.confirm(
      '离开后本页上传会暂停，未保存的审核草稿会丢失。云端任务将继续，可重选源视频恢复上传。',
      '离开视频工作台',
      { confirmButtonText: '离开', cancelButtonText: '继续编辑', type: 'warning' }
    )
    return true
  } catch {
    return false
  }
})
onMounted(async () => {
  window.addEventListener('beforeunload', beforeUnload)
  if (!configured) return
  await Promise.allSettled([
    credentialsStore.loadCredentials(),
    !authStore.permissionChecked && configStore.isConfigured
      ? authStore.checkPermission(configStore.config.owner, configStore.config.repo)
      : Promise.resolve(),
    workspace.refresh(),
    workspace.loadTopics()
  ])
  workspace.startPolling()
})
onBeforeUnmount(() => {
  workspace.dispose()
  controllers.forEach(controller => controller.abort())
  window.removeEventListener('beforeunload', beforeUnload)
})
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;
.video-workspace {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px 4px 24px;
  color: $gray-100;
  scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
  &__heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin: 4px 0 24px;
  }
  h1 {
    font-size: 26px;
    margin: 0 0 8px;
  }
  &__heading p {
    font-size: 14px;
    color: $gray-300;
    margin: 0;
  }
  &__unconfigured {
    padding: 64px 24px !important;
    text-align: center;
  }
  &__unconfigured h2 {
    margin: 20px 0 12px;
    font-size: 21px;
  }
  &__unconfigured p {
    color: $gray-300;
  }
  &__unconfigured a {
    display: inline-block;
    margin-top: 16px;
    color: #c4b5fd;
  }
  :deep(.el-alert) {
    margin-bottom: 16px;
  }
  &__upload {
    margin-bottom: 24px;
  }
  &__dropzone {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 20px;
    border: 1px dashed rgba(255, 255, 255, 0.3);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.03);
  }
  &__dropzone.is-dragging {
    border-color: $primary-start;
    background: rgba($primary-start, 0.12);
  }
  &__dropzone > div {
    flex: 1;
  }
  &__dropzone strong {
    font-size: 15px;
  }
  &__dropzone p {
    margin: 6px 0 0;
    color: $gray-300;
    font-size: 12px;
  }
  &__hint {
    color: $gray-300;
    font-size: 12px;
    line-height: 1.65;
    margin: 10px 0 0;
  }
  &__transfers {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px 24px;
    margin-top: 20px;
  }
  &__transfer-title {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 12px;
    margin-bottom: 8px;
  }
  &__transfer-title strong {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 500;
  }
  &__transfer-title > span {
    color: $gray-300;
  }
  &__transfer-error {
    color: #fca5a5;
    font-size: 12px;
    margin: 8px 0;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
  &__content {
    display: grid;
    grid-template-columns: minmax(340px, 0.9fr) minmax(440px, 1.2fr);
    align-items: start;
    gap: 24px;
  }
  &__queue {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  &__section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  &__section-heading h2 {
    font-size: 17px;
    margin: 0;
  }
  &__section-heading h2 span {
    margin-left: 6px;
    color: $gray-300;
    font-size: 13px;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
  &__section-heading > .video-workspace__hint {
    margin: 0;
  }
  &__tools {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 20px 0 16px;
  }
  &__tools select {
    flex: 1;
    min-width: 0;
    color-scheme: dark;
    padding: 8px 10px;
    color: $white;
    font-size: 13px;
    background: rgba(0, 0, 0, 0.18);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
  }
  &__bulk {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    font-size: 13px;
    color: $gray-300;
  }
  &__job-list {
    list-style: none;
    padding: 0;
    margin: 0;
    max-height: 560px;
    overflow-y: auto;
    scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
  }
  &__job {
    padding: 16px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
  }
  &__job.is-active {
    background: rgba($primary-start, 0.12);
  }
  &__job-row {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  &__job-row input {
    accent-color: $primary-start;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
  &__job-select {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: 6px;
    border: 0;
    background: none;
    color: $gray-100;
    text-align: left;
    cursor: pointer;
    padding: 4px 0;
  }
  &__job-select strong,
  &__job-select span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  &__job-select strong {
    font-size: 13px;
    font-weight: 500;
  }
  &__job-select span {
    font-size: 11px;
    color: $gray-300;
  }
  &__job-actions {
    margin-left: 26px;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    min-height: 22px;
    margin-top: 6px;
  }
  &__date {
    font-size: 11px;
    color: $gray-300;
    font-variant-numeric: tabular-nums;
    margin-left: auto;
  }
  &__empty {
    color: $gray-300;
    font-size: 13px;
    text-align: center;
    padding: 40px 12px;
  }
  &__publication {
    padding: 20px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  &__publication:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }
  &__publication strong {
    font-size: 13px;
    font-weight: 500;
  }
  &__stages {
    display: flex;
    list-style: none;
    gap: 8px;
    padding: 0;
    margin: 16px 0;
  }
  &__stages li {
    flex: 1;
    padding-top: 8px;
    font-size: 11px;
    color: $gray-400;
    border-top: 2px solid rgba(255, 255, 255, 0.16);
  }
  &__stages li.is-complete {
    color: #c4b5fd;
    border-color: $primary-start;
  }
  &__review {
    min-width: 0;
  }
  &__review-empty {
    text-align: center;
    color: $gray-300;
    padding: 100px 16px;
  }
  &__review-empty h2 {
    font-size: 18px;
    margin: 20px 0 12px;
  }
  &__review-empty p {
    font-size: 13px;
  }
  button:focus-visible,
  select:focus-visible,
  input:focus-visible {
    outline: 2px solid $primary-start;
    outline-offset: 3px;
  }
  @media (max-width: 1000px) {
    &__content {
      grid-template-columns: minmax(280px, 0.8fr) minmax(360px, 1fr);
      gap: 16px;
    }
  }
  @media (max-width: 780px) {
    &__job-list {
      max-height: 360px;
    }
    &__content {
      grid-template-columns: 1fr;
    }
    &__transfers {
      grid-template-columns: 1fr;
    }
    &__dropzone {
      flex-wrap: wrap;
      padding: 16px;
    }
    &__dropzone > .el-icon {
      display: none;
    }
    &__dropzone > div {
      flex-basis: 100%;
    }
    &__dropzone > .el-button {
      width: 100%;
    }
    &__review {
      padding: 18px !important;
    }
    h1 {
      font-size: 22px;
    }
  }
}
</style>
