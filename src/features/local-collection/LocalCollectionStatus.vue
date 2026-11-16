<template>
  <el-collapse-transition>
    <section
      v-if="batchId || localFiles.length"
      v-show="!dismissed"
      class="local-import"
      aria-label="本地批次导入"
    >
      <div class="local-import__summary">
        <el-icon><FolderOpened /></el-icon>
        <div>
          <strong>{{ title }}</strong>
          <p v-if="!collapsed">{{ message }}</p>
        </div>
        <el-button
          v-if="!collapsed && !importing && batchId"
          size="small"
          :disabled="upload.uploading"
          @click="importBatch"
        >
          {{ importError ? '重试导入' : '补充未导入图片' }}
        </el-button>
        <el-button
          v-if="upload.localReceiptStatus === 'pending'"
          size="small"
          :loading="syncing"
          @click="syncReceipts"
          >重试回传</el-button
        >
        <router-link v-if="!collapsed" to="/local-collection">查看批次</router-link>
        <span v-if="collapsed" class="local-import__count">{{ localFiles.length }} 张</span>
        <el-button
          text
          circle
          :icon="collapsed ? ArrowDown : ArrowUp"
          :aria-label="collapsed ? '展开导入提示' : '收起导入提示'"
          :aria-expanded="!collapsed"
          @click="collapsed = !collapsed"
        />
        <el-button text circle :icon="Close" aria-label="关闭导入提示" @click="dismissed = true" />
      </div>
      <el-progress
        v-if="importing && progress.total"
        :percentage="Math.round(((progress.current - 1) / progress.total) * 100)"
        :show-text="false"
        :stroke-width="3"
      />
      <p v-if="importError || upload.localReceiptError" class="local-import__error" role="alert">
        {{ importError || upload.localReceiptError }}
      </p>
    </section>
  </el-collapse-transition>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { FolderOpened, Close, ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import { useUploadStore } from '@/stores/upload'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useCredentialsStore } from '@/stores/credentials'
import { useAiConfigurationGuard } from '@/composables/useAiConfigurationGuard'
import { importCollectorBatch } from './importer'
import { flushCollectorReceipts } from './receipts'

const emit = defineEmits(['series'])
const route = useRoute()
const upload = useUploadStore()
const auth = useAuthStore()
const config = useConfigStore()
const credentials = useCredentialsStore()
const { requireAiConfiguration } = useAiConfigurationGuard()
const batchId = computed(() =>
  typeof route.query.localBatch === 'string' ? route.query.localBatch : ''
)
const localFiles = computed(() => upload.files.filter(file => file.localSource))
const importing = ref(false)
const dismissed = ref(false)
const collapsed = ref(false)
const syncing = ref(false)
const importError = ref('')
const progress = ref({})
let controller
let importingPromise
const title = computed(() => (importing.value ? '正在导入本地批次' : '来自本地素材采集'))
const message = computed(() => {
  if (importing.value)
    return `${progress.value.current || 0} / ${progress.value.total || 0} · ${progress.value.filename || '读取批次'}`
  if (upload.localReceiptStatus === 'pending') return '批次处理结果正在同步，本地文件暂时保留。'
  if (upload.localReceiptStatus === 'verified')
    return '批次处理结果已同步，可在素材采集中查看清理状态。'
  return `已导入 ${localFiles.value.length} 张。从列表移除会删除对应本地图片；剩余图片上传成功后自动清理本批。`
})
function importBatch() {
  if (importingPromise) return importingPromise
  importingPromise = performImport().finally(() => {
    importingPromise = null
  })
  return importingPromise
}
async function performImport() {
  if (importing.value || !batchId.value) return
  if (!auth.permissionChecked) return
  if (!auth.canUpload) {
    importError.value = '当前账号没有上传权限'
    return
  }
  if (!requireAiConfiguration()) return
  if (upload.uploading) {
    importError.value = '请等待当前上传完成后导入'
    return
  }
  importing.value = true
  dismissed.value = false
  importError.value = ''
  controller = new globalThis.AbortController()
  const repository = JSON.stringify([config.config.owner, config.config.repo, config.config.branch])
  const token = auth.token
  try {
    const result = await importCollectorBatch(batchId.value, {
      upload,
      repository: {
        owner: config.config.owner,
        repo: config.config.repo,
        branch: config.config.branch
      },
      signal: controller.signal,
      assertCurrent: () => {
        if (
          token !== auth.token ||
          repository !==
            JSON.stringify([config.config.owner, config.config.repo, config.config.branch])
        )
          throw new Error('仓库或登录状态已变更，导入已停止')
      },
      onProgress: value => {
        progress.value = value
      }
    })
    emit('series', upload.series)
    collapsed.value = true
    ElMessage.success(
      `已导入 ${result.added} 张，跳过 ${result.skipped} 张已导入、已上传或已移除图片`
    )
  } catch (error) {
    if (error.name !== 'AbortError') importError.value = error.message
  } finally {
    importing.value = false
  }
}
async function syncReceipts() {
  syncing.value = true
  try {
    const result = await flushCollectorReceipts({ token: auth.token })
    upload.localReceiptStatus = result.pending ? 'pending' : 'verified'
    upload.localReceiptError = result.errors.join('；')
  } catch (error) {
    upload.localReceiptError = error.message
  } finally {
    syncing.value = false
  }
}
watch(
  batchId,
  async (id, previous, onCleanup) => {
    dismissed.value = false
    collapsed.value = false
    let current = true
    onCleanup(() => {
      current = false
      controller?.abort()
    })
    if (importingPromise) await importingPromise
    if (current && id) importBatch()
  },
  { immediate: true }
)
watch(
  () => [auth.permissionChecked, credentials.hasModelReady],
  ([checked, ready]) => {
    if (checked && ready && batchId.value) importBatch()
  }
)
watch(
  () => importError.value || upload.localReceiptError,
  value => {
    if (value) {
      dismissed.value = false
      collapsed.value = false
    }
  }
)
onBeforeUnmount(() => controller?.abort())
</script>
<style scoped lang="scss">
.local-import {
  flex: none;
  padding: 12px 16px;
  border: 1px solid var(--studio-border);
  border-radius: 16px;
  background: rgba(125, 183, 255, 0.07);
  margin-bottom: 14px;
  &__summary {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  &__summary > div {
    flex: 1;
    min-width: 180px;
  }
  strong {
    font-size: 12px;
    color: var(--studio-text);
    font-weight: 550;
  }
  p {
    font-size: 11px;
    color: var(--studio-muted);
    margin: 5px 0 0;
    line-height: 1.5;
  }
  a {
    color: var(--studio-accent);
    font-size: 12px;
    text-decoration: none;
  }
  &__count {
    font-size: 12px;
    color: var(--studio-muted);
  }
  &__error {
    color: #e6b5a8 !important;
  }
  :deep(.el-progress) {
    margin-top: 10px;
  }
  :deep(.el-button + .el-button) {
    margin-left: 0;
  }
}
</style>
