<template>
  <MainLayout>
    <div class="local-collection">
      <header class="local-collection__heading">
        <div>
          <h1>素材采集</h1>
          <p>在本机发现素材，整理成批，再送到图片上传。</p>
        </div>
        <div class="local-collection__header-actions">
          <span class="collection-connection" :class="{ 'is-connected': connected }" role="status"
            ><i />{{ connected ? '本机已连接' : connecting ? '正在连接' : '连接已断开' }}</span
          >
          <el-button
            class="local-collection__settings-toggle"
            :icon="Setting"
            :aria-pressed="controlsVisible"
            @click="controlsVisible = !controlsVisible"
            >{{ controlsVisible ? '查看素材' : '采集设置' }}</el-button
          >
          <el-button
            circle
            :icon="Refresh"
            :loading="connecting"
            aria-label="重新连接并刷新"
            title="重新连接并刷新"
            @click="connect"
          />
        </div>
      </header>
      <Transition name="studio-feedback">
        <div v-if="error" class="collection-notice collection-notice--error" role="alert">
          <el-icon><Warning /></el-icon><span>{{ error }}</span
          ><el-button size="small" :loading="connecting" @click="connect">重新连接</el-button>
        </div>
      </Transition>
      <div class="local-collection__workspace" :class="{ 'is-configuring': controlsVisible }">
        <aside
          class="local-collection__controls"
          data-scroll-region
          tabindex="0"
          aria-label="采集参数滚动区"
        >
          <CollectionControls
            :form="form"
            :platforms="platforms"
            :sources="sources"
            :sources-loading="sourcesLoading"
            :disabled="!connected || Boolean(busy)"
            :running="status.running"
            :stop-requested="status.stopRequested"
            :busy="busy"
            @update="updateForm"
            @platform="changePlatform"
            @start="startCollection"
            @stop="stopCollection"
          />
          <p v-if="health.outputRoot" class="local-collection__location" :title="health.outputRoot">
            <el-icon><FolderOpened /></el-icon>{{ health.outputRoot }}
          </p>
        </aside>
        <section class="local-collection__content" aria-label="本地素材工作区">
          <div class="collection-activity" :class="{ 'is-running': status.running }">
            <div class="collection-activity__summary">
              <span class="collection-activity__indicator" /><strong>{{ taskLabel }}</strong
              ><span v-if="status.label" class="collection-activity__source">{{
                status.label
              }}</span
              ><el-button
                text
                size="small"
                :aria-expanded="logsVisible"
                @click="logsVisible = !logsVisible"
                >{{ logsVisible ? '收起日志' : '查看日志' }}</el-button
              >
            </div>
            <div class="collection-activity__stats">
              <span
                >新增 <b>{{ status.stats?.downloaded || 0 }}</b></span
              ><span
                >跳过
                <b>{{ (status.stats?.existing || 0) + (status.stats?.filtered || 0) }}</b></span
              ><span
                >重复 <b>{{ status.stats?.duplicates || 0 }}</b></span
              ><span
                >失败 <b>{{ status.stats?.failed || 0 }}</b></span
              >
            </div>
            <el-collapse-transition>
              <pre
                v-show="logsVisible"
                class="collection-activity__logs"
                data-scroll-region
                tabindex="0"
                aria-label="采集日志"
                >{{ status.logs?.join('\n') || '开始采集后，运行日志会显示在这里。' }}</pre
              >
            </el-collapse-transition>
          </div>
          <div
            v-if="receiptError"
            class="collection-notice collection-notice--warning"
            role="alert"
          >
            <span>{{ receiptError }}</span
            ><el-button size="small" :loading="receiptsBusy" @click="retryReceipts(true)"
              >同步上传状态</el-button
            >
          </div>
          <div class="collection-tabs" role="tablist" aria-label="素材视图">
            <button
              v-for="item in tabs"
              :id="`collection-tab-${item.id}`"
              :key="item.id"
              type="button"
              role="tab"
              :aria-selected="tab === item.id"
              :aria-controls="`collection-panel-${item.id}`"
              :tabindex="tab === item.id ? 0 : -1"
              :class="{ 'is-active': tab === item.id }"
              @click="selectTab(item.id)"
              @keydown="navigateTabs($event, item.id)"
            >
              {{ item.label }}<span v-if="item.id === 'batches'">{{ batchCounts.active }}</span
              ><span v-else-if="item.id === 'history'">{{ batchCounts.history }}</span>
            </button>
          </div>
          <div class="collection-toolbar">
            <span>{{
              tab === 'batches' || tab === 'history' ? '全部平台与图源' : sourceLabel
            }}</span>
            <el-button
              v-if="tab === 'batches' || tab === 'history'"
              text
              size="small"
              :loading="receiptsBusy"
              :disabled="!connected"
              @click="retryReceipts(true)"
              >同步上传状态</el-button
            >
            <el-button
              v-if="tab === 'files'"
              size="small"
              :icon="FolderAdd"
              :disabled="!connected || status.running || !form.source"
              @click="batchDialog = true"
              >整理为批次</el-button
            >
          </div>
          <div
            :id="`collection-panel-${tab}`"
            class="collection-scroll"
            role="tabpanel"
            :aria-labelledby="`collection-tab-${tab}`"
            data-scroll-region
            tabindex="0"
            :aria-busy="dataLoading || batchesLoading"
          >
            <template v-if="tab === 'batches' || tab === 'history'">
              <CollectionBatches
                :batches="tab === 'history' ? historyBatches : activeBatches"
                :history="tab === 'history'"
                :disabled="!connected"
                :busy="busy"
                :thumbnail-url="api.thumbnailUrl"
                @import="importBatch"
                @preview="openBatchImages"
                @clean="cleanBatch"
              />
              <div v-if="batches.length || batchesHasMore" class="collection-load-more">
                <span
                  >已显示 {{ tab === 'history' ? historyBatches.length : activeBatches.length }} /
                  {{ tab === 'history' ? batchCounts.history : batchCounts.active }} 个批次</span
                >
                <el-button
                  v-if="batchesHasMore"
                  :loading="batchesLoading"
                  :disabled="!connected"
                  @click="loadMoreBatches"
                  >加载更多批次</el-button
                >
              </div>
            </template>
            <template v-else-if="tab === 'files'">
              <div v-if="!files.length" class="collection-empty">
                <el-icon :size="34"><Picture /></el-icon>
                <h3>当前图源还没有本地素材</h3>
                <p>采集后可在这里预览图片，已有素材也可以整理为批次。</p>
              </div>
              <div v-else class="collection-gallery">
                <figure
                  v-for="file in files"
                  :key="file.sourceItemId"
                  class="collection-gallery__item"
                >
                  <el-image
                    :src="api.thumbnailUrl(fileIdentity(file))"
                    :preview-src-list="[api.imageUrl(fileIdentity(file))]"
                    preview-teleported
                    fit="cover"
                    loading="lazy"
                    :alt="file.title || file.filename"
                    ><template #error
                      ><div class="collection-gallery__missing">预览暂不可用</div></template
                    ></el-image
                  >
                  <figcaption>
                    <strong :title="file.title || file.filename">{{
                      file.title || file.filename
                    }}</strong
                    ><span
                      >{{ file.width }} × {{ file.height }} · {{ file.resolutionTier
                      }}<em>{{ file.uploadBatchId ? '已分批' : '待整理' }}</em></span
                    >
                  </figcaption>
                </figure>
              </div>
              <div v-if="files.length" class="collection-load-more">
                <span>已显示 {{ files.length }} / {{ filesTotal }} 张</span
                ><el-button v-if="hasMore" :loading="dataLoading" @click="loadFiles(true)"
                  >加载更多</el-button
                >
              </div>
            </template>
            <template v-else>
              <div v-if="!runs.length" class="collection-empty">
                <el-icon :size="34"><Clock /></el-icon>
                <h3>还没有下载记录</h3>
                <p>每次采集的结果会保存在这里。</p>
              </div>
              <div v-for="run in runs" :key="run.id" class="collection-run">
                <el-icon :size="22"><Download /></el-icon>
                <div>
                  <strong>{{ formatDate(run.startedAt) }}</strong>
                  <p>
                    {{ run.platform }} / {{ run.source }} · 新增 {{ run.stats?.downloaded || 0 }} 张
                    · 失败 {{ run.stats?.failed || 0 }} 张
                  </p>
                </div>
                <el-tag size="small" :type="run.status === 'failed' ? 'danger' : 'info'">{{
                  outcomeLabel(run.status || run.outcome)
                }}</el-tag>
              </div>
            </template>
          </div>
          <p class="collection-footer">
            <el-icon><InfoFilled /></el-icon
            >从本页导入后，保留的图片和元数据上传成功即自动清理整批；也可直接手动清理本地。
          </p>
        </section>
      </div>
      <BatchImagesDialog
        v-if="previewBatch"
        v-model="previewVisible"
        :batch="previewBatch"
        :collector-id="health.collectorId || ''"
        @updated="updatePreviewBatch"
      />
      <el-dialog
        v-model="batchDialog"
        title="整理本地图源为批次"
        width="440px"
        class="collection-batch-dialog"
      >
        <p class="collection-dialog-hint">
          从 {{ sourceLabel }} 中选取尚未分批的素材，原图保留在本机。
        </p>
        <el-form label-position="top" @submit.prevent="createBatch">
          <el-form-item label="批次名称（可选）"
            ><el-input v-model="batchForm.name" placeholder="留空自动命名" maxlength="100"
          /></el-form-item>
          <el-form-item label="设备类型"
            ><el-select v-model="batchForm.series" aria-label="批次设备类型"
              ><el-option label="电脑壁纸" value="desktop" /><el-option
                label="手机壁纸"
                value="mobile" /><el-option label="头像" value="avatar" /></el-select
          ></el-form-item>
          <el-form-item label="每批数量"
            ><el-segmented v-model="batchForm.size" :options="[10, 20, 30]"
          /></el-form-item>
          <el-form-item label="计划日期"
            ><el-date-picker
              v-model="batchForm.plannedDate"
              type="date"
              value-format="YYYY-MM-DD"
              :clearable="false"
          /></el-form-item>
        </el-form>
        <template #footer
          ><el-button @click="batchDialog = false">取消</el-button
          ><el-button type="primary" :loading="busy === 'create'" @click="createBatch"
            >生成批次</el-button
          ></template
        >
      </el-dialog>
    </div>
  </MainLayout>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Clock,
  Download,
  FolderAdd,
  FolderOpened,
  InfoFilled,
  Picture,
  Refresh,
  Setting,
  Warning
} from '@element-plus/icons-vue'
import MainLayout from '@/components/MainLayout.vue'
import { useAuthStore } from '@/stores/auth'
import { useAiConfigurationGuard } from '@/composables/useAiConfigurationGuard'
import { createCollectorApi } from './api'
import { flushCollectorReceipts } from './receipts'
import CollectionControls from './CollectionControls.vue'
import CollectionBatches from './CollectionBatches.vue'
import BatchImagesDialog from './BatchImagesDialog.vue'
import './collection.scss'

const api = createCollectorApi()
const router = useRouter()
const auth = useAuthStore()
const { requireAiConfiguration } = useAiConfigurationGuard()
const today = new Date().toLocaleDateString('sv-SE')
const form = reactive({
  platform: '',
  source: '',
  startPage: 1,
  pages: 3,
  limit: 0,
  series: ['desktop', 'mobile', 'avatar'],
  resolutions: ['8K', '5K+', '4K', '2K', '1080P', '低于1080P'],
  autoBatch: true,
  batchSize: 30,
  startDate: today
})
const batchForm = reactive({ name: '', series: 'desktop', size: 30, plannedDate: today })
const platforms = ref([])
const sources = ref([])
const health = ref({})
const status = ref({ running: false, stats: {}, logs: [], outcome: 'idle' })
const batches = ref([])
const batchesLoading = ref(false)
const batchesHasMore = ref(false)
const batchesNextOffset = ref(0)
const batchCounts = reactive({ active: 0, history: 0 })
const files = ref([])
const runs = ref([])
const filesTotal = ref(0)
const nextOffset = ref(0)
const hasMore = ref(false)
const connected = ref(false)
const connecting = ref(false)
const sourcesLoading = ref(false)
const dataLoading = ref(false)
const busy = ref('')
const error = ref('')
const receiptError = ref('')
const receiptsBusy = ref(false)
const tab = ref('batches')
const controlsVisible = ref(false)
const logsVisible = ref(false)
const batchDialog = ref(false)
const previewVisible = ref(false)
const previewBatch = ref(null)
let disposed = false
let pollTimer
let sourceSequence = 0
let fileSequence = 0
let runsSequence = 0
const activeStatuses = new Set(['ready', 'cleanup_failed', 'uploaded_cleanup_pending'])
const activeBatches = computed(() =>
  batches.value.filter(batch => activeStatuses.has(batch.status))
)
const historyBatches = computed(() =>
  batches.value.filter(batch => !activeStatuses.has(batch.status))
)
const sourceLabel = computed(
  () => sources.value.find(source => source.id === form.source)?.label || form.source || '当前图源'
)
const taskLabel = computed(() =>
  status.value.stopRequested && status.value.running
    ? '正在停止采集'
    : outcomeLabel(status.value.outcome)
)
const tabs = [
  { id: 'batches', label: '待上传批次' },
  { id: 'files', label: '本地图库' },
  { id: 'runs', label: '下载记录' },
  { id: 'history', label: '批次历史' }
]

function outcomeLabel(value) {
  return (
    {
      idle: '等待采集',
      running: '正在采集',
      completed: '采集完成',
      stopped: '采集已停止',
      failed: '采集失败'
    }[value] ||
    value ||
    '已结束'
  )
}
function formatDate(value) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '时间未记录'
}
function fileIdentity(file) {
  return {
    platform: file.platform || form.platform,
    source: file.source || form.source,
    itemId: file.sourceItemId
  }
}
function reportFailure(cause) {
  ElMessage.error(cause?.message || '操作失败，请重试')
}

async function loadBatches(append = false) {
  if (batchesLoading.value) return
  batchesLoading.value = true
  try {
    const target = append ? batches.value.length + 100 : Math.max(100, batches.value.length)
    const collected = append ? [...batches.value] : []
    let offset = append ? batchesNextOffset.value : 0
    let result
    do {
      result = await api.batches({ offset, limit: Math.min(200, target - collected.length) })
      if (disposed) return
      const page = result.batches || [
        ...(result.activeBatches || []),
        ...(result.historyBatches || [])
      ]
      collected.push(...page)
      const next = result.nextOffset ?? offset + page.length
      if (!page.length || next <= offset) break
      offset = next
    } while (result.hasMore && collected.length < target)
    batches.value = [...new Map(collected.map(batch => [batch.id, batch])).values()]
    if (previewVisible.value && previewBatch.value) {
      const live = batches.value.find(batch => batch.id === previewBatch.value.id)
      if (live) previewBatch.value = live
      else previewBatch.value = (await api.batch(previewBatch.value.id)).batch
    }
    batchesNextOffset.value = offset
    batchesHasMore.value = Boolean(result.hasMore)
    batchCounts.active = result.activeCount ?? activeBatches.value.length
    batchCounts.history = result.historyCount ?? historyBatches.value.length
  } finally {
    batchesLoading.value = false
  }
}
async function loadMoreBatches() {
  try {
    await loadBatches(true)
  } catch (cause) {
    reportFailure(cause)
  }
}
async function loadFiles(append = false) {
  if (!form.source) return
  const sequence = ++fileSequence
  dataLoading.value = true
  try {
    const result = await api.files({
      platform: form.platform,
      source: form.source,
      offset: append ? nextOffset.value : 0,
      limit: 24
    })
    if (disposed || sequence !== fileSequence) return
    files.value = append ? [...files.value, ...result.files] : result.files
    filesTotal.value = result.total
    nextOffset.value = result.nextOffset
    hasMore.value = result.hasMore
  } catch (cause) {
    if (!disposed && sequence === fileSequence) reportFailure(cause)
  } finally {
    if (sequence === fileSequence) dataLoading.value = false
  }
}
async function loadRuns() {
  if (!form.source) return
  const sequence = ++runsSequence
  try {
    const result = await api.runs({ platform: form.platform, source: form.source })
    if (!disposed && sequence === runsSequence) runs.value = result.runs || []
  } catch (cause) {
    if (!disposed && sequence === runsSequence) reportFailure(cause)
  }
}
async function selectTab(value) {
  tab.value = value
  if (!connected.value) return
  if (value === 'files') await loadFiles()
  if (value === 'runs') await loadRuns()
}
function navigateTabs(event, id) {
  const index = tabs.findIndex(item => item.id === id)
  const target =
    event.key === 'ArrowRight'
      ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft'
        ? (index + tabs.length - 1) % tabs.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? tabs.length - 1
            : -1
  if (target < 0) return
  event.preventDefault()
  selectTab(tabs[target].id)
  document.getElementById(`collection-tab-${tabs[target].id}`)?.focus()
}
function resetSourceData() {
  fileSequence++
  runsSequence++
  files.value = []
  runs.value = []
  hasMore.value = false
  filesTotal.value = 0
  dataLoading.value = false
}
async function updateForm({ key, value }) {
  form[key] = value
  if (key === 'source') {
    resetSourceData()
    await selectTab(tab.value)
  }
}
async function changePlatform(value) {
  const sequence = ++sourceSequence
  form.platform = value
  form.source = ''
  sources.value = []
  resetSourceData()
  sourcesLoading.value = true
  try {
    const result = await api.sources(value)
    if (disposed || sequence !== sourceSequence) return
    sources.value = result.sources || []
    form.source = sources.value[0]?.id || ''
    await selectTab(tab.value)
  } catch (cause) {
    if (!disposed && sequence === sourceSequence) reportFailure(cause)
  } finally {
    if (sequence === sourceSequence) sourcesLoading.value = false
  }
}
async function connect() {
  if (connecting.value) return
  clearTimeout(pollTimer)
  connecting.value = true
  error.value = ''
  try {
    const [healthResult, platformResult, statusResult] = await Promise.all([
      api.health(),
      api.platforms(),
      api.status()
    ])
    if (disposed) return
    health.value = healthResult
    platforms.value = platformResult.platforms || []
    status.value = statusResult
    connected.value = true
    await loadBatches()
    if (!form.platform && platforms.value.length) await changePlatform(platforms.value[0].id)
    else if (form.platform && !sources.value.length) await changePlatform(form.platform)
    await retryReceipts(false)
    await selectTab(tab.value)
  } catch (cause) {
    connected.value = false
    error.value = cause?.message || '无法连接本机采集服务，请检查本地服务配置后重试。'
  } finally {
    connecting.value = false
    schedulePoll()
  }
}
function schedulePoll() {
  clearTimeout(pollTimer)
  if (!disposed && connected.value) pollTimer = setTimeout(poll, 3000)
}
async function poll() {
  try {
    const previousRunning = status.value.running
    const result = await api.status()
    if (disposed) return
    status.value = result
    await loadBatches()
    if (previousRunning && !result.running) {
      if (result.outcome === 'failed') ElMessage.error('采集失败，请查看日志')
      else
        ElMessage.success(
          result.outcome === 'stopped' ? '采集已停止，已下载素材保留' : '采集完成，批次已刷新'
        )
      await selectTab(tab.value)
    }
  } catch (cause) {
    if (!disposed) {
      connected.value = false
      error.value = cause?.message || '本机采集服务连接中断，请重新连接。'
    }
  } finally {
    schedulePoll()
  }
}
async function perform(key, operation, message) {
  if (busy.value) return
  busy.value = key
  try {
    await operation()
    if (message) ElMessage.success(message)
    await loadBatches()
  } catch (cause) {
    reportFailure(cause)
  } finally {
    busy.value = ''
  }
}
async function startCollection() {
  if (
    !form.series.length ||
    !form.resolutions.length ||
    !form.startPage ||
    !form.pages ||
    form.limit == null ||
    (form.autoBatch && !form.startDate)
  ) {
    ElMessage.warning('请完整填写页数、设备、清晰度及分批日期')
    return
  }
  await perform(
    'start',
    async () => {
      await api.start({
        platform: form.platform,
        source: form.source,
        startPage: form.startPage,
        pages: form.pages,
        limit: form.limit,
        series: [...form.series],
        resolutions: [...form.resolutions],
        autoBatch: { enabled: form.autoBatch, size: form.batchSize, startDate: form.startDate }
      })
      status.value = await api.status()
      controlsVisible.value = false
    },
    '采集已开始'
  )
}
async function stopCollection() {
  await perform(
    'stop',
    async () => {
      await api.stop()
      status.value = await api.status()
    },
    '已请求停止采集'
  )
}
async function createBatch() {
  await perform(
    'create',
    async () => {
      await api.createBatch({ platform: form.platform, source: form.source, ...batchForm })
      batchDialog.value = false
      tab.value = 'batches'
    },
    '批次已生成，可送到图片上传'
  )
}
function openBatchImages(batch) {
  previewBatch.value = batch
  previewVisible.value = true
}
async function updatePreviewBatch(batch) {
  previewBatch.value = batch
  batches.value = batches.value.map(item => (item.id === batch.id ? batch : item))
  try {
    await loadBatches()
  } catch (cause) {
    reportFailure(cause)
  }
}
async function importBatch(batch) {
  if (requireAiConfiguration())
    await router.push({ path: '/upload', query: { localBatch: batch.id } })
}
async function cleanBatch(batch) {
  try {
    await ElMessageBox.confirm(
      `将删除批次「${batch.name || batch.id}」的全部 ${batch.count ?? batch.items?.length ?? 0} 张本地原图和批次硬链接，包括未上传及从上传列表移除的图片。源记录与上传关联会保留。请确认本批素材已不需要留在本地。`,
      '确认清理整个批次？',
      {
        confirmButtonText: '确认清理本批',
        cancelButtonText: '保留本地文件',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
        closeOnClickModal: false
      }
    )
  } catch {
    return
  }
  await perform(
    `clean:${batch.id}`,
    () => api.clean({ batchId: batch.id, confirmed: true }),
    '本地整批清理完成，源记录已保留'
  )
}
async function retryReceipts(manual = false) {
  if (receiptsBusy.value) return
  receiptsBusy.value = true
  try {
    const result = await flushCollectorReceipts({ token: auth.token })
    receiptError.value = result.errors?.length
      ? `上传已保存，但有 ${result.pending || result.errors.length} 条上传记录尚未同步：${result.errors[0]}`
      : result.pending
        ? `还有 ${result.pending} 条上传记录待同步，请确认当前 GitHub 登录及本机采集目录与上传时一致。`
        : ''
    if (manual && !receiptError.value)
      ElMessage.success(
        result.synced ? `已同步 ${result.synced} 条上传记录` : '没有待同步的上传记录'
      )
    if (manual && receiptError.value) ElMessage.warning('上传状态尚未同步，本地文件继续保留')
    await loadBatches()
  } catch (cause) {
    receiptError.value = cause?.message || '上传状态同步失败，请重试；本地文件继续保留。'
  } finally {
    receiptsBusy.value = false
  }
}
onMounted(connect)
onBeforeUnmount(() => {
  disposed = true
  clearTimeout(pollTimer)
  sourceSequence++
  fileSequence++
  runsSequence++
})
</script>
