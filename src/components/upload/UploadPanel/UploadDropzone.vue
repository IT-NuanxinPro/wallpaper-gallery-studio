<template>
  <div class="upload-dropzone">
    <!-- 隐藏的文件输入 -->
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

    <!-- 拖拽区域 -->
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
        <span class="upload-dropzone__icon">{{ icon }}</span>
        <span class="upload-dropzone__text">{{ text }}</span>
        <div v-if="canAddFiles && !uploading" class="upload-dropzone__btns">
          <button class="upload-dropzone__btn" @click="triggerInput">🖼️ 选择图片</button>
          <button class="upload-dropzone__btn" @click="triggerFolderInput">📂 选择文件夹</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  disabled: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  uploading: { type: Boolean, default: false },
  canAddFiles: { type: Boolean, default: true },
  icon: { type: String, default: '📁' },
  text: { type: String, default: '拖拽图片或文件夹到此处' }
})

const emit = defineEmits(['add-files'])

const fileInputRef = ref(null)
const folderInputRef = ref(null)
const isDragging = ref(false)

// 触发文件选择
function triggerInput() {
  if (!props.canAddFiles) {
    ElMessage.warning('请先选择上传分类')
    return
  }
  if (!props.uploading) fileInputRef.value?.click()
}

// 触发文件夹选择
function triggerFolderInput() {
  if (!props.canAddFiles) {
    ElMessage.warning('请先选择上传分类')
    return
  }
  if (!props.uploading) folderInputRef.value?.click()
}

// 递归读取文件夹中的文件
async function readEntriesRecursively(entry) {
  const files = []

  if (entry.isFile) {
    const file = await new Promise(resolve => entry.file(resolve))
    if (file.type.startsWith('image/')) {
      files.push(file)
    }
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

// 处理拖拽（支持文件夹）
async function handleDrop(e) {
  isDragging.value = false
  if (!props.canAddFiles) {
    ElMessage.warning('请先选择上传分类')
    return
  }
  if (props.uploading) return

  const items = e.dataTransfer.items
  const allFiles = []

  // 检查是否有文件夹
  const entries = []
  for (const item of items) {
    if (item.webkitGetAsEntry) {
      const entry = item.webkitGetAsEntry()
      if (entry) entries.push(entry)
    }
  }

  if (entries.length > 0) {
    // 使用 Entry API 递归读取
    for (const entry of entries) {
      const files = await readEntriesRecursively(entry)
      allFiles.push(...files)
    }
  } else {
    // 降级：直接使用 files
    allFiles.push(...Array.from(e.dataTransfer.files))
  }

  if (allFiles.length > 0) {
    emit('add-files', allFiles)
  }
}

// 处理文件选择
function handleFileSelect(e) {
  emit('add-files', Array.from(e.target.files))
  e.target.value = ''
}

// 处理文件夹选择
function handleFolderSelect(e) {
  const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'))
  if (files.length > 0) {
    emit('add-files', files)
  } else {
    ElMessage.warning('文件夹中没有找到图片文件')
  }
  e.target.value = ''
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.upload-dropzone {
  &__input {
    display: none;
  }

  &__area {
    padding: $spacing-6 $spacing-4;
    border: 2px dashed rgba(255, 255, 255, 0.2);
    border-radius: $radius-lg;
    transition: all $duration-normal;
    flex-shrink: 0;
    min-height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover:not(&--disabled) {
      border-color: rgba($primary-start, 0.5);
      background: rgba($primary-start, 0.05);
    }

    &--active {
      border-color: $primary-start;
      background: rgba($primary-start, 0.1);
    }

    &--disabled {
      opacity: 0.5;
    }

    &--compact {
      padding: $spacing-3 $spacing-4;
      min-height: 80px;
    }
  }

  &__content {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: $spacing-3;
    flex-wrap: wrap;
  }

  &__icon {
    font-size: 18px;
  }

  &__text {
    color: $gray-300;
    font-size: $font-size-sm;
  }

  &__btns {
    display: flex;
    gap: $spacing-2;
  }

  &__btn {
    padding: $spacing-2 $spacing-4;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: $radius-md;
    color: $gray-300;
    font-size: $font-size-sm;
    cursor: pointer;
    transition: all $duration-normal;

    &:hover {
      background: rgba($primary-start, 0.15);
      border-color: rgba($primary-start, 0.4);
      color: $white;
    }
  }
}
</style>
