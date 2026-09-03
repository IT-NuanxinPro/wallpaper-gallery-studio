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
        <span class="upload-dropzone__icon">{{ compact ? '＋' : icon }}</span>
        <span class="upload-dropzone__text">{{ compact ? '添加更多图片或文件夹' : text }}</span>
        <div v-if="canAddFiles && !uploading && canUpload" class="upload-dropzone__btns">
          <button class="upload-dropzone__btn" @click="triggerInput">🖼️ 选择图片</button>
          <button class="upload-dropzone__btn" @click="triggerFolderInput">📂 选择文件夹</button>
        </div>
        <div v-else-if="!canUpload" class="upload-dropzone__no-permission">
          🔒 需要协作者或管理员权限
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { readDroppedImageEntries } from '@/utils/readDroppedImageEntries'

const props = defineProps({
  disabled: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  uploading: { type: Boolean, default: false },
  canAddFiles: { type: Boolean, default: true },
  uploadMode: { type: String, default: 'ai' },
  aiConfig: { type: Object, default: null },
  icon: { type: String, default: '📁' },
  text: { type: String, default: '拖拽图片或文件夹到此处' },
  canUpload: { type: Boolean, default: true }
})

const emit = defineEmits(['add-files'])

const fileInputRef = ref(null)
const folderInputRef = ref(null)
const isDragging = ref(false)

function validateBatchLimit() {
  // AI 模式现在使用持久化任务队列，允许一次选择多张图片。
  return true
}

function triggerInput() {
  if (!props.canUpload) {
    ElMessage.error('🔒 您没有上传权限')
    return
  }
  if (!props.canAddFiles) {
    ElMessage.warning('请先选择上传分类')
    return
  }
  if (!props.uploading) fileInputRef.value?.click()
}

function triggerFolderInput() {
  if (!props.canUpload) {
    ElMessage.error('🔒 您没有上传权限')
    return
  }
  if (!props.canAddFiles) {
    ElMessage.warning('请先选择上传分类')
    return
  }
  if (!props.uploading) folderInputRef.value?.click()
}

function showSelectedMessage(count) {
  ElMessage({
    message:
      props.uploadMode === 'ai'
        ? `📂 已加入 ${count} 张图片，AI 将在任务中心逐张处理`
        : `📂 已加入 ${count} 张图片`,
    type: 'success',
    duration: 3000
  })
}

async function handleDrop(e) {
  isDragging.value = false

  if (!props.canUpload) {
    ElMessage.error('🔒 您没有上传权限')
    return
  }
  if (!props.canAddFiles) {
    ElMessage.warning('请先选择上传分类')
    return
  }
  if (props.uploading) return

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
      message: '📂 正在读取文件夹...',
      type: 'info',
      duration: 0
    })

    try {
      for (const entry of entries) {
        const files = await readDroppedImageEntries(entry)
        allFiles.push(...files)
      }

      loadingMsg.close()
      const imageFiles = allFiles.filter(f => f.type.startsWith('image/'))

      if (imageFiles.length === 0) {
        ElMessage.warning('文件夹中没有找到图片文件')
        return
      }

      if (!validateBatchLimit(imageFiles)) return
      showSelectedMessage(imageFiles.length)
      emit('add-files', imageFiles)
    } catch (error) {
      loadingMsg.close()
      ElMessage.error('读取文件夹失败')
      console.error('读取文件夹错误:', error)
    }
  } else {
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (files.length > 0 && validateBatchLimit(files)) {
      showSelectedMessage(files.length)
      emit('add-files', files)
    }
  }
}

function handleFileSelect(e) {
  const files = Array.from(e.target.files)
  if (files.length > 0 && validateBatchLimit(files)) {
    showSelectedMessage(files.length)
    emit('add-files', files)
  }
  e.target.value = ''
}

function handleFolderSelect(e) {
  const allFiles = Array.from(e.target.files)
  const files = allFiles.filter(f => f.type.startsWith('image/'))

  if (files.length === 0) {
    ElMessage.warning('文件夹中没有找到图片文件')
    e.target.value = ''
    return
  }

  if (validateBatchLimit(files)) {
    showSelectedMessage(files.length)
    emit('add-files', files)
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
      min-height: 48px;
      padding: 6px $spacing-3;

      .upload-dropzone__icon {
        display: grid;
        place-items: center;
        width: 24px;
        height: 24px;
        border-radius: 8px;
        background: rgba($primary-start, 0.14);
        color: $primary-start;
      }

      .upload-dropzone__text {
        color: $gray-200;
        font-weight: 600;
      }

      .upload-dropzone__btn {
        padding: 5px $spacing-3;
        font-size: 11px;
      }
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

  &__no-permission {
    color: rgba(255, 255, 255, 0.5);
    font-size: $font-size-sm;
    padding: $spacing-2 $spacing-4;
  }
}
</style>
