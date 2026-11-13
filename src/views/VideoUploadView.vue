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
        <p>在仓库与服务设置中填写视频服务地址，即可启用视频上传、处理和发布。</p>
        <router-link to="/settings">配置视频服务</router-link>
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
          <div class="video-workspace__auto-analysis">
            <el-switch v-model="autoAnalysisEnabled" aria-label="云端就绪后自动分析封面" />
            <span>就绪后自动分析封面</span>
            <span class="video-workspace__auto-status" role="status">{{ autoAnalysisStatus }}</span>
          </div>
          <el-collapse-transition
            ><TransitionGroup
              v-if="transfers.length"
              name="studio-list"
              tag="div"
              class="video-workspace__transfers"
              data-scroll-region
              aria-live="polite"
              @before-leave="lockLeavingTransfer"
              @after-leave="releaseLeavingTransfer"
              @leave-cancelled="releaseLeavingTransfer"
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
                :analyzing-job-id="autoActiveJobId"
                :analysis-errors="autoErrors"
                @select="selectJob"
                @publish="publishSelected"
                @resume="chooseResume"
                @retry="retryJob"
              />
            </div>
          </Transition>

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
              <Transition name="studio-panel" mode="out-in" @before-enter="prepareReviewEnter">
                <VideoReviewPanel
                  v-if="selectedJob && reviewDraft"
                  :key="selectedJob.id"
                  v-model:draft="reviewDraft"
                  :job="selectedJob"
                  :revision="draftRevision"
                  :dirty="isDirty"
                  :editable="canWrite && canReview(selectedJob)"
                  :busy="reviewBusy"
                  :publishing="publishing"
                  :conflict="conflict"
                  :has-credentials="credentialsStore.hasCredentials"
                  :has-model-ready="credentialsStore.hasModelReady"
                  :model="credentialsStore.selectedModel"
                  :auto-analyzing="autoActiveJobId === selectedJob.id"
                  :analysis-error="autoErrors[selectedJob.id] || ''"
                  :topic-suggestions="topics"
                  :topics-error="topicsError"
                  @save="saveReview()"
                  @publish="publishCurrent"
                  @publish-blocked="showReviewFeedback('warning', $event)"
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
    <VideoPublicationNotice
      v-if="configured"
      :publications="publications"
      :errors="publicationErrors"
      :submitting="publishing"
      :can-write="canWrite"
      :retrying-ids="retryingIds"
      @retry="retryPublication"
      @refresh="refresh"
      @history="showPublishedHistory"
    />
  </MainLayout>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload, VideoCamera, Refresh, ArrowLeft } from '@element-plus/icons-vue'
import MainLayout from '@/components/MainLayout.vue'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useCredentialsStore } from '@/stores/credentials'
import { useAiConfigurationGuard } from '@/composables/useAiConfigurationGuard'
import { analyzeImage } from '@/services/ai/classifier'
import VideoReviewPanel from '@/features/video-ingest/VideoReviewPanel.vue'
import VideoPublicationNotice from '@/features/video-ingest/VideoPublicationNotice.vue'
import VideoJobQueue from '@/features/video-ingest/VideoJobQueue.vue'
import { createVideoUploadManager } from '@/features/video-ingest/upload-manager'
import { createVideoApi } from '@/features/video-ingest/api'
import { createVideoUploader } from '@/features/video-ingest/uploader'
import { createVideoWorkspace } from '@/features/video-ingest/workspace'
import { createVideoAutoAnalysis } from '@/features/video-ingest/auto-analysis'
import { canReview, errorMessage } from '@/features/video-ingest/domain'

const authStore = useAuthStore()
const configStore = useConfigStore()
const credentialsStore = useCredentialsStore()
const { requireAiConfiguration } = useAiConfigurationGuard()
const api = createVideoApi({
  baseUrl: configStore.config.videoApiUrl,
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
let pendingReviewJobId = null
watch(
  () => selectedJob.value?.id || '',
  id => {
    pendingReviewJobId = id
  },
  { flush: 'sync' }
)
function prepareReviewEnter() {
  if (pendingReviewJobId !== (selectedJob.value?.id || '')) return
  pendingReviewJobId = null
  if (!reviewScroller.value) return
  reviewScroller.value.scrollTop = 0
  if (!compactLayout.value || mobilePane.value === 'review') {
    reviewScroller.value.focus({ preventScroll: true })
  }
}
const leavingTransferStyles = new WeakMap()
function lockLeavingTransfer(element) {
  const properties = ['position', 'left', 'top', 'right', 'width', 'height']
  leavingTransferStyles.set(
    element,
    Object.fromEntries(properties.map(property => [property, element.style[property]]))
  )
  const { offsetLeft, offsetTop, offsetWidth, offsetHeight } = element
  Object.assign(element.style, {
    position: 'absolute',
    left: `${offsetLeft}px`,
    top: `${offsetTop}px`,
    right: 'auto',
    width: `${offsetWidth}px`,
    height: `${offsetHeight}px`
  })
}
function releaseLeavingTransfer(element) {
  const previous = leavingTransferStyles.get(element)
  if (!previous) return
  Object.assign(element.style, previous)
  leavingTransferStyles.delete(element)
}
function syncCompactLayout() {
  compactLayout.value = window.innerWidth <= 980
}
function backToPending() {
  queueTab.value = 'pending'
  mobilePane.value = 'queue'
}
const retryingIds = ref([])
const canWrite = computed(() => authStore.canUpload)
const autoAnalysisEnabled = ref(true)
const autoAnalysisReady = ref(false)
const autoAnalysis = createVideoAutoAnalysis({
  workspace,
  getCredentials: () => credentialsStore.getCredentialsByProvider('sub2api'),
  canRun: () =>
    autoAnalysisReady.value &&
    autoAnalysisEnabled.value &&
    canWrite.value &&
    credentialsStore.hasModelReady &&
    !publishing.value,
  contextKey: JSON.stringify([authStore.user?.login, configStore.config.videoApiUrl])
})
const {
  activeJobId: autoActiveJobId,
  errors: autoErrors,
  paused: autoPaused,
  pauseReason: autoPauseReason
} = autoAnalysis
const autoAnalysisStatus = computed(() => {
  if (!autoAnalysisEnabled.value) return '已关闭，可手动分析'
  if (!credentialsStore.hasModelReady) return '配置 API Key 和模型后继续'
  if (autoActiveJobId.value) return '正在分析封面，请稍候'
  if (autoPaused.value) return autoPauseReason.value || '分析已暂停，请检查模型配置后手动重试'
  if (Object.keys(autoErrors.value).length) return '部分任务需要手动重试'
  return '本页打开时自动分析，已编辑的任务会跳过'
})
watch(
  () => credentialsStore.sessionRevision,
  () => {
    autoAnalysis.reset()
    autoAnalysis.run()
  }
)
watch(
  [
    jobs,
    reviewBusy,
    publishing,
    canWrite,
    autoAnalysisEnabled,
    autoAnalysisReady,
    () => credentialsStore.hasModelReady
  ],
  () => {
    if (!autoAnalysisEnabled.value || !canWrite.value || !credentialsStore.hasModelReady)
      autoAnalysis.cancel()
    else autoAnalysis.run()
  },
  { deep: false }
)
const uploadManager = createVideoUploadManager({
  uploader,
  onJob: job => workspace.upsertJob(job),
  onSettled: () => refresh()
})
const { transfers, hasActiveTransfers } = uploadManager
const activeJobIds = computed(() =>
  transfers.value.filter(isTransferring).map(transfer => transfer.jobId)
)
function showPublishedHistory() {
  queueTab.value = 'published'
  mobilePane.value = 'queue'
}

watch([queueTab, () => selectedJob.value?.status], () => {
  const candidates = jobs.value.filter(job =>
    queueTab.value === 'published' ? job.status === 'published' : job.status !== 'published'
  )
  if (!candidates.some(job => job.id === selectedJobId.value))
    workspace.selectJob(candidates[0]?.id || '')
})

const transferLabels = {
  waiting: '等待上传',
  hashing: '校验文件',
  uploading: '上传分块',
  completing: '确认上传',
  done: '已提交云端',
  paused: '已暂停',
  error: '上传失败'
}

function isTransferring(transfer) {
  return ['waiting', 'hashing', 'uploading', 'completing'].includes(transfer.stage)
}
function hasActiveTransfer(jobId) {
  return uploadManager.hasActive(jobId)
}
async function refresh() {
  await Promise.allSettled([workspace.refresh(), workspace.loadTopics()])
}
async function selectJob(id) {
  const sameJob = id === selectedJob.value?.id
  workspace.selectJob(id)
  if (compactLayout.value) mobilePane.value = 'review'
  await nextTick()
  if (sameJob) reviewScroller.value?.focus({ preventScroll: true })
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

let reviewFeedback
function showReviewFeedback(type, message) {
  reviewFeedback?.close()
  reviewFeedback = ElMessage({ type, message })
}
async function saveReview(useLatest = false) {
  try {
    await workspace.saveReview({ useLatest })
    showReviewFeedback('success', '审核已保存')
  } catch (failure) {
    showReviewFeedback('error', errorMessage(failure))
  }
}
async function analyzeReview() {
  if (!requireAiConfiguration()) return
  if (reviewBusy.value) return
  const id = selectedJob.value?.id
  if (!id) return
  autoAnalysis.block(id)
  try {
    await workspace.analyzeReview({
      analyzeImage,
      providerType: 'sub2api',
      credentials: credentialsStore.getCredentialsByProvider('sub2api')
    })
    showReviewFeedback('success', '封面分析完成，建议已保存，可继续人工审核')
  } catch (failure) {
    autoAnalysis.block(id, failure)
    showReviewFeedback('error', errorMessage(failure))
  }
}
async function publish(action) {
  if (!canWrite.value || publishing.value) return
  reviewFeedback?.close()
  try {
    await action()
  } catch (failure) {
    showReviewFeedback('error', errorMessage(failure))
    await refresh()
  }
}
function publishSelected() {
  return publish(() => workspace.publishSelected())
}
function publishCurrent() {
  const id = selectedJob.value?.id
  if (id) return publish(() => workspace.publishJob(id))
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
  autoAnalysisReady.value = true
  autoAnalysis.run()
  workspace.startPolling()
})
onBeforeUnmount(() => {
  reviewFeedback?.close()
  autoAnalysis.dispose()
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
  &__auto-analysis {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 10px;
    margin-top: 8px;
    padding-left: 4px;
    font-size: 12px;
    color: var(--studio-text);
  }
  &__auto-status {
    color: var(--studio-muted);
    font-size: 11px;
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
  }
  &__review {
    --review-padding: 22px;
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
      --review-padding: 18px;
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
      --review-padding: 16px;
      padding: 16px;
      border-radius: 20px;
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
