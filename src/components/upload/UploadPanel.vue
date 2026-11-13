<template>
  <div class="upload-panel">
    <UploadHeader
      :current-series="currentSeries"
      :ai-analyzing="aiAnalyzing"
      :ai-analyzing-count="aiAnalyzingCount"
      :files-count="files.length"
      :error-count="errorCount"
      :uploading="uploading"
      :progress="progress"
      :can-upload="canUpload"
      :metadata-status="metadataStatus"
      @series-change="$emit('series-change', $event)"
      @retry-metadata="$emit('retry-metadata')"
      @retry="$emit('retry')"
      @clear="handleClear"
      @upload="$emit('upload')"
    />

    <div class="upload-panel__main">
      <UploadDropzone
        :disabled="uploading"
        :compact="files.length > 0"
        :uploading="uploading"
        :can-upload="props.canUpload"
        :text="dropzoneText"
        @add-files="handleAddFiles"
      />

      <AITaskCenter v-if="files.length > 0" />

      <div class="upload-panel__files">
        <UploadFileGrid
          ref="fileGridRef"
          :files="files"
          :selected-id="selectedId"
          :uploading="uploading"
          @select="$emit('select', $event)"
          @remove="$emit('remove', $event)"
          @change-target="$emit('change-target', $event)"
          @batch-delete="handleBatchDelete"
          @apply-all-ai="$emit('apply-all-ai')"
          @edit-ai="$emit('edit-ai', $event)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useCredentialsStore } from '@/stores/credentials'
import UploadHeader from './UploadPanel/UploadHeader.vue'
import UploadDropzone from './UploadPanel/UploadDropzone.vue'
import UploadFileGrid from './UploadPanel/UploadFileGrid.vue'
import AITaskCenter from './AITaskCenter.vue'

const credentialsStore = useCredentialsStore()

const props = defineProps({
  files: { type: Array, default: () => [] },
  selectedId: { type: String, default: null },
  uploading: { type: Boolean, default: false },
  progress: { type: Number, default: 0 },
  errorCount: { type: Number, default: 0 },
  currentSeries: { type: String, default: 'desktop' },
  aiAnalyzing: { type: Boolean, default: false },
  aiAnalyzingCount: { type: Number, default: 0 },
  metadataStatus: { type: String, default: 'idle' },
  canUpload: { type: Boolean, default: true }
})

const emit = defineEmits([
  'add-files',
  'remove',
  'remove-batch',
  'clear',
  'retry',
  'upload',
  'select',
  'change-target',
  'series-change',
  'retry-metadata',
  'apply-all-ai',
  'edit-ai'
])

const fileGridRef = ref(null)

const dropzoneText = computed(() =>
  credentialsStore.hasCredentials
    ? '拖拽多张图片到此处，AI 将逐张分析并推荐分类'
    : '先配置 API Key，再添加图片进行 AI 分析'
)

function preventDefaultDrag(e) {
  e.preventDefault()
}

onMounted(() => {
  document.addEventListener('dragover', preventDefaultDrag)
  document.addEventListener('drop', preventDefaultDrag)
})

onUnmounted(() => {
  document.removeEventListener('dragover', preventDefaultDrag)
  document.removeEventListener('drop', preventDefaultDrag)
})

function handleAddFiles(files) {
  if (!props.canUpload) return
  emit('add-files', files)
}

async function handleBatchDelete(ids) {
  try {
    await ElMessageBox.confirm(`确定要删除选中的 ${ids.length} 个文件吗？`, '确认删除', {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    emit('remove-batch', ids)
    fileGridRef.value?.clearSelection()
  } catch {
    return
  }
}

async function handleClear() {
  try {
    await ElMessageBox.confirm(`确定要删除全部 ${props.files.length} 个文件吗？`, '确认删除', {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    emit('clear')
    fileGridRef.value?.clearSelection()
  } catch {
    return
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.upload-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  min-height: 540px;

  &__files {
    display: flex;
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  &__files > :deep(.studio-panel-leave-active) {
    position: absolute;
    inset: 0;
  }

  &__main {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--studio-surface);
    border: 1px solid var(--studio-border);
    border-radius: 16px;
    padding: $spacing-4;
    overflow: hidden;
    min-height: 0;
    height: 100%;
  }
}
</style>
