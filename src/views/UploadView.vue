<template>
  <MainLayout>
    <div v-if="pageLoading" class="upload-view__loading">
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p class="loading-text">加载中...</p>
      </div>
    </div>

    <div v-else ref="viewRef" class="upload-view">
      <el-alert
        v-if="authStore.permissionChecked && !authStore.canUpload"
        type="warning"
        :closable="false"
        class="upload-view__readonly-alert"
      >
        <template #title>
          <span>只读模式 · 当前账号没有上传权限，仅可浏览分类</span>
        </template>
      </el-alert>

      <div class="upload-view__header">
        <div class="upload-view__title-area">
          <div class="upload-view__title-main">
            <h1 class="upload-view__title">图片上传</h1>
          </div>
          <p class="upload-view__subtitle">选择图片，整理分类并提交发布。</p>
        </div>

        <div class="upload-view__meta">
          <span class="upload-view__meta-chip">AI 智能分类</span>
          <span class="upload-view__meta-chip">{{ currentSeriesLabel }}</span>
          <span
            class="upload-view__meta-chip upload-view__meta-chip--highlight"
            :title="currentContextLabel"
          >
            {{ currentContextLabel }}
          </span>
        </div>
      </div>

      <div class="upload-view__content" data-scroll-region>
        <CategorySidebar
          :key="treeKey"
          :series="series"
          :tree-data="treeData"
          :loading="loading"
          :syncing="syncingCategories"
          :target-path="uploadStore.targetPath"
          :load-node="loadNode"
          class="upload-view__categories"
          @select-series="selectSeries"
          @select-category="handleCategorySelect"
          @create="showModal = true"
          @delete="handleDeleteCategory"
          @refresh="handleRefreshCategories"
        />

        <div class="upload-view__center">
          <UploadPanel
            :files="uploadStore.files"
            :selected-id="previewFile?.id"
            :uploading="uploading"
            :progress="uploadStore.totalProgress"
            :error-count="uploadStore.errorFiles.length"
            :current-series="series"
            :ai-analyzing="uploadStore.aiAnalyzing"
            :ai-analyzing-count="uploadStore.aiAnalyzingCount"
            :metadata-status="uploadStore.metadataStatus"
            :can-upload="authStore.canUpload"
            @add-files="addFiles"
            @remove="uploadStore.removeFile"
            @remove-batch="uploadStore.removeFiles"
            @clear="uploadStore.clearFiles"
            @retry="handleRetry"
            @upload="handleUpload"
            @select="selectPreview"
            @change-target="handleChangeTarget"
            @series-change="handleSeriesChange"
            @retry-metadata="handleRetryMetadata"
            @apply-all-ai="handleApplyAllAi"
            @edit-ai="handleEditAI"
          />
        </div>

        <aside ref="sidebarRef" class="upload-view__sidebar" data-scroll-region>
          <section ref="overviewRef" class="upload-view__overview">
            <div class="upload-view__overview-header">
              <div>
                <h2 class="upload-view__overview-title">分类与配额</h2>
              </div>
              <div class="upload-view__overview-actions">
                <button class="upload-view__overview-btn" @click="refreshStats">刷新</button>
                <button class="upload-view__overview-btn" @click="showHistoryModal = true">
                  历史
                </button>
              </div>
            </div>

            <div class="upload-view__overview-grid">
              <div class="upload-view__overview-item">
                <div>
                  <span class="upload-view__overview-item-label">电脑</span>
                  <strong class="upload-view__overview-item-value">{{ stats.desktop }}</strong>
                </div>
              </div>
              <div class="upload-view__overview-item">
                <div>
                  <span class="upload-view__overview-item-label">手机</span>
                  <strong class="upload-view__overview-item-value">{{ stats.mobile }}</strong>
                </div>
              </div>
              <div class="upload-view__overview-item">
                <div>
                  <span class="upload-view__overview-item-label">头像</span>
                  <strong class="upload-view__overview-item-value">{{ stats.avatar }}</strong>
                </div>
              </div>
              <div class="upload-view__overview-item upload-view__overview-item--api">
                <div>
                  <span class="upload-view__overview-item-label">API 剩余</span>
                  <strong class="upload-view__overview-item-value">
                    {{ rateLimit.remaining }}/{{ rateLimit.limit }}
                  </strong>
                </div>
              </div>
            </div>

            <div class="upload-view__quota">
              <div class="upload-view__quota-bar">
                <div class="upload-view__quota-fill" :style="{ width: quotaPercent + '%' }"></div>
              </div>
              <span class="upload-view__quota-text">当前可用额度 {{ quotaPercent }}%</span>
            </div>
          </section>

          <div
            ref="previewPanelRef"
            class="upload-view__accordion-panel upload-view__preview-panel"
          >
            <ImagePreview
              :file="previewFile"
              :collapsed="activeSidebarPanel !== 'preview'"
              class="upload-view__preview"
              @toggle="openSidebarPanel('preview')"
            />
          </div>
          <div
            ref="workflowPanelRef"
            class="upload-view__accordion-panel upload-view__workflow-panel"
          >
            <WorkflowPanel
              :collapsed="activeSidebarPanel !== 'workflow'"
              class="upload-view__workflow"
              @toggle="openSidebarPanel('workflow')"
            />
          </div>
        </aside>
      </div>

      <CreateCategoryModal
        :visible="showModal"
        :parent-category="selectedL1"
        :creating="creating"
        @close="showModal = false"
        @create="createCategory"
      />

      <UploadProgressModal
        v-model="showProgressModal"
        :files="uploadStore.files"
        :uploading="uploading"
        :current-index="uploadStore.currentFileIndex"
        :metadata-status="uploadStore.metadataStatus"
        :metadata-error="uploadStore.metadataError"
        @retry="handleRetry"
        @retry-metadata="handleRetryMetadata"
        @close="showProgressModal = false"
      />

      <ReleaseHistoryModal
        :visible="showHistoryModal"
        :stats-data="workflowStore.statsData"
        @close="showHistoryModal = false"
      />

      <TargetSelectModal
        :visible="showTargetModal"
        :file="targetEditFile"
        :current-series="series"
        @close="showTargetModal = false"
        @confirm="handleTargetConfirm"
      />

      <DeleteCategoryModal
        :visible="showDeleteModal"
        :category-name="deleteTarget.data?.name || ''"
        :has-sub-dirs="deleteTarget.hasSubDirs"
        :has-images="deleteTarget.hasImages"
        :deleting="deleting"
        @close="showDeleteModal = false"
        @confirm="confirmDeleteCategory"
      />

      <EditAIResultModal
        :visible="showEditAIModal"
        :file="editAIFile"
        :saving="savingAI"
        @close="closeEditAIModal"
        @save="handleSaveAIResult"
      />
    </div>
  </MainLayout>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { gsap } from 'gsap'
import MainLayout from '@/components/MainLayout.vue'
import CategorySidebar from '@/components/upload/CategorySidebar.vue'
import UploadPanel from '@/components/upload/UploadPanel.vue'
import ImagePreview from '@/components/upload/ImagePreview.vue'
import WorkflowPanel from '@/components/upload/WorkflowPanel.vue'
import ReleaseHistoryModal from '@/components/upload/ReleaseHistoryModal.vue'
import CreateCategoryModal from '@/components/upload/CreateCategoryModal.vue'
import DeleteCategoryModal from '@/components/upload/DeleteCategoryModal.vue'
import UploadProgressModal from '@/components/upload/UploadProgressModal.vue'
import TargetSelectModal from '@/components/upload/TargetSelectModal.vue'
import EditAIResultModal from '@/components/upload/EditAIResultModal.vue'
import { githubService } from '@/services/github'
import { localStorageService } from '@/services/localStorage'
import {
  clearUploadCategoryTreeCache,
  getUploadCategoryNodes
} from '@/services/upload/category-directory'
import { useConfigStore } from '@/stores/config'
import { useUploadStore } from '@/stores/upload'
import { useAuthStore } from '@/stores/auth'
import { useWorkflowStore } from '@/stores/workflow'
import { debounce } from '@/utils/debounce'
import { useAiConfigurationGuard } from '@/composables/useAiConfigurationGuard'
import { detectBatchImageTypes, getDetectionStats } from '@/utils/image-detector'

const { requireAiConfiguration } = useAiConfigurationGuard()
const configStore = useConfigStore()
const uploadStore = useUploadStore()
const authStore = useAuthStore()
const workflowStore = useWorkflowStore()

const viewRef = ref(null)
const sidebarRef = ref(null)
const overviewRef = ref(null)
const previewPanelRef = ref(null)
const workflowPanelRef = ref(null)
const forceCategoryFetch = ref(false)
const pageLoading = ref(false)
const series = ref('desktop')
const treeData = ref([])
const treeKey = ref(0)
const loading = ref(false)
const syncingCategories = ref(false)
const loadingStats = ref(false)
const selectedL1 = ref('')
const previewFile = ref(null)
const activeSidebarPanel = ref('workflow')
const showModal = ref(false)
const showProgressModal = ref(false)
const showHistoryModal = ref(false)
const showTargetModal = ref(false)
const showDeleteModal = ref(false)
const showEditAIModal = ref(false)
const targetEditFile = ref(null)
const editAIFile = ref(null)
const creating = ref(false)
const deleting = ref(false)
const savingAI = ref(false)
const deleteTarget = reactive({ data: null, hasSubDirs: false, hasImages: false })

const stats = reactive({ desktop: 0, mobile: 0, avatar: 0, total: 0 })

const uploading = computed(() => uploadStore.uploading)
const rateLimit = computed(() => uploadStore.getRateLimit())
const quotaPercent = computed(() =>
  Math.round((rateLimit.value.remaining / rateLimit.value.limit) * 100)
)

const aiConfig = computed(() => uploadStore.getCurrentAiConfig())
const currentSeriesLabel = computed(() => {
  const labels = {
    desktop: '电脑壁纸',
    mobile: '手机壁纸',
    avatar: '头像壁纸'
  }

  return labels[series.value] || '未选择'
})
const currentContextLabel = computed(() => `模型 · ${aiConfig.value?.modelName || 'GPT-6.1 Sol'}`)

const SIDEBAR_COLLAPSED_HEIGHT = 52

function getSidebarGap() {
  const sidebarEl = sidebarRef.value
  if (!sidebarEl) return 16
  const styles = window.getComputedStyle(sidebarEl)
  return Number.parseFloat(styles.gap || styles.rowGap || '16') || 16
}

function getExpandedSidebarHeight() {
  const sidebarEl = sidebarRef.value
  const overviewEl = overviewRef.value

  if (!sidebarEl || !overviewEl) return 320

  const gap = getSidebarGap()
  const available =
    sidebarEl.clientHeight - overviewEl.offsetHeight - gap * 2 - SIDEBAR_COLLAPSED_HEIGHT

  return Math.max(available, 320)
}

async function syncSidebarAccordion(animated = true) {
  await nextTick()

  const previewEl = previewPanelRef.value
  const workflowEl = workflowPanelRef.value
  if (!previewEl || !workflowEl) return

  const expandedHeight = getExpandedSidebarHeight()
  const duration =
    animated && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0.24 : 0
  const ease = 'expo.inOut'

  gsap.killTweensOf([previewEl, workflowEl])

  if (activeSidebarPanel.value === 'preview') {
    gsap.to(previewEl, { height: expandedHeight, duration, ease })
    gsap.to(workflowEl, { height: SIDEBAR_COLLAPSED_HEIGHT, duration, ease })
  } else {
    gsap.to(previewEl, { height: SIDEBAR_COLLAPSED_HEIGHT, duration, ease })
    gsap.to(workflowEl, { height: expandedHeight, duration, ease })
  }
}

function handleSidebarResize() {
  syncSidebarAccordion(false)
}

function clearCategoryCaches() {
  clearUploadCategoryTreeCache()
  githubService.clearDirectoryCache()
}

async function waitForDirectorySync(path, { shouldExist, attempts = 8, delay = 700 } = {}) {
  const { owner, repo, branch } = configStore.config

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await githubService.getContents(owner, repo, path, branch, { forceRefresh: true })

      if (shouldExist) {
        return true
      }
    } catch (error) {
      if (!shouldExist && (error.status === 404 || error.type === 'NOT_FOUND')) {
        return true
      }
    }

    if (attempt < attempts - 1) {
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  return false
}

function selectSeries(value) {
  series.value = value
  uploadStore.setTarget(value, '', '')
  selectedL1.value = ''
  loadRootCategories()
}

async function handleRefreshCategories() {
  clearCategoryCaches()
  forceCategoryFetch.value = true
  syncingCategories.value = true
  treeKey.value++
  try {
    await loadRootCategories(true)
  } finally {
    syncingCategories.value = false
  }
}

async function loadRootCategories(forceRefresh = false) {
  const requestedSeries = series.value
  loading.value = true
  try {
    const categories = await getUploadCategoryNodes(requestedSeries, '', { force: forceRefresh })
    if (series.value === requestedSeries) treeData.value = categories
  } catch (err) {
    console.error('[loadRootCategories] Error:', err)
    if (series.value === requestedSeries) treeData.value = []
  } finally {
    loading.value = false
    if (forceRefresh) forceCategoryFetch.value = false
  }
}

async function loadNode(node, resolve) {
  if (node.level === 0) {
    resolve(treeData.value)
    return
  }
  if (node.data.type !== 'l1') {
    resolve([])
    return
  }
  try {
    const children = await getUploadCategoryNodes(series.value, node.data.name, {
      force: forceCategoryFetch.value
    })
    resolve(children)
  } catch {
    resolve([])
  }
}

function handleCategorySelect({ data, node }) {
  if (data.type === 'l1') {
    selectedL1.value = data.name
    uploadStore.setTarget(series.value, data.name, '')
  } else {
    selectedL1.value = node.parent.data.name
    uploadStore.setTarget(series.value, node.parent.data.name, data.name)
  }
}

async function addFiles(files) {
  if (!authStore.canUpload) {
    ElMessage.error('🔒 您没有上传权限，无法添加文件')
    return
  }

  if (!requireAiConfiguration()) return
  const imgs = files.filter(f => f.type.startsWith('image/'))
  if (!imgs.length) {
    ElMessage.warning('请选择图片文件')
    return
  }

  if (uploadStore.shouldWarnBatchUpload(imgs.length)) {
    const estimatedTime = uploadStore.estimateUploadTime(imgs.length)
    const minutes = Math.floor(estimatedTime / 60)
    const seconds = estimatedTime % 60
    const timeStr = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`

    ElMessage({
      message: `⚠️ 批量上传 ${imgs.length} 张图片，预计需要 ${timeStr}，建议分批上传`,
      type: 'warning',
      duration: 6000,
      showClose: true
    })
  }

  if (imgs.length > 0) {
    try {
      const detectionResults = await detectBatchImageTypes(imgs)
      const stats = getDetectionStats(detectionResults)

      const dominantType = ['desktop', 'mobile', 'avatar'].reduce((a, b) =>
        stats[a] > stats[b] ? a : b
      )

      if (stats[dominantType] >= imgs.length * 0.7 && dominantType !== series.value) {
        series.value = dominantType
        uploadStore.setSeries(dominantType)

        ElMessage({
          message: `🔍 检测到 ${stats[dominantType]}/${imgs.length} 张${dominantType === 'desktop' ? '桌面' : dominantType === 'mobile' ? '手机' : '头像'}壁纸，已自动切换类型`,
          type: 'success',
          duration: 4000
        })
      } else if (stats.desktop + stats.mobile + stats.avatar < imgs.length) {
        ElMessage({
          message: `⚠️ 部分图片类型检测失败，请确认当前选择的类型（${series.value}）是否正确`,
          type: 'warning',
          duration: 5000
        })
      }
    } catch (error) {
      console.warn('批量检测图片类型失败:', error)
    }
  }

  const added = await uploadStore.addFiles(imgs)
  if (added.length < imgs.length)
    ElMessage.warning(`${imgs.length - added.length} 个文件不符合要求`)
}

function handleUploadResults(results, messagePrefix = '上传') {
  const ok = results.results.filter(r => r.success).length
  const fail = results.results.length - ok
  const reused = results.results.filter(r => r.reusedExisting).length

  if (ok > 0) {
    workflowStore.addSessionUpload(ok)
  }

  if (ok > 0 && localStorageService.isInitialized()) {
    const successFiles = results.results
      .filter(r => r.success)
      .map(r => {
        const file = uploadStore.files.find(f => f.id === r.id)
        return {
          fileName: file?.name || r.id,
          series: file?.series || series.value,
          category: file?.targetPath || '',
          size: file?.size || 0
        }
      })
    localStorageService.addUploadRecords(successFiles)
  }

  if (messagePrefix === '上传') {
    ElMessage[fail ? 'warning' : 'success'](
      fail
        ? `上传完成：${ok} 成功，${fail} 失败${reused > 0 ? `（其中 ${reused} 个复用已上传图片）` : ''}`
        : `成功处理 ${ok} 个文件${reused > 0 ? `（其中 ${reused} 个复用已上传图片）` : ''}`
    )
    if (results.metadataResult?.success === false) {
      ElMessage.warning(`图片已上传，但元数据生成失败：${results.metadataResult.error}`)
    }

    if (ok > 0 && results.metadataResult?.success !== false) {
      uploadStore.clearSuccessFiles()
    }
  } else {
    ElMessage[fail ? 'warning' : 'success'](
      fail ? `重试完成：${ok} 成功，${fail} 失败` : `重试成功，${ok} 个文件已上传`
    )

    if (ok > 0) {
      uploadStore.clearSuccessFiles()
    }
  }

  refreshStats()

  if (ok > 0) {
    setTimeout(async () => {
      const { owner, repo, branch } = configStore.config
      await workflowStore.refreshPendingInfo(owner, repo, branch)
      if (workflowStore.pendingInfo.pendingCount === 0) {
        setTimeout(() => {
          workflowStore.refreshPendingInfo(owner, repo, branch)
        }, 2000)
      }
    }, 2000)
  }
}

async function handleUpload() {
  if (uploading.value || !authStore.canUpload || !requireAiConfiguration()) return
  if (!uploadStore.pendingFiles.length) {
    ElMessage.info('请先添加图片')
    return
  }
  if (uploadStore.pendingFiles.some(file => !file.aiMetadata || file.aiMetadata.error)) {
    ElMessage.warning('请先完成图片 AI 分析')
    return
  }

  const filesWithoutTarget = uploadStore.pendingFiles.filter(f => !f.targetPath)
  if (filesWithoutTarget.length > 0) {
    ElMessage.warning(`有 ${filesWithoutTarget.length} 个文件未设置上传目录`)
    return
  }

  showProgressModal.value = true

  try {
    const results = await uploadStore.uploadAll()
    handleUploadResults(results, '上传')
  } catch (e) {
    ElMessage.error(e.message || '上传失败')
  }
}

async function handleRetryMetadata() {
  if (uploading.value || !authStore.canUpload || !requireAiConfiguration()) return
  try {
    const result = await uploadStore.retryPendingMetadata()
    if (!result) return

    if (result.success) {
      ElMessage.success('元数据已重新生成并提交')
      uploadStore.clearSuccessFiles()

      const { owner, repo, branch } = configStore.config
      await workflowStore.refreshPendingInfo(owner, repo, branch)
    } else {
      ElMessage.error(result.error || '元数据重试失败')
    }
  } catch (error) {
    ElMessage.error(error.message || '元数据重试失败')
  }
}

function selectPreview(file) {
  previewFile.value = file
  activeSidebarPanel.value = 'preview'
}

function openSidebarPanel(panel) {
  activeSidebarPanel.value = panel
}

watch(activeSidebarPanel, () => {
  syncSidebarAccordion(true)
})

function handleChangeTarget(file) {
  targetEditFile.value = file
  showTargetModal.value = true
}

function handleTargetConfirm({ series: newSeries, l1, l2 }) {
  if (targetEditFile.value) {
    uploadStore.updateFileTarget(targetEditFile.value.id, newSeries, l1, l2)
  }
  showTargetModal.value = false
  targetEditFile.value = null
}

function handleSeriesChange(newSeries) {
  selectSeries(newSeries)
}

function handleApplyAllAi() {
  const count = uploadStore.applyAllAiRecommendations()
  if (count > 0) {
    ElMessage.success(`已应用 ${count} 个 AI 推荐分类`)
  } else {
    ElMessage.info('没有待应用的 AI 推荐')
  }
}

function handleEditAI(file) {
  editAIFile.value = file
  showEditAIModal.value = true
}

function closeEditAIModal() {
  showEditAIModal.value = false
  editAIFile.value = null
}

async function handleSaveAIResult({ fileId, aiMetadata }) {
  savingAI.value = true
  try {
    uploadStore.setFileAiMetadata(fileId, aiMetadata, true)

    ElMessage.success('AI 分析结果已更新')
    closeEditAIModal()
  } catch (error) {
    ElMessage.error('保存失败：' + error.message)
  } finally {
    savingAI.value = false
  }
}

async function handleRetry() {
  if (uploading.value || !authStore.canUpload || !requireAiConfiguration()) return
  try {
    const results = await uploadStore.retryFailed()
    if (!results) return
    handleUploadResults(results, '重试')
  } catch (e) {
    ElMessage.error(e.message || '重试失败')
  }
}

async function createCategory(form) {
  if (!form.name?.trim()) {
    ElMessage.error('分类名称不能为空')
    return
  }
  if (/[/\\:*?"<>|]/.test(form.name)) {
    ElMessage.error('分类名称包含非法字符')
    return
  }

  creating.value = true
  try {
    const { owner, repo, branch } = configStore.config
    let categoryPath = `wallpaper/${series.value}`

    if (form.level === 'l2' && selectedL1.value) {
      categoryPath += `/${selectedL1.value}`
    }
    categoryPath += `/${form.name}`
    const gitkeepPath = `${categoryPath}/.gitkeep`

    await githubService.createFile(
      owner,
      repo,
      gitkeepPath,
      '',
      `Create category: ${form.name}`,
      branch
    )

    clearCategoryCaches()
    forceCategoryFetch.value = true
    syncingCategories.value = true
    loading.value = true

    const synced = await waitForDirectorySync(categoryPath, { shouldExist: true })

    await loadRootCategories(true)
    treeKey.value++

    ElMessage.success(synced ? '分类创建成功' : '分类已创建，目录正在同步')
    showModal.value = false
  } catch (e) {
    ElMessage.error(e.message || '创建失败')
  } finally {
    syncingCategories.value = false
    creating.value = false
  }
}

async function handleDeleteCategory({ data }) {
  const { owner, repo, branch } = configStore.config

  try {
    let contents = []
    let hasImages = false
    let hasSubDirs = false

    try {
      contents = await githubService.getContents(owner, repo, data.path, branch)
      if (!Array.isArray(contents)) {
        contents = [contents]
      }
      hasImages = contents.some(
        item => item.type === 'file' && /\.(jpg|jpeg|png|gif|webp)$/i.test(item.name)
      )
      hasSubDirs = contents.some(item => item.type === 'dir')
    } catch (err) {
      if (err.status === 404 || err.type === 'NOT_FOUND') {
        contents = []
      } else {
        throw err
      }
    }

    deleteTarget.data = data
    deleteTarget.hasSubDirs = hasSubDirs
    deleteTarget.hasImages = hasImages
    showDeleteModal.value = true
  } catch (e) {
    console.error('Check category error:', e)
    ElMessage.error(e.message || '检查分类失败')
  }
}

async function confirmDeleteCategory() {
  if (!deleteTarget.data) return

  const { owner, repo, branch } = configStore.config
  const data = deleteTarget.data

  deleting.value = true
  try {
    await deleteDirectoryRecursive(owner, repo, data.path, branch)

    showDeleteModal.value = false

    clearCategoryCaches()
    forceCategoryFetch.value = true
    syncingCategories.value = true
    loading.value = true

    const synced = await waitForDirectorySync(data.path, { shouldExist: false })

    await loadRootCategories(true)
    treeKey.value++

    if (uploadStore.targetPath.includes(data.path)) {
      uploadStore.setTarget(series.value, '', '')
      selectedL1.value = ''
    }

    ElMessage.success(synced ? '分类删除成功' : '分类已删除，目录正在同步')
  } catch (e) {
    console.error('Delete category error:', e)
    ElMessage.error(e.message || '删除失败')
  } finally {
    syncingCategories.value = false
    deleting.value = false
  }
}

async function deleteDirectoryRecursive(owner, repo, path, branch) {
  let contents = []

  try {
    contents = await githubService.getContents(owner, repo, path, branch)

    if (!Array.isArray(contents)) {
      contents = [contents]
    }
  } catch (err) {
    if (err.status === 404 || err.type === 'NOT_FOUND') {
      return
    }
    throw err
  }

  for (const item of contents) {
    if (item.type === 'dir') {
      await deleteDirectoryRecursive(owner, repo, item.path, branch)
    } else {
      await githubService.deleteFile(
        owner,
        repo,
        item.path,
        item.sha,
        `Delete: ${item.name}`,
        branch
      )
    }
  }
}

async function _refreshStats() {
  loadingStats.value = true
  try {
    const { owner, repo, branch } = configStore.config
    for (const type of ['desktop', 'mobile', 'avatar']) {
      try {
        const c = await githubService.getContents(owner, repo, `wallpaper/${type}`, branch)
        stats[type] = c.filter(i => i.type === 'dir').length
      } catch {
        stats[type] = 0
      }
    }
    stats.total = stats.desktop + stats.mobile + stats.avatar
  } catch {
    return
  } finally {
    loadingStats.value = false
  }
}

const refreshStats = debounce(_refreshStats, 2000)

onMounted(async () => {
  try {
    if (authStore.isAuthenticated && !authStore.permissionChecked) {
      const { owner, repo } = configStore.config
      const cacheKey = `permission_${owner}_${repo}`

      sessionStorage.removeItem(cacheKey)
      console.log('[UploadView] 清除权限缓存，重新检查')

      authStore.permissionChecked = false
      await authStore.checkPermission(owner, repo)

      console.log('[UploadView] 权限检查完成:', {
        permissionLevel: authStore.permissionLevel,
        canUpload: authStore.canUpload,
        permissionChecked: authStore.permissionChecked
      })
    }

    await Promise.all([loadRootCategories(), refreshStats()])

    await syncSidebarAccordion(false)
    window.addEventListener('resize', handleSidebarResize)

    console.log('[UploadView] 数据加载完成')
  } catch (err) {
    console.error('加载失败:', err)
  }
})

onUnmounted(() => {
  console.log('[UploadView] 组件卸载，清理资源')

  workflowStore.cleanup()

  uploadStore.cleanup()

  clearCategoryCaches()

  window.removeEventListener('resize', handleSidebarResize)
  gsap.killTweensOf([previewPanelRef.value, workflowPanelRef.value])
})

watch(series, () => {
  selectedL1.value = ''
})
watch(
  () => uploadStore.files,
  files => {
    if (files.length > 0 && !previewFile.value) previewFile.value = files[0]
    else if (files.length === 0) previewFile.value = null
  },
  { deep: true }
)
</script>

<style scoped lang="scss">
.upload-view__loading {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  background: var(--studio-bg, #111214);
}
.loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.spinner {
  width: 28px;
  height: 28px;
  border: 2px solid var(--studio-border, #30343b);
  border-top-color: var(--studio-accent, #a8c7fa);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.loading-text {
  margin: 0;
  color: var(--studio-muted, #a1a6b0);
  font-size: 14px;
}
.upload-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100%;
  min-height: 0;
  padding: 0;
  gap: 24px;
  overflow: hidden;
  min-width: 0;
}
.upload-view__readonly-alert {
  flex-shrink: 0;
}
.upload-view__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  flex-shrink: 0;
}
.upload-view__title-area {
  min-width: 0;
}
.upload-view__title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--studio-text, #f3f4f6);
}
.upload-view__subtitle {
  margin: 8px 0 0;
  color: var(--studio-muted, #a1a6b0);
  font-size: 13px;
  line-height: 1.5;
}
.upload-view__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px 14px;
  max-width: 560px;
}
.upload-view__meta-chip {
  display: inline-flex;
  max-width: 100%;
  color: var(--studio-muted, #a1a6b0);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.upload-view__meta-chip + .upload-view__meta-chip {
  padding-left: 14px;
  border-left: 1px solid var(--studio-border, #30343b);
}
.upload-view__meta-chip--highlight {
  color: var(--studio-text, #f3f4f6);
}
.upload-view__content {
  display: grid;
  grid-template-columns: minmax(210px, 240px) minmax(0, 1fr) minmax(260px, 310px);
  gap: 18px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.upload-view__content > * {
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}
.upload-view__center,
.upload-view__preview,
.upload-view__workflow,
.upload-view__sidebar {
  min-height: 0;
  overflow: hidden;
}
.upload-view__center {
  overflow-y: auto;
  overscroll-behavior: contain;
}
.upload-view__sidebar {
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.upload-view__accordion-panel {
  flex-shrink: 0;
  overflow: hidden;
  min-height: 0;
}
.upload-view__overview {
  padding: 18px;
  background: var(--studio-surface, #191b1e);
  border: 1px solid var(--studio-border, #30343b);
  border-radius: 16px;
  flex-shrink: 0;
}
.upload-view__overview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
}
.upload-view__overview-title {
  margin: 0;
  color: var(--studio-text, #f3f4f6);
  font-size: 13px;
  font-weight: 600;
}
.upload-view__overview-actions {
  display: flex;
  gap: 8px;
}
.upload-view__overview-btn {
  padding: 4px 0 4px 8px;
  border: 0;
  background: transparent;
  color: var(--studio-muted, #a1a6b0);
  font-size: 11px;
  cursor: pointer;
}
.upload-view__overview-btn:hover {
  color: var(--studio-text, #f3f4f6);
}
.upload-view__overview-btn:focus-visible {
  outline: 2px solid var(--studio-accent, #a8c7fa);
  outline-offset: 3px;
  border-radius: 3px;
}
.upload-view__overview-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px 10px;
}
.upload-view__overview-item-label {
  display: block;
  margin-bottom: 6px;
  color: var(--studio-muted, #a1a6b0);
  font-size: 11px;
}
.upload-view__overview-item-value {
  display: block;
  color: var(--studio-text, #f3f4f6);
  font-size: 18px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.upload-view__overview-item--api {
  grid-column: 1 / -1;
  padding-top: 14px;
  border-top: 1px solid var(--studio-border, #30343b);
}
.upload-view__overview-item--api > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.upload-view__overview-item--api .upload-view__overview-item-label {
  margin-bottom: 0;
}
.upload-view__overview-item--api .upload-view__overview-item-value {
  font-size: 12px;
}
.upload-view__quota {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}
.upload-view__quota-bar {
  height: 4px;
  background: var(--studio-raised, #22252a);
  border-radius: 2px;
  overflow: hidden;
}
.upload-view__quota-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--studio-accent, #a8c7fa);
}
.upload-view__quota-text {
  color: var(--studio-muted, #a1a6b0);
  font-size: 11px;
}
.upload-view__preview,
.upload-view__workflow {
  height: 100%;
}
@media (max-width: 1280px) {
  .upload-view__content {
    grid-template-columns: minmax(200px, 220px) minmax(0, 1fr) minmax(240px, 270px);
  }
  .upload-view__header {
    align-items: flex-start;
  }
  .upload-view__meta {
    max-width: 420px;
  }
}
@media (max-width: 1100px) {
  .upload-view__content {
    grid-template-columns: minmax(200px, 240px) minmax(0, 1fr);
    grid-template-rows: minmax(560px, 1fr) auto;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    align-content: start;
  }
  .upload-view__sidebar {
    grid-column: 1 / -1;
    overflow: visible;
    height: auto;
  }
  .upload-view__overview-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .upload-view__overview-item--api {
    grid-column: auto;
    border: 0;
    padding: 0;
  }
  .upload-view__overview-item--api > div {
    display: block;
  }
  .upload-view__overview-item--api .upload-view__overview-item-label {
    margin-bottom: 6px;
  }
  .upload-view__overview-item--api .upload-view__overview-item-value {
    font-size: 18px;
  }
}
@media (max-width: 760px) {
  .upload-view {
    padding: 0;
    gap: 20px;
  }
  .upload-view__header {
    flex-direction: column;
    gap: 14px;
  }
  .upload-view__meta {
    justify-content: flex-start;
  }
  .upload-view__content {
    grid-template-columns: 1fr;
    grid-template-rows: 260px auto auto;
  }
  .upload-view__center {
    height: auto;
    overflow: visible;
  }
  .upload-view__center :deep(.upload-panel),
  .upload-view__center :deep(.upload-panel__main),
  .upload-view__center :deep(.upload-panel__files),
  .upload-view__center :deep(.upload-file-grid) {
    height: auto;
    overflow: visible;
  }
  .upload-view__center :deep(.upload-panel__main) {
    min-height: 360px;
  }
  .upload-view__center :deep(.upload-file-grid__grid) {
    overflow: visible;
    flex: none;
  }
  .upload-view__center :deep(.upload-file-grid__empty) {
    min-height: 180px;
  }
  .upload-view__center :deep(.upload-panel__main) {
    flex: none;
  }

  .upload-view__overview-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .upload-view__overview-item--api {
    grid-column: 1 / -1;
  }
  .upload-view__overview-item--api > div {
    display: flex;
  }
  .upload-view__overview-item--api .upload-view__overview-item-value {
    font-size: 12px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation-duration: 2s;
  }
}
</style>
