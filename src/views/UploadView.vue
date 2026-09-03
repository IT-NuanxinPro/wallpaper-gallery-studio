<template>
  <MainLayout>
    <!-- 全局加载状态（仅在必要时显示） -->
    <div v-if="pageLoading" class="upload-view__loading">
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p class="loading-text">加载中...</p>
      </div>
    </div>

    <div v-else ref="viewRef" class="upload-view">
      <!-- 只读提示 -->
      <el-alert
        v-if="authStore.permissionChecked && !authStore.canUpload"
        type="warning"
        :closable="false"
        class="upload-view__readonly-alert"
      >
        <template #title>
          <span>🔒 只读模式 - 当前账号没有上传权限，仅可浏览分类</span>
        </template>
      </el-alert>

      <div class="upload-view__header">
        <div class="upload-view__title-main">
          <span class="upload-view__title-icon">↥</span>
          <div>
            <h1 class="upload-view__title">上传中心</h1>
            <p class="upload-view__subtitle">批量整理、AI 分类并发布图片</p>
          </div>
        </div>

        <div class="upload-view__meta">
          <span class="upload-view__meta-chip">{{ currentModeLabel }}</span>
          <span class="upload-view__meta-chip">{{ currentSeriesLabel }}</span>
          <el-popover placement="bottom-end" :width="320" trigger="click">
            <template #reference>
              <button class="upload-view__overview-trigger">概览 <span>⌄</span></button>
            </template>
            <div class="upload-view__overview-popover">
              <div class="upload-view__overview-popover-head">
                <div>
                  <strong>仓库概览</strong>
                  <span>分类数量与 GitHub API 配额</span>
                </div>
                <button @click="refreshStats">刷新</button>
              </div>
              <div class="upload-view__overview-grid">
                <div
                  v-for="item in overviewItems"
                  :key="item.label"
                  class="upload-view__overview-item"
                >
                  <span>{{ item.icon }}</span>
                  <small>{{ item.label }}</small>
                  <strong>{{ item.value }}</strong>
                </div>
              </div>
              <div class="upload-view__quota">
                <div class="upload-view__quota-bar">
                  <div class="upload-view__quota-fill" :style="{ width: quotaPercent + '%' }"></div>
                </div>
                <span>API 可用 {{ quotaPercent }}%</span>
              </div>
              <button class="upload-view__history-btn" @click="showHistoryModal = true">
                查看发布历史
              </button>
            </div>
          </el-popover>
        </div>
      </div>

      <!-- 工作区布局 -->
      <div
        class="upload-view__content"
        :class="{ 'upload-view__content--categories-collapsed': categoryCollapsed }"
      >
        <section class="upload-view__category-shell">
          <button
            class="upload-view__category-toggle"
            :title="categoryCollapsed ? '展开分类目录' : '收起分类目录'"
            @click="categoryCollapsed = !categoryCollapsed"
          >
            <span>{{ categoryCollapsed ? '›' : '‹' }}</span>
          </button>
          <div v-if="categoryCollapsed" class="upload-view__category-rail">
            <span>📁</span>
            <small>分类</small>
          </div>
          <CategorySidebar
            v-else
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
        </section>

        <div class="upload-view__center">
          <UploadPanel
            :target-path="uploadStore.targetPath"
            :files="uploadStore.files"
            :selected-id="previewFile?.id"
            :uploading="uploading"
            :progress="uploadStore.totalProgress"
            :pending-count="uploadStore.pendingFiles.length"
            :error-count="uploadStore.errorFiles.length"
            :upload-mode="uploadStore.uploadMode"
            :current-series="series"
            :ai-config="aiConfig"
            :ai-analyzing="uploadStore.aiAnalyzing"
            :ai-analyzing-count="uploadStore.aiAnalyzingCount"
            :metadata-status="uploadStore.metadataStatus"
            :metadata-error="uploadStore.metadataError"
            :can-upload="authStore.canUpload"
            @add-files="addFiles"
            @remove="handleRemoveFile"
            @remove-batch="handleRemoveFiles"
            @clear="handleClearFiles"
            @retry="handleRetry"
            @upload="handleUpload"
            @select="selectPreview"
            @change-target="handleChangeTarget"
            @mode-change="handleModeChange"
            @series-change="handleSeriesChange"
            @model-change="handleModelChange"
            @retry-metadata="handleRetryMetadata"
            @apply-all-ai="handleApplyAllAi"
            @edit-ai="handleEditAI"
          />
        </div>

        <aside class="upload-view__sidebar">
          <AITaskCenter
            v-if="
              uploadStore.uploadMode === 'ai' &&
              (aiTasksStore.tasks.length > 0 || aiTasksStore.persistenceWarning)
            "
          />

          <div
            class="upload-view__accordion-panel upload-view__preview-panel"
            :class="{ 'upload-view__accordion-panel--active': activeSidebarPanel === 'preview' }"
          >
            <ImagePreview
              :file="previewFile"
              :collapsed="activeSidebarPanel !== 'preview'"
              class="upload-view__preview"
              @toggle="openSidebarPanel('preview')"
            />
          </div>
          <div
            class="upload-view__accordion-panel upload-view__workflow-panel"
            :class="{ 'upload-view__accordion-panel--active': activeSidebarPanel === 'workflow' }"
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

      <!-- 发布历史弹窗 -->
      <ReleaseHistoryModal
        :visible="showHistoryModal"
        :stats-data="workflowStore.statsData"
        @close="showHistoryModal = false"
      />

      <!-- 目录选择弹窗 -->
      <TargetSelectModal
        :visible="showTargetModal"
        :file="targetEditFile"
        :current-series="series"
        @close="showTargetModal = false"
        @confirm="handleTargetConfirm"
      />

      <!-- 删除分类确认弹窗 -->
      <DeleteCategoryModal
        :visible="showDeleteModal"
        :category-name="deleteTarget.data?.name || ''"
        :has-sub-dirs="deleteTarget.hasSubDirs"
        :has-images="deleteTarget.hasImages"
        :deleting="deleting"
        @close="showDeleteModal = false"
        @confirm="confirmDeleteCategory"
      />

      <!-- 编辑 AI 分析结果弹窗 -->
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
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import MainLayout from '@/components/MainLayout.vue'
import CategorySidebar from '@/components/upload/CategorySidebar.vue'
import UploadPanel from '@/components/upload/UploadPanel.vue'
import AITaskCenter from '@/components/upload/AITaskCenter.vue'
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
import { clearUploadCategoryTreeCache } from '@/services/upload/category-directory'
import { useConfigStore } from '@/stores/config'
import { useUploadStore } from '@/stores/upload'
import { useAuthStore } from '@/stores/auth'
import { useWorkflowStore } from '@/stores/workflow'
import { useAiTasksStore } from '@/stores/ai-tasks'
import { debounce } from '@/utils/debounce'
import { detectBatchImageTypes, getDetectionStats } from '@/utils/image-detector'

const configStore = useConfigStore()
const uploadStore = useUploadStore()
const authStore = useAuthStore()
const workflowStore = useWorkflowStore()
const aiTasksStore = useAiTasksStore()

const viewRef = ref(null)
const forceCategoryFetch = ref(false)
const pageLoading = ref(false) // 页面加载状态，默认不显示 loading
const series = ref('desktop')
const treeData = ref([])
const treeKey = ref(0) // 用于强制刷新树组件
const loading = ref(false)
const syncingCategories = ref(false)
const loadingStats = ref(false)
const selectedL1 = ref('')
const previewFile = ref(null)
const activeSidebarPanel = ref('workflow')
const categoryCollapsed = ref(false)
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

// AI 配置
const aiConfig = computed(() => uploadStore.getCurrentAiConfig())
const currentModeLabel = computed(() =>
  uploadStore.uploadMode === 'ai' ? 'AI 智能分类' : '手动上传'
)
const currentSeriesLabel = computed(() => {
  const labels = {
    desktop: '电脑壁纸',
    mobile: '手机壁纸',
    avatar: '头像壁纸'
  }

  return labels[series.value] || '未选择'
})
const overviewItems = computed(() => [
  { label: '电脑分类', icon: '🖥️', value: stats.desktop },
  { label: '手机分类', icon: '📱', value: stats.mobile },
  { label: '头像分类', icon: '👤', value: stats.avatar },
  {
    label: 'API 剩余',
    icon: '⚡',
    value: `${rateLimit.value.remaining}/${rateLimit.value.limit}`
  }
])

const categoryCache = new Map()
const CACHE_TTL = 5 * 60 * 1000

function getCache(key) {
  const c = categoryCache.get(key)
  return c && Date.now() - c.timestamp < CACHE_TTL ? c.data : null
}

function setCache(key, data) {
  categoryCache.set(key, { data, timestamp: Date.now() })
}

function clearCategoryCaches() {
  categoryCache.clear()
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
  const cacheKey = `${series.value}-root`
  const cached = forceRefresh ? null : getCache(cacheKey)
  console.log('[loadRootCategories] cacheKey:', cacheKey, 'cached:', !!cached)
  if (cached) {
    treeData.value = cached
    return
  }

  loading.value = true
  try {
    const { owner, repo, branch } = configStore.config
    console.log('[loadRootCategories] Fetching from GitHub...')
    const contents = await githubService.getContents(
      owner,
      repo,
      `wallpaper/${series.value}`,
      branch,
      { forceRefresh }
    )
    const categories = contents
      .filter(i => i.type === 'dir')
      .map(i => ({
        name: i.name,
        path: i.path,
        type: 'l1',
        children: [],
        loaded: false
      }))
    console.log(
      '[loadRootCategories] Got categories:',
      categories.map(c => c.name)
    )
    treeData.value = categories
    setCache(cacheKey, categories)
  } catch (err) {
    console.error('[loadRootCategories] Error:', err)
    treeData.value = []
  } finally {
    loading.value = false
    if (forceRefresh) {
      forceCategoryFetch.value = false
    }
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

  const cached = getCache(node.data.path)
  if (cached) {
    resolve(cached)
    return
  }

  try {
    const { owner, repo, branch } = configStore.config
    const contents = await githubService.getContents(owner, repo, node.data.path, branch, {
      forceRefresh: forceCategoryFetch.value
    })
    const children = contents
      .filter(i => i.type === 'dir')
      .map(i => ({ name: i.name, path: i.path, type: 'l2' }))
    setCache(node.data.path, children)
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
  // 权限检查
  if (!authStore.canUpload) {
    ElMessage.error('🔒 您没有上传权限，无法添加文件')
    return
  }

  const imgs = files.filter(f => f.type.startsWith('image/'))
  if (!imgs.length) {
    ElMessage.warning('请选择图片文件')
    return
  }

  // 大批量上传警告
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

  // 自动检测图片类型
  if (uploadStore.uploadMode === 'ai' && imgs.length > 0) {
    try {
      const detectionResults = await detectBatchImageTypes(imgs)
      const stats = getDetectionStats(detectionResults)

      // 如果大部分图片是同一类型，自动切换
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
        // 有检测失败的
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

async function handleRemoveFile(fileId) {
  try {
    await uploadStore.removeFile(fileId)
  } catch (error) {
    ElMessage.error(error.message || '删除失败，任务与图片均未移除')
  }
}

async function handleRemoveFiles(fileIds) {
  try {
    await uploadStore.removeFiles(fileIds)
  } catch (error) {
    ElMessage.error(error.message || '批量删除失败，任务与图片均未移除')
  }
}

async function handleClearFiles() {
  try {
    await uploadStore.clearFiles()
  } catch (error) {
    ElMessage.error(error.message || '清空失败，任务与图片均未移除')
  }
}

async function clearSuccessfulFilesSafely() {
  try {
    await uploadStore.clearSuccessFiles()
  } catch (error) {
    ElMessage.warning(error.message || '上传已完成，但本地任务清理失败，可稍后手动清理')
  }
}

// 处理上传结果（handleUpload 和 handleRetry 公共逻辑）
async function handleUploadResults(results, messagePrefix = '上传') {
  const ok = results.results.filter(r => r.success).length
  const fail = results.results.length - ok
  const reused = results.results.filter(r => r.reusedExisting).length

  // 更新会话上传计数
  if (ok > 0) {
    workflowStore.addSessionUpload(ok)
  }

  // 保存上传记录到本地存储
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

  // 显示消息
  if (messagePrefix === '上传') {
    ElMessage[fail ? 'warning' : 'success'](
      fail
        ? `上传完成：${ok} 成功，${fail} 失败${reused > 0 ? `（其中 ${reused} 个复用已上传图片）` : ''}`
        : `成功处理 ${ok} 个文件${reused > 0 ? `（其中 ${reused} 个复用已上传图片）` : ''}`
    )
    if (results.metadataResult?.success === false) {
      ElMessage.warning(`图片已上传，但元数据生成失败：${results.metadataResult.error}`)
    }
    // 清理成功上传的文件（释放内存）
    if (ok > 0 && results.metadataResult?.success !== false) {
      await clearSuccessfulFilesSafely()
    }
  } else {
    ElMessage[fail ? 'warning' : 'success'](
      fail ? `重试完成：${ok} 成功，${fail} 失败` : `重试成功，${ok} 个文件已上传`
    )
    // 清理成功上传的文件
    if (ok > 0) {
      await clearSuccessfulFilesSafely()
    }
  }

  refreshStats()

  // 刷新工作流状态（延迟 2 秒等待 GitHub API 同步）
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
  // 检查是否有文件没有目标路径
  const filesWithoutTarget = uploadStore.pendingFiles.filter(f => !f.targetPath)
  if (filesWithoutTarget.length > 0) {
    ElMessage.warning(`有 ${filesWithoutTarget.length} 个文件未设置上传目录`)
    return
  }

  // 打开进度弹框
  showProgressModal.value = true

  try {
    const results = await uploadStore.uploadAll()
    await handleUploadResults(results, '上传')
  } catch (e) {
    ElMessage.error(e.message || '上传失败')
  }
}

async function handleRetryMetadata() {
  try {
    const result = await uploadStore.retryPendingMetadata()
    if (!result) return

    if (result.success) {
      ElMessage.success('元数据已重新生成并提交')
      await clearSuccessfulFilesSafely()

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

function handleChangeTarget(file) {
  targetEditFile.value = file
  showTargetModal.value = true
}

async function handleTargetConfirm({ series: newSeries, l1, l2 }) {
  try {
    if (targetEditFile.value) {
      await uploadStore.updateFileTarget(targetEditFile.value.id, newSeries, l1, l2)
    }
    showTargetModal.value = false
    targetEditFile.value = null
  } catch (error) {
    ElMessage.error(error.message || '分类保存失败，请重试')
  }
}

// 上传模式切换
function handleModeChange(mode) {
  uploadStore.setUploadMode(mode)
  categoryCollapsed.value = mode === 'ai' && uploadStore.files.length > 0
  // 切换到手动模式时，如果没有选择目录，清空新添加的文件的目标路径
  if (mode === 'manual' && !uploadStore.targetPath) {
    ElMessage.info('请在左侧选择上传目录')
  }
}

// 系列切换（AI 模式下）
function handleSeriesChange(newSeries) {
  series.value = newSeries
  uploadStore.setTarget(newSeries, '', '')
  selectedL1.value = ''

  if (uploadStore.uploadMode === 'manual') {
    loadRootCategories()
  }
}

// 应用所有 AI 推荐
async function handleApplyAllAi() {
  try {
    const count = await uploadStore.applyAllAiRecommendations()
    if (count > 0) {
      ElMessage.success(`已应用 ${count} 个 AI 推荐分类`)
    } else {
      ElMessage.info('没有待应用的 AI 推荐')
    }
  } catch (error) {
    ElMessage.error(error.message || '应用 AI 推荐失败')
  }
}

function handleModelChange(modelKey) {
  uploadStore.setAiModel(modelKey)
  const config = uploadStore.getCurrentAiConfig()
  ElMessage.success(`已切换到 ${config.modelName}`)
}

// 编辑 AI 分析结果
function handleEditAI(file) {
  editAIFile.value = file
  showEditAIModal.value = true
}

function closeEditAIModal() {
  showEditAIModal.value = false
  editAIFile.value = null
}

// 保存 AI 分析结果修改
async function handleSaveAIResult({ fileId, aiMetadata }) {
  savingAI.value = true
  try {
    // 更新文件的 AI 元数据
    await uploadStore.setFileAiMetadata(fileId, aiMetadata, true)

    ElMessage.success('AI 分析结果已更新')
    closeEditAIModal()
  } catch (error) {
    ElMessage.error('保存失败：' + error.message)
  } finally {
    savingAI.value = false
  }
}

async function handleRetry() {
  try {
    const results = await uploadStore.retryFailed()
    if (!results) return
    await handleUploadResults(results, '重试')
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

    // 根据是否有父分类决定创建一级还是二级
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
    // 先检查目录内容
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

    // 设置删除目标并打开弹窗
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
    // 递归删除目录下所有文件
    await deleteDirectoryRecursive(owner, repo, data.path, branch)

    // 关闭弹窗
    showDeleteModal.value = false

    clearCategoryCaches()
    forceCategoryFetch.value = true
    syncingCategories.value = true
    loading.value = true

    const synced = await waitForDirectorySync(data.path, { shouldExist: false })

    await loadRootCategories(true)
    treeKey.value++

    // 如果删除的是当前选中的分类，清空选择
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
    // 确保 contents 是数组
    if (!Array.isArray(contents)) {
      contents = [contents]
    }
  } catch (err) {
    // 目录为空或不存在，无需删除
    if (err.status === 404 || err.type === 'NOT_FOUND') {
      return
    }
    throw err
  }

  for (const item of contents) {
    if (item.type === 'dir') {
      // 递归删除子目录
      await deleteDirectoryRecursive(owner, repo, item.path, branch)
    } else {
      // 删除文件（包括 .gitkeep）
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

// 原始刷新统计函数
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
    // 忽略统计加载错误
  } finally {
    loadingStats.value = false
  }
}

// 防抖版本的刷新统计函数（2秒防抖）
const refreshStats = debounce(_refreshStats, 2000)

onMounted(async () => {
  try {
    if (uploadStore.files.length > 0) {
      previewFile.value = uploadStore.files[0]
      categoryCollapsed.value = uploadStore.uploadMode === 'ai'
    }

    // 1. 检查权限（如果需要的话）
    if (authStore.isAuthenticated && !authStore.permissionChecked) {
      const { owner, repo } = configStore.config
      const cacheKey = `permission_${owner}_${repo}`

      // 清除旧缓存
      sessionStorage.removeItem(cacheKey)
      console.log('[UploadView] 清除权限缓存，重新检查')

      // 重新检查权限
      authStore.permissionChecked = false
      await authStore.checkPermission(owner, repo)

      console.log('[UploadView] 权限检查完成:', {
        permissionLevel: authStore.permissionLevel,
        canUpload: authStore.canUpload,
        permissionChecked: authStore.permissionChecked
      })
    }

    // 2. 加载数据（并行执行）
    await Promise.all([loadRootCategories(), refreshStats()])

    console.log('[UploadView] 数据加载完成')
  } catch (err) {
    console.error('加载失败:', err)
  }
})

// 组件卸载时清理资源
onUnmounted(() => {
  console.log('[UploadView] 组件卸载，清理资源')

  // 清理工作流轮询和定时器
  workflowStore.cleanup()

  // 清理上传store中的预览URL和Worker
  uploadStore.cleanup()

  // 清理分类缓存
  clearCategoryCaches()
})

watch(series, () => {
  selectedL1.value = ''
})
watch(
  () => uploadStore.files,
  files => {
    if (files.length === 0) {
      previewFile.value = null
      return
    }

    if (!previewFile.value || !files.some(file => file.id === previewFile.value.id)) {
      previewFile.value = files[0]
    }
  },
  { deep: true }
)
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.upload-view__loading {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  z-index: 9999;
}

.loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $spacing-6;
}

.spinner {
  width: 60px;
  height: 60px;
  border: 4px solid rgba(102, 126, 234, 0.2);
  border-top-color: $primary-start;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  font-size: $font-size-xl;
  color: $white;
  font-weight: 500;
  margin: 0;
}

.upload-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: $spacing-6;
  gap: $spacing-5;
  overflow: hidden;

  &__readonly-alert {
    flex-shrink: 0;
    border-radius: $radius-lg;
    background: rgba(230, 162, 60, 0.1);
    border: 1px solid rgba(230, 162, 60, 0.3);

    :deep(.el-alert__content) {
      color: #e6a23c;
    }
  }

  &__header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: $spacing-4;
    flex-shrink: 0;
  }

  &__title-area {
    display: flex;
    flex-direction: column;
    gap: $spacing-2;
    min-width: 0;
  }

  &__title-main {
    display: flex;
    align-items: center;
    gap: $spacing-3;
    flex-wrap: wrap;
  }

  &__title-badge {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    padding: $spacing-1 $spacing-3;
    background: rgba($primary-start, 0.12);
    border: 1px solid rgba($primary-start, 0.22);
    border-radius: $radius-full;
    font-size: $font-size-xs;
    color: $white;
  }

  &__title {
    margin: 0;
    font-size: 30px;
    font-weight: 700;
    background: $primary-gradient;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  &__subtitle {
    margin: 0;
    color: $gray-400;
    font-size: $font-size-sm;
    line-height: 1.5;
  }

  &__meta {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: $spacing-2;
    max-width: 520px;
  }

  &__meta-chip {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    padding: $spacing-2 $spacing-3;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: $radius-full;
    color: $gray-300;
    font-size: $font-size-sm;
    line-height: 1.4;

    &--highlight {
      color: $white;
      background: rgba($primary-start, 0.18);
      border-color: rgba($primary-start, 0.3);
    }
  }

  &__categories {
    min-width: 0;
  }

  &__content {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(248px, 286px) minmax(0, 1.68fr) minmax(320px, 380px);
    gap: $spacing-5;
    min-height: 0;
    overflow: hidden;

    > * {
      min-height: 0;
      height: 100%;
      overflow: hidden;
    }
  }

  &__center,
  &__preview,
  &__workflow,
  &__sidebar {
    min-height: 0;
    overflow: hidden;
  }

  &__sidebar {
    display: flex;
    flex-direction: column;
    gap: $spacing-4;
  }

  &__accordion-panel {
    overflow: hidden;
    min-height: 0;
  }

  &__overview {
    padding: $spacing-4;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.045));
    backdrop-filter: blur($glass-blur);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: $radius-xl;
    box-shadow: 0 14px 30px rgba(0, 0, 0, 0.14);
    flex-shrink: 0;
  }

  &__overview-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: $spacing-3;
    margin-bottom: $spacing-3;
  }

  &__overview-label {
    margin: 0 0 $spacing-1;
    font-size: 11px;
    color: $gray-500;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  &__overview-title {
    margin: 0;
    font-size: $font-size-base;
    color: $white;
  }

  &__overview-actions {
    display: flex;
    gap: $spacing-2;
  }

  &__overview-btn {
    min-height: 32px;
    padding: 0 $spacing-3;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.05));
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: $radius-full;
    color: $gray-300;
    font-size: $font-size-xs;
    cursor: pointer;
    transition: all $duration-normal;

    &:hover {
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.11), rgba(255, 255, 255, 0.07));
      border-color: rgba($primary-start, 0.3);
      color: $white;
      box-shadow: 0 10px 22px rgba(0, 0, 0, 0.12);
    }
  }

  &__overview-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: $spacing-3;
  }

  &__overview-item {
    display: flex;
    align-items: center;
    gap: $spacing-3;
    padding: $spacing-3;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.045));
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: $radius-lg;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);

    &-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      background: rgba($primary-start, 0.12);
      border: 1px solid rgba($primary-start, 0.16);
      border-radius: 12px;
      font-size: 16px;
      flex-shrink: 0;
    }

    &-label {
      display: block;
      margin-bottom: 2px;
      font-size: $font-size-xs;
      color: $gray-500;
    }

    &-value {
      display: block;
      color: $white;
      font-size: $font-size-base;
      font-weight: 700;
    }

    &--api {
      background: linear-gradient(180deg, rgba($primary-start, 0.12), rgba($primary-start, 0.06));
      border-color: rgba($primary-start, 0.22);
    }
  }

  &__quota {
    margin-top: $spacing-3;
    display: flex;
    flex-direction: column;
    gap: $spacing-2;
  }

  &__quota-bar {
    height: 8px;
    background: rgba(255, 255, 255, 0.07);
    border-radius: $radius-full;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  &__quota-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #34d399 0%, $primary-start 100%);
  }

  &__quota-text {
    font-size: $font-size-xs;
    color: $gray-400;
  }

  &__preview {
    min-height: 0;
    height: 100%;
  }

  &__workflow {
    min-height: 0;
    height: 100%;
  }
}

// 响应式
@media (max-width: 1500px) {
  .upload-view__content {
    grid-template-columns: minmax(236px, 272px) minmax(0, 1.62fr) minmax(300px, 350px);
  }
}

@media (max-width: 1400px) {
  .upload-view {
    padding: $spacing-5;

    &__header {
      align-items: flex-start;
      flex-direction: column;
    }

    &__meta {
      justify-content: flex-start;
      max-width: none;
    }

    &__content {
      grid-template-columns: minmax(232px, 264px) minmax(0, 1fr) minmax(300px, 340px);
    }
  }
}

@media (max-width: 1180px) {
  .upload-view {
    overflow: auto;

    &__content {
      grid-template-columns: minmax(228px, 264px) minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr) auto;
      overflow: visible;
    }

    &__sidebar {
      grid-column: 1 / -1;
      display: flex;
      flex-direction: column;
      overflow: visible;
    }

    &__overview,
    &__preview,
    &__workflow {
      min-height: 0;
    }
  }
}

@media (max-width: 900px) {
  .upload-view {
    padding: $spacing-4;
    gap: $spacing-4;

    &__content {
      grid-template-columns: 1fr;
      grid-template-rows: 260px minmax(520px, 1fr) auto;
    }

    &__title {
      font-size: 28px;
    }

    &__sidebar {
      display: flex;
      flex-direction: column;
    }

    &__overview-grid {
      grid-template-columns: 1fr 1fr;
    }
  }
}

@media (max-width: 640px) {
  .upload-view {
    &__title {
      font-size: $font-size-2xl;
    }

    &__subtitle {
      font-size: $font-size-xs;
    }

    &__meta {
      gap: $spacing-2;
    }

    &__meta-chip {
      width: 100%;
      border-radius: $radius-lg;
    }

    &__overview-header {
      flex-direction: column;
      align-items: stretch;
    }

    &__overview-actions {
      width: 100%;
    }

    &__overview-btn {
      flex: 1;
    }

    &__overview-grid {
      grid-template-columns: 1fr;
    }
  }
}
</style>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.upload-view {
  height: 100%;
  gap: 12px;
  padding: 16px 18px 18px;

  &__header {
    align-items: center;
    min-height: 46px;
  }

  &__title-main {
    flex-wrap: nowrap;
    gap: 10px;
  }

  &__title-icon {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 1px solid rgba($primary-start, 0.24);
    border-radius: 11px;
    background: rgba($primary-start, 0.13);
    color: #cdb8ff;
    font-size: 18px;
  }

  &__title {
    color: $white;
    font-size: 20px;
    -webkit-text-fill-color: initial;
    background: none;
  }

  &__subtitle {
    margin-top: 2px;
    color: $gray-500;
    font-size: 10px;
  }

  &__meta {
    align-items: center;
    max-width: none;
  }

  &__meta-chip,
  &__overview-trigger {
    min-height: 30px;
    padding: 0 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: $radius-full;
    background: rgba(255, 255, 255, 0.045);
    color: $gray-400;
    font-size: 10px;
  }

  &__overview-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;

    &:hover {
      border-color: rgba($primary-start, 0.28);
      color: $white;
    }
  }

  &__content {
    grid-template-columns: 230px minmax(0, 1fr) 310px;
    gap: 12px;
    transition: grid-template-columns 0.22s ease;

    &--categories-collapsed {
      grid-template-columns: 48px minmax(0, 1fr) 310px;
    }
  }

  &__category-shell {
    position: relative;
    height: 100%;
    min-height: 0;
    overflow: visible !important;
  }

  &__category-toggle {
    position: absolute;
    top: 14px;
    right: -8px;
    z-index: 6;
    display: grid;
    place-items: center;
    width: 22px;
    height: 30px;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    background: #151a2a;
    color: $gray-400;
    cursor: pointer;

    &:hover {
      border-color: rgba($primary-start, 0.4);
      color: $white;
    }
  }

  &__category-rail {
    display: flex;
    align-items: center;
    flex-direction: column;
    gap: 8px;
    height: 100%;
    padding-top: 58px;
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: $radius-xl;
    background: rgba(255, 255, 255, 0.035);
    color: $gray-500;

    small {
      font-size: 9px;
      letter-spacing: 0.2em;
      writing-mode: vertical-rl;
    }
  }

  &__sidebar {
    gap: 10px;
  }

  &__accordion-panel {
    flex: 0 0 52px;
    height: 52px !important;
    transition:
      flex 0.26s ease,
      height 0.26s ease;

    &--active {
      flex: 1 1 260px;
      height: auto !important;
    }
  }

  &__overview-popover {
    color: $gray-300;
  }

  &__overview-popover-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;

    div {
      display: flex;
      flex-direction: column;
    }

    strong {
      color: $white;
      font-size: 13px;
    }

    span {
      color: $gray-500;
      font-size: 9px;
    }

    button {
      padding: 5px 8px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.04);
      color: $gray-400;
      font-size: 9px;
      cursor: pointer;
    }
  }

  &__overview-grid {
    gap: 7px;
  }

  &__overview-item {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0 7px;
    padding: 8px;
    border-radius: 10px;

    > span {
      grid-row: 1 / 3;
      align-self: center;
    }

    small {
      color: $gray-500;
      font-size: 8px;
    }

    strong {
      color: $white;
      font-size: 11px;
    }
  }

  &__quota {
    margin-top: 10px;
    gap: 5px;

    span {
      color: $gray-500;
      font-size: 8px;
    }
  }

  &__quota-bar {
    height: 5px;
  }

  &__history-btn {
    width: 100%;
    margin-top: 10px;
    padding: 7px;
    border: 1px solid rgba($primary-start, 0.22);
    border-radius: 9px;
    background: rgba($primary-start, 0.09);
    color: #cdb8ff;
    font-size: 10px;
    cursor: pointer;
  }
}

@media (max-width: 1380px) {
  .upload-view {
    &__content {
      grid-template-columns: 210px minmax(0, 1fr) 290px;

      &--categories-collapsed {
        grid-template-columns: 48px minmax(0, 1fr) 290px;
      }
    }
  }
}

@media (max-width: 1080px) {
  .upload-view {
    overflow: auto;

    &__content,
    &__content--categories-collapsed {
      grid-template-columns: 220px minmax(0, 1fr);
      grid-template-rows: minmax(560px, 1fr) auto;
      overflow: visible;
    }

    &__sidebar {
      grid-column: 1 / -1;
      min-height: 420px;
      overflow: visible;
    }
  }
}

@media (max-width: 760px) {
  .upload-view {
    padding: 12px;

    &__header {
      align-items: stretch;
    }

    &__meta {
      width: 100%;
      justify-content: flex-start;
    }

    &__content,
    &__content--categories-collapsed {
      grid-template-columns: 1fr;
      grid-template-rows: 240px minmax(620px, 1fr) auto;
    }

    &__category-toggle {
      display: none;
    }

    &__category-rail {
      display: none;
    }
  }
}
</style>
