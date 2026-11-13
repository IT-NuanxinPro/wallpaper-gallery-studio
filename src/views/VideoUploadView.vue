<template>
  <MainLayout>
    <div class="video-workspace">
      <div class="video-workspace__heading">
        <div>
          <h1>视频工作台</h1>
          <p>整理视频，选择封面，准备发布。</p>
        </div>
        <el-button
          class="video-workspace__refresh"
          circle
          :icon="Refresh"
          :disabled="!configured"
          :loading="loading"
          aria-label="刷新任务"
          title="刷新任务"
          @click="refresh"
        />
      </div>

      <section v-if="!configured" class="video-workspace__unconfigured">
        <el-icon :size="40"><VideoCamera /></el-icon>
        <h2>视频服务尚未配置</h2>
        <p>部署工作台时设置 VITE_VIDEO_API_URL，即可启用视频上传、处理和发布。</p>
        <router-link to="/upload">返回图片上传</router-link>
      </section>

      <template v-else>
        <Transition name="studio-feedback"
          ><el-alert
            v-if="authStore.permissionChecked && !canWrite"
            title="当前账号没有写入权限，可查看任务和审核结果。"
            type="warning"
            :closable="false"
        /></Transition>
        <Transition name="studio-feedback"
          ><el-alert v-if="error" :title="error" type="error" :closable="false" show-icon
        /></Transition>

        <section class="video-workspace__upload" aria-label="添加视频">
          <div
            class="video-workspace__dropzone"
            :class="{ 'is-dragging': dragging }"
            @dragover.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @drop.prevent="handleDrop"
          >
            <span class="video-workspace__upload-icon"
              ><el-icon :size="25"><Upload /></el-icon
            ></span>
            <div>
              <strong>添加源视频</strong>
              <p>拖入文件或点击添加 · MP4、MOV、WebM 等 · 单文件 ≤ 250 MB</p>
            </div>
            <el-button type="primary" :disabled="!canWrite" @click="chooseFiles"
              >添加视频</el-button
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
            上传可暂停并继续。云端任务会自动保存，离开后仍可回来审核。
          </p>
          <el-collapse-transition
            ><TransitionGroup
              v-if="transfers.length"
              name="studio-list"
              tag="div"
              class="video-workspace__transfers"
              data-scroll-region
              aria-live="polite"
            >
              <div
                v-for="transfer in transfers"
                :key="transfer.id"
                class="video-workspace__transfer"
              >
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
                <Transition name="studio-feedback"
                  ><p
                    v-if="transfer.error && transfer.stage === 'error'"
                    class="video-workspace__transfer-error"
                  >
                    {{ transfer.error }}
                  </p></Transition
                >
                <el-button
                  v-if="
                    ['paused', 'error'].includes(transfer.stage) &&
                    uploadManager.canRetry(transfer.id)
                  "
                  link
                  @click="retryTransfer(transfer.id)"
                  >继续上传</el-button
                >
                <el-button
                  v-if="transfer.jobId && ['paused', 'error'].includes(transfer.stage)"
                  link
                  type="primary"
                  :disabled="!canWrite"
                  @click="chooseResume(transfer.jobId)"
                  >重选源视频继续</el-button
                >
              </div>
            </TransitionGroup></el-collapse-transition
          >
        </section>

        <el-segmented
          v-if="compactLayout"
          v-model="mobilePane"
          class="video-workspace__mobile-navigation"
          :options="[
            { label: '视频队列', value: 'queue' },
            { label: '内容审阅', value: 'review' }
          ]"
          aria-label="视频工作区视图"
        />

        <div class="video-workspace__content">
          <Transition name="studio-panel"
            ><div v-show="!compactLayout || mobilePane === 'queue'" class="video-workspace__queue">
              <VideoJobQueue
                v-model:tab="queueTab"
                v-model:selected-ids="selectedIds"
                :jobs="jobs"
                :selected-job-id="selectedJobId"
                :can-write="canWrite"
                :busy="reviewBusy"
                :publishing="publishing"
                :loading="loading"
                :active-job-ids="activeJobIds"
                :retrying-ids="retryingIds"
                @select="selectJob"
                @publish="publishSelected"
                @resume="chooseResume"
                @retry="retryJob"
              />
              <Transition name="studio-feedback"
                ><section
                  v-if="activePublications.length || Object.keys(missingPublicationErrors).length"
                  class="video-workspace__publications"
                  data-scroll-region
                  aria-label="发布进度"
                >
                  <div class="video-workspace__section-heading">
                    <h2>发布进度</h2>
                    <span>自动更新</span>
                  </div>
                  <article
                    v-for="publication in activePublications"
                    :key="publication.id"
                    class="video-workspace__publication"
                  >
                    <div class="video-workspace__section-heading">
                      <strong>{{ publication.jobs?.length || 0 }} 个视频</strong>
                      <el-tag :type="statusType(publication.status)" size="small">{{
                        PUBLICATION_STATUS[publication.status] || publication.status
                      }}</el-tag>
                    </div>
                    <ol class="video-workspace__stages" aria-label="发布阶段">
                      <li
                        v-for="(label, index) in publicationStages"
                        :key="label"
                        :class="{ 'is-complete': publicationStage(publication) >= index }"
                      >
                        {{ label }}
                      </li>
                    </ol>
                    <p v-if="publication.error" class="video-workspace__transfer-error">
                      {{ errorMessage(publication.error) }}
                    </p>
                    <el-button
                      v-if="publication.status === 'failed'"
                      size="small"
                      :disabled="!canWrite || retryingIds.includes(publication.id)"
                      :loading="retryingIds.includes(publication.id)"
                      @click="retryPublication(publication.id)"
                      >继续发布</el-button
                    >
                    <p
                      v-if="publicationErrors[publication.id]"
                      class="video-workspace__transfer-error"
                    >
                      进度刷新失败：{{ publicationErrors[publication.id] }}
                    </p>
                  </article>
                  <p
                    v-for="(message, id) in missingPublicationErrors"
                    :key="id"
                    class="video-workspace__transfer-error"
                  >
                    批次加载失败：{{ message }}
                  </p>
                </section></Transition
              >
              <Transition name="studio-feedback"
                ><div
                  v-if="completedPublication && queueTab === 'pending'"
                  class="video-workspace__published-notice"
                  role="status"
                >
                  <el-icon><CircleCheck /></el-icon>
                  <div>
                    <strong>{{ completedPublication.jobs?.length || 0 }} 个视频已发布</strong
                    ><span>已移入发布历史，待办已更新。</span>
                  </div>
                  <el-button link @click="showPublishedHistory">查看历史</el-button>
                  <el-button
                    circle
                    text
                    :icon="Close"
                    aria-label="关闭发布完成提示"
                    @click="completedPublication = null"
                  /></div
              ></Transition></div
          ></Transition>

          <Transition name="studio-panel"
            ><section
              v-show="!compactLayout || mobilePane === 'review'"
              ref="reviewScroller"
              class="video-workspace__review"
              data-scroll-region
              aria-label="视频审阅详情，可独立滚动"
              tabindex="0"
            >
              <el-button
                v-if="compactLayout"
                class="video-workspace__back"
                text
                :icon="ArrowLeft"
                aria-label="返回视频队列"
                @click="mobilePane = 'queue'"
                >返回队列</el-button
              >
              <Transition name="studio-panel" mode="out-in">
                <VideoReviewPanel
                  v-if="selectedJob && reviewDraft"
                  :key="selectedJob.id"
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
                  @back-to-pending="backToPending"
                />
                <div v-else key="empty" class="video-workspace__review-empty">
                  <el-icon :size="44"><VideoCamera /></el-icon>
                  <h2>{{ queueTab === 'published' ? '发布记录' : '开始审阅' }}</h2>
                  <p>
                    {{
                      queueTab === 'published'
                        ? '选择左侧视频查看已发布的内容。'
                        : '选择左侧素材，确认封面并完善发布信息。'
                    }}
                  </p>
                </div>
              </Transition>
            </section></Transition
          >
        </div>
      </template>
    </div>
  </MainLayout>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Upload,
  VideoCamera,
  CircleCheck,
  Refresh,
  Close,
  ArrowLeft
} from '@element-plus/icons-vue'
import MainLayout from '@/components/MainLayout.vue'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useCredentialsStore } from '@/stores/credentials'
import { useAiConfigurationGuard } from '@/composables/useAiConfigurationGuard'
import { analyzeImage, CLASSIFIER_CONFIG } from '@/services/ai/classifier'
import VideoReviewPanel from '@/features/video-ingest/VideoReviewPanel.vue'
import VideoJobQueue from '@/features/video-ingest/VideoJobQueue.vue'
import { createVideoUploadManager } from '@/features/video-ingest/upload-manager'
import { createVideoApi } from '@/features/video-ingest/api'
import { createVideoUploader } from '@/features/video-ingest/uploader'
import { createVideoWorkspace } from '@/features/video-ingest/workspace'
import { canReview, errorMessage, PUBLICATION_STATUS } from '@/features/video-ingest/domain'

const authStore = useAuthStore()
const configStore = useConfigStore()
const credentialsStore = useCredentialsStore()
const { requireAiConfiguration } = useAiConfigurationGuard()
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
  reviewBusy,
  publishing
} = workspace
const fileInput = ref(null)
const resumeInput = ref(null)
const resumeJobId = ref('')
const dragging = ref(false)
const queueTab = ref('pending')
const compactLayout = ref(window.innerWidth <= 980)
const mobilePane = ref('queue')
const reviewScroller = ref(null)
function syncCompactLayout() {
  compactLayout.value = window.innerWidth <= 980
}
function backToPending() {
  queueTab.value = 'pending'
  mobilePane.value = 'queue'
}
const retryingIds = ref([])
const canWrite = computed(() => authStore.canUpload)
const uploadManager = createVideoUploadManager({
  uploader,
  onJob: job => workspace.upsertJob(job),
  onSettled: () => refresh()
})
const { transfers, hasActiveTransfers } = uploadManager
const activeJobIds = computed(() =>
  transfers.value.filter(isTransferring).map(transfer => transfer.jobId)
)
const activePublications = computed(() =>
  publications.value.filter(publication => publication.status !== 'published')
)
const completedPublication = ref(null)
const observedPublicationStates = new Map()

watch(
  () => publications.value.map(publication => [publication.id, publication.status]),
  states => {
    for (const [id, status] of states) {
      const previousStatus = observedPublicationStates.get(id)
      if (previousStatus && previousStatus !== 'published' && status === 'published') {
        completedPublication.value = publications.value.find(publication => publication.id === id)
      }
      observedPublicationStates.set(id, status)
    }
  },
  { immediate: true }
)

function showPublishedHistory() {
  queueTab.value = 'published'
  mobilePane.value = 'queue'
  completedPublication.value = null
}

watch([queueTab, () => selectedJob.value?.status], () => {
  const candidates = jobs.value.filter(job =>
    queueTab.value === 'published' ? job.status === 'published' : job.status !== 'published'
  )
  if (!candidates.some(job => job.id === selectedJobId.value))
    workspace.selectJob(candidates[0]?.id || '')
})

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
  return uploadManager.hasActive(jobId)
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
function publicationStage(publication) {
  if (publication.status === 'published') return 3
  if (publication.status === 'deploying' || publication.deploymentId) return 2
  if (publication.status === 'publishing' || publication.metadataCommitSha) return 1
  return 0
}

async function refresh() {
  await Promise.allSettled([workspace.refresh(), workspace.loadTopics()])
}
async function selectJob(id) {
  workspace.selectJob(id)
  if (compactLayout.value) mobilePane.value = 'review'
  await nextTick()
  if (reviewScroller.value) {
    reviewScroller.value.scrollTop = 0
    reviewScroller.value.focus({ preventScroll: true })
  }
}
function pauseTransfer(id) {
  uploadManager.pause(id)
}

async function retryTransfer(id) {
  if (!canWrite.value || !requireAiConfiguration()) return
  try {
    await uploadManager.retry(id)
  } catch (failure) {
    if (failure.name !== 'AbortError') ElMessage.error(errorMessage(failure))
  }
}

function addFiles(files, resumeJob = null) {
  if (!canWrite.value || !requireAiConfiguration()) return Promise.resolve()
  queueTab.value = 'pending'
  return uploadManager.addFiles(files, { resumeJob }).then(results => {
    for (const result of results) {
      if (result.status === 'rejected' && result.reason?.name !== 'AbortError') {
        ElMessage.error(errorMessage(result.reason))
      }
    }
  })
}

function chooseFiles() {
  if (requireAiConfiguration()) fileInput.value?.click()
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
  if (hasActiveTransfer(id) || !requireAiConfiguration()) return
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
  if (!requireAiConfiguration()) return
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
  if (hasActiveTransfers.value || hasUnsavedDrafts.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onBeforeRouteLeave(async () => {
  if (!hasActiveTransfers.value && !hasUnsavedDrafts.value) return true
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
  window.addEventListener('resize', syncCompactLayout)
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
  uploadManager.dispose()
  window.removeEventListener('beforeunload', beforeUnload)
  window.removeEventListener('resize', syncCompactLayout)
})
</script>

<style scoped lang="scss">
.video-workspace {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 4px 4px 0;
  color: var(--studio-text, #f4f6fb);
  scrollbar-width: thin;
  &__heading {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin: 0 0 16px;
    padding: 0 4px;
  }
  h1 {
    margin: 0 0 6px;
    font-size: 28px;
    font-weight: 650;
    letter-spacing: -0.035em;
    line-height: 1.2;
  }
  &__heading p {
    margin: 0;
    color: var(--studio-muted, #b1b9c9);
    font-size: 13px;
  }
  &__refresh {
    width: 40px;
    height: 40px;
    flex: none;
    border: 1px solid rgba(255, 255, 255, 0.17);
    background: rgba(120, 137, 166, 0.15);
    box-shadow:
      inset 0 1px rgba(255, 255, 255, 0.14),
      0 2px 5px rgba(0, 0, 0, 0.14);
    backdrop-filter: blur(18px) saturate(1.4);
  }
  &__unconfigured {
    padding: 72px 24px;
    text-align: center;
    background: var(--studio-surface, rgba(28, 33, 44, 0.86));
    border-radius: 22px;
  }
  &__unconfigured h2 {
    font-size: 20px;
    margin: 18px 0 10px;
  }
  &__unconfigured p {
    color: var(--studio-muted, #b1b9c9);
    font-size: 13px;
  }
  &__unconfigured a {
    color: var(--studio-accent, #7db7ff);
    display: inline-block;
    margin-top: 12px;
  }
  :deep(.el-alert) {
    margin-bottom: 16px;
  }
  &__upload {
    flex: none;
    margin-bottom: 16px;
  }
  &__dropzone {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 13px 18px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 22px;
    background: rgba(97, 115, 144, 0.09);
    box-shadow: inset 0 1px rgba(255, 255, 255, 0.045);
    transition:
      background 180ms,
      border-color 180ms;
  }
  &__dropzone.is-dragging {
    background: rgba(83, 144, 230, 0.18);
    border-color: var(--studio-accent, #7db7ff);
  }
  &__upload-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 50px;
    height: 50px;
    flex: none;
    border-radius: 16px;
    color: #a7cfff;
    background: rgba(125, 183, 255, 0.12);
    box-shadow: inset 0 1px rgba(207, 230, 255, 0.12);
  }
  &__dropzone > div {
    flex: 1;
  }
  &__dropzone strong {
    font-weight: 600;
    font-size: 14px;
  }
  &__dropzone p {
    margin: 6px 0 0;
    color: var(--studio-muted, #b1b9c9);
    font-size: 12px;
    line-height: 1.5;
  }
  &__dropzone > .el-button {
    border-radius: 999px;
    padding-inline: 22px;
    min-height: 36px;
  }
  &__hint {
    font-size: 11px;
    line-height: 1.6;
    color: var(--studio-muted, #b1b9c9);
    margin: 10px 0 0;
    padding-left: 4px;
  }
  &__transfers {
    position: relative;
    max-height: min(150px, 20vh);
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 18px;
    margin-top: 10px;
    padding: 12px 16px;
    background: var(--studio-surface, rgba(28, 33, 44, 0.86));
    border-radius: 18px;
  }
  &__transfer-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    margin-bottom: 8px;
  }
  &__transfer-title strong {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }
  &__transfer-title > span {
    color: var(--studio-muted, #b1b9c9);
  }
  &__transfer-error {
    color: #ffb3b3;
    font-size: 12px;
    line-height: 1.5;
    margin: 8px 0;
    overflow-wrap: anywhere;
  }
  &__content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: grid;
    grid-template-columns: minmax(300px, 0.72fr) minmax(450px, 1.28fr);
    align-items: stretch;
    grid-template-rows: minmax(0, 1fr);
    gap: 26px;
  }
  &__queue {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  &__publications {
    flex: 0 1 auto;
    max-height: 28%;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    padding: 18px 12px;
    border-top: 1px solid var(--studio-border, rgba(255, 255, 255, 0.13));
  }
  &__section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  &__section-heading h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
  }
  &__section-heading > span {
    color: var(--studio-muted, #b1b9c9);
    font-size: 11px;
  }
  &__section-heading strong {
    font-size: 13px;
    font-weight: 500;
  }
  &__publication {
    margin-top: 18px;
  }
  &__stages {
    display: flex;
    gap: 8px;
    list-style: none;
    padding: 0;
    margin: 14px 0 0;
  }
  &__stages li {
    flex: 1;
    color: #929caf;
    border-top: 3px solid rgba(255, 255, 255, 0.11);
    padding-top: 8px;
    font-size: 11px;
  }
  &__stages li.is-complete {
    color: #c6defd;
    border-color: #7db7ff;
  }
  &__published-notice {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px;
    background: rgba(70, 113, 92, 0.17);
    border-radius: 18px;
  }
  &__published-notice > .el-icon {
    color: #a1dfbc;
    font-size: 22px;
  }
  &__published-notice > div {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
  }
  &__published-notice strong {
    font-size: 13px;
    font-weight: 500;
  }
  &__published-notice span {
    font-size: 11px;
    color: #b8cfc1;
  }
  &__published-notice :deep(.el-button + .el-button) {
    margin-left: 0;
  }
  &__review {
    min-width: 0;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-gutter: stable;
    padding: 22px;
    background: var(--studio-surface, rgba(28, 33, 44, 0.86));
    border-radius: 22px;
    box-shadow:
      inset 0 1px rgba(255, 255, 255, 0.055),
      0 7px 22px rgba(0, 0, 0, 0.09);
    scroll-margin-top: 16px;
  }
  &__review-empty {
    text-align: center;
    padding: 110px 16px;
    color: var(--studio-muted, #b1b9c9);
  }
  &__review-empty > .el-icon {
    color: #8d9aad;
  }
  &__review-empty h2 {
    font-size: 17px;
    font-weight: 500;
    color: var(--studio-text, #f4f6fb);
    margin: 20px 0 10px;
  }
  &__review-empty p {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
  }
  button:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--studio-accent, #7db7ff);
    outline-offset: 3px;
  }
  @media (max-width: 1100px) {
    &__content {
      grid-template-columns: minmax(280px, 0.78fr) minmax(360px, 1.22fr);
      gap: 18px;
    }
    &__review {
      padding: 18px;
    }
  }
  @media (max-width: 980px) {
    &__content {
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
    }
    &__queue,
    &__review {
      grid-area: 1 / 1;
    }
    &__review-empty {
      padding: 60px 16px;
    }
    &__transfers {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 520px) {
    padding: 0;
    h1 {
      font-size: 25px;
    }
    &__heading {
      gap: 12px;
      margin-bottom: 12px;
    }
    &__heading p {
      font-size: 12px;
    }
    &__dropzone {
      flex-wrap: nowrap;
      padding: 12px;
      gap: 10px;
      border-radius: 20px;
    }
    &__upload-icon {
      width: 42px;
      height: 42px;
      border-radius: 13px;
    }
    &__dropzone > div {
      min-width: 0;
    }
    &__dropzone > .el-button {
      width: auto;
      margin-left: 0;
      padding-inline: 14px;
    }
    &__dropzone p {
      display: none;
    }
    &__hint {
      display: none;
    }
    &__review {
      padding: 16px;
      border-radius: 20px;
    }
    &__published-notice {
      flex-wrap: wrap;
    }
  }
  &__mobile-navigation {
    flex: none;
    margin-bottom: 12px;
    border-radius: 999px;
  }
  &__mobile-navigation :deep(.el-segmented__group) {
    display: flex;
    width: 100%;
  }
  &__mobile-navigation :deep(.el-segmented__item) {
    flex: 1;
  }
  &__back {
    margin: -4px 0 12px;
  }
  &__review:focus-visible {
    outline: 2px solid var(--studio-accent, #7db7ff);
    outline-offset: -2px;
  }
  @media (max-height: 650px) {
    &__heading p,
    &__upload > .video-workspace__hint {
      display: none;
    }
    &__heading {
      margin-bottom: 10px;
    }
    &__upload {
      margin-bottom: 10px;
    }
    &__dropzone {
      padding-block: 9px;
    }
    &__transfers {
      max-height: 90px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      transition: none !important;
      animation: none !important;
      scroll-behavior: auto !important;
    }
  }
}
</style>
