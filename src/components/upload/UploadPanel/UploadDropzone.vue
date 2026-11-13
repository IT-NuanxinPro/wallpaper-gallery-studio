<template>
  <div class="upload-dropzone">
    <input
      ref="fileInputRef"
      type="file"
      multiple
      accept="image/jpeg,image/png,image/webp"
      class="upload-dropzone__input"
      @change="handleFileSelect"
    />
    <input
      ref="folderInputRef"
      type="file"
      webkitdirectory
      class="upload-dropzone__input"
      @change="handleFolderSelect"
    />

    <div
      class="upload-dropzone__area"
      :class="{
        'upload-dropzone__area--active': isDragging,
        'upload-dropzone__area--disabled': disabled,
        'upload-dropzone__area--compact': compact
      }"
      @dragenter.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @dragover.prevent
      @drop.prevent="handleDrop"
    >
      <div class="upload-dropzone__content">
        <el-icon class="upload-dropzone__icon"
          ><Lock v-if="!canUpload || disabled" /><Upload v-else
        /></el-icon>
        <span class="upload-dropzone__text">{{ text }}</span>
        <div v-if="canUpload" class="upload-dropzone__btns">
          <button
            class="upload-dropzone__btn"
            :disabled="uploading || disabled"
            @click="triggerInput"
          >
            <el-icon><Picture /></el-icon>选择图片
          </button>
          <button
            class="upload-dropzone__btn"
            :disabled="uploading || disabled"
            @click="triggerFolderInput"
          >
            <el-icon><FolderOpened /></el-icon>选择文件夹
          </button>
        </div>
        <div v-else-if="!canUpload" class="upload-dropzone__no-permission">
          需要协作者或管理员权限
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Upload, Picture, FolderOpened, Lock } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useAiConfigurationGuard } from '@/composables/useAiConfigurationGuard'

const { requireAiConfiguration } = useAiConfigurationGuard()

const props = defineProps({
  disabled: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  uploading: { type: Boolean, default: false },
  text: { type: String, default: '拖拽图片或文件夹到此处' },
  canUpload: { type: Boolean, default: true }
})

const emit = defineEmits(['add-files'])

const fileInputRef = ref(null)
const folderInputRef = ref(null)
const isDragging = ref(false)

function canSelectFiles() {
  if (!props.canUpload || props.uploading || props.disabled) return false
  return requireAiConfiguration()
}

function triggerInput() {
  if (canSelectFiles()) fileInputRef.value?.click()
}

function triggerFolderInput() {
  if (canSelectFiles()) folderInputRef.value?.click()
}

async function readEntriesRecursively(entry) {
  const files = []

  if (entry.isFile) {
    const file = await new Promise(resolve => entry.file(resolve))
    if (file.type.startsWith('image/')) files.push(file)
  } else if (entry.isDirectory) {
    const reader = entry.createReader()
    const entries = await new Promise(resolve => reader.readEntries(resolve))
    for (const subEntry of entries) {
      const subFiles = await readEntriesRecursively(subEntry)
      files.push(...subFiles)
    }
  }

  return files
}

function showSelectedMessage(count) {
  ElMessage({
    message: `已加入 ${count} 张图片，AI 将在任务中心逐张处理`,
    type: 'success',
    duration: 3000
  })
}

async function handleDrop(e) {
  isDragging.value = false

  if (!canSelectFiles()) return

  const items = e.dataTransfer.items
  const allFiles = []
  const entries = []

  for (const item of items) {
    if (item.webkitGetAsEntry) {
      const entry = item.webkitGetAsEntry()
      if (entry) entries.push(entry)
    }
  }

  if (entries.length > 0) {
    const loadingMsg = ElMessage({
      message: '正在读取文件夹...',
      type: 'info',
      duration: 0
    })

    try {
      for (const entry of entries) {
        const files = await readEntriesRecursively(entry)
        allFiles.push(...files)
      }

      loadingMsg.close()
      const imageFiles = allFiles.filter(f => f.type.startsWith('image/'))

      if (imageFiles.length === 0) {
        ElMessage.warning('文件夹中没有找到图片文件')
        return
      }

      showSelectedMessage(imageFiles.length)
      emit('add-files', imageFiles)
    } catch (error) {
      loadingMsg.close()
      ElMessage.error('读取文件夹失败')
      console.error('读取文件夹错误:', error)
    }
  } else {
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (files.length > 0) {
      showSelectedMessage(files.length)
      emit('add-files', files)
    }
  }
}

function handleFileSelect(e) {
  if (!canSelectFiles()) {
    e.target.value = ''
    return
  }
  const files = Array.from(e.target.files)
  if (files.length > 0) {
    showSelectedMessage(files.length)
    emit('add-files', files)
  }
  e.target.value = ''
}

function handleFolderSelect(e) {
  if (!canSelectFiles()) {
    e.target.value = ''
    return
  }
  const allFiles = Array.from(e.target.files)
  const files = allFiles.filter(f => f.type.startsWith('image/'))

  if (files.length === 0) {
    ElMessage.warning('文件夹中没有找到图片文件')
    e.target.value = ''
    return
  }

  if (files.length > 0) {
    showSelectedMessage(files.length)
    emit('add-files', files)
  }
  e.target.value = ''
}
</script>

<style scoped lang="scss">
.upload-dropzone__input {
  display: none;
}
.upload-dropzone__area {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 160px;
  padding: 24px 18px;
  border: 1px dashed var(--studio-border);
  border-radius: 14px;
  background: transparent;
  transition:
    background-color 0.18s,
    border-color 0.18s;
}
.upload-dropzone__area:hover:not(.upload-dropzone__area--disabled),
.upload-dropzone__area--active {
  border-color: var(--studio-accent);
  background: var(--studio-raised);
}
.upload-dropzone__area--disabled {
  opacity: 0.5;
}
.upload-dropzone__area--compact {
  min-height: 86px;
  padding: 14px;
}
.upload-dropzone__content {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 14px;
  width: 100%;
}
.upload-dropzone__icon {
  font-size: 22px;
  color: var(--studio-muted);
  flex-shrink: 0;
}
.upload-dropzone__text {
  color: var(--studio-muted);
  font-size: 12px;
  line-height: 1.7;
  text-align: center;
}
.upload-dropzone__btns {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
.upload-dropzone__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 14px;
  background: var(--studio-raised);
  border: 1px solid var(--studio-border);
  border-radius: 999px;
  color: var(--studio-text);
  font-size: 12px;
  cursor: pointer;
}
.upload-dropzone__btn:hover {
  border-color: var(--studio-accent);
}
.upload-dropzone__btn:focus-visible {
  outline: 2px solid var(--studio-accent);
  outline-offset: 3px;
}
.upload-dropzone__no-permission {
  color: var(--studio-muted);
  font-size: 12px;
}
@media (max-width: 640px) {
  .upload-dropzone__content {
    flex-direction: column;
  }
}
@media (prefers-reduced-motion: reduce) {
  .upload-dropzone__area {
    transition: none;
  }
}
</style>
