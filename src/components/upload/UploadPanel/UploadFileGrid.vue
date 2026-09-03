<template>
  <div v-if="files.length > 0" class="upload-file-grid">
    <!-- 批量操作栏 -->
    <div v-if="!uploading" class="upload-file-grid__batch">
      <div class="upload-file-grid__batch-left">
        <el-checkbox
          :model-value="selectAll"
          :indeterminate="isIndeterminate"
          :disabled="pendingFiles.length === 0"
          @update:model-value="handleSelectAll"
        >
          全选
        </el-checkbox>

        <!-- 文件数量提示 -->
        <span class="upload-file-grid__count">
          {{ files.length }} 张图片
          <template v-if="pendingFiles.length !== files.length">
            （{{ pendingFiles.length }} 待上传）
          </template>
        </span>
      </div>

      <div class="upload-file-grid__batch-right">
        <Transition name="fade">
          <button
            v-if="selectedIds.length > 0"
            class="upload-file-grid__batch-delete"
            @click="$emit('batch-delete', selectedIds)"
          >
            <el-icon><Delete /></el-icon>
            删除选中 ({{ selectedIds.length }})
          </button>
        </Transition>

        <!-- AI 模式：批量应用 AI 推荐 -->
        <Transition name="fade">
          <button
            v-if="uploadMode === 'ai' && filesWithAiButNoTarget > 0"
            class="upload-file-grid__batch-apply"
            @click="$emit('apply-all-ai')"
          >
            <span>🤖</span>
            应用全部 AI 推荐 ({{ filesWithAiButNoTarget }})
          </button>
        </Transition>
      </div>
    </div>

    <!-- 图片网格 -->
    <div class="upload-file-grid__grid">
      <TransitionGroup name="grid">
        <UploadFileItem
          v-for="file in files"
          :key="file.id"
          :file="file"
          :is-selected="selectedId === file.id"
          :is-checked="selectedIds.includes(file.id)"
          :uploading="uploading"
          :upload-mode="uploadMode"
          @select="$emit('select', file)"
          @remove="$emit('remove', $event)"
          @change-target="$emit('change-target', file)"
          @toggle-check="toggleCheck"
          @edit-ai="$emit('edit-ai', file)"
        />
      </TransitionGroup>
    </div>
  </div>

  <!-- 空状态 -->
  <div v-else class="upload-file-grid__empty">
    <span class="upload-file-grid__empty-icon">🖼️</span>
    <p>暂无待上传文件</p>
    <p class="upload-file-grid__empty-hint">支持 JPG、PNG、WebP，单个最大 25MB</p>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Delete } from '@element-plus/icons-vue'
import UploadFileItem from './UploadFileItem.vue'

const props = defineProps({
  files: { type: Array, default: () => [] },
  selectedId: { type: String, default: null },
  uploading: { type: Boolean, default: false },
  uploadMode: { type: String, default: 'ai' }
})

defineEmits(['select', 'remove', 'change-target', 'batch-delete', 'apply-all-ai', 'edit-ai'])

const selectedIds = ref([])

// 待处理文件
const pendingFiles = computed(() =>
  props.files.filter(f => f.status === 'pending' || f.status === 'error')
)

// AI 模式下有 AI 数据但未设置目标路径的文件数
const filesWithAiButNoTarget = computed(
  () => props.files.filter(f => f.status === 'pending' && f.aiMetadata && !f.targetPath).length
)

// 全选状态
const selectAll = computed(
  () => pendingFiles.value.length > 0 && selectedIds.value.length === pendingFiles.value.length
)

// 半选状态
const isIndeterminate = computed(
  () => selectedIds.value.length > 0 && selectedIds.value.length < pendingFiles.value.length
)

// 文件列表变化时清理已删除的选中项
watch(
  () => props.files,
  files => {
    const ids = files.map(f => f.id)
    selectedIds.value = selectedIds.value.filter(id => ids.includes(id))
  },
  { deep: true }
)

// 全选/取消全选
function handleSelectAll(val) {
  if (val) {
    selectedIds.value = pendingFiles.value.map(f => f.id)
  } else {
    selectedIds.value = []
  }
}

// 切换单个文件的选中状态
function toggleCheck(fileId) {
  const index = selectedIds.value.indexOf(fileId)
  if (index > -1) {
    selectedIds.value.splice(index, 1)
  } else {
    selectedIds.value.push(fileId)
  }
}

// 暴露方法供父组件调用
defineExpose({
  clearSelection: () => {
    selectedIds.value = []
  }
})
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.upload-file-grid {
  flex: 1;
  margin-top: $spacing-2;
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;

  &__batch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $spacing-2;
    min-height: 36px;
    margin-bottom: $spacing-2;
    padding: 0 2px $spacing-2;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    flex-wrap: wrap;

    &-left,
    &-right {
      display: flex;
      align-items: center;
      gap: $spacing-2;
    }

    :deep(.el-checkbox__label) {
      color: $gray-400;
      font-size: $font-size-sm;
    }

    &-delete {
      display: flex;
      align-items: center;
      gap: $spacing-1;
      padding: $spacing-1 $spacing-3;
      background: rgba($danger, 0.1);
      border: 1px solid rgba($danger, 0.3);
      border-radius: $radius-md;
      color: $danger;
      font-size: $font-size-xs;
      cursor: pointer;
      transition: all $duration-normal;

      &:hover {
        background: rgba($danger, 0.2);
      }

      .el-icon {
        font-size: 12px;
      }
    }

    &-apply {
      display: flex;
      align-items: center;
      gap: $spacing-1;
      padding: $spacing-1 $spacing-3;
      background: rgba($primary-start, 0.1);
      border: 1px solid rgba($primary-start, 0.3);
      border-radius: $radius-md;
      color: $primary-start;
      font-size: $font-size-xs;
      cursor: pointer;
      transition: all $duration-normal;

      &:hover {
        background: rgba($primary-start, 0.2);
      }

      span {
        font-size: 12px;
      }
    }
  }

  &__count {
    font-size: $font-size-xs;
    color: $gray-500;
    padding: $spacing-1 $spacing-2;
    background: rgba(255, 255, 255, 0.05);
    border-radius: $radius-sm;
  }

  &__grid {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-auto-rows: 94px;
    gap: $spacing-3;
    overflow-y: auto;
    padding-right: $spacing-2;
    padding-bottom: $spacing-4;
    align-content: start;
    align-items: start;
    justify-items: stretch;
    min-height: 0;
    scrollbar-gutter: stable;

    @media (min-width: 1760px) {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    &::-webkit-scrollbar {
      width: 6px;
    }

    &::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 3px;

      &:hover {
        background: rgba(255, 255, 255, 0.25);
      }
    }

    &::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 3px;
    }
  }

  &__empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: $gray-500;
    min-height: 0;

    &-icon {
      font-size: 48px;
      opacity: 0.3;
      margin-bottom: $spacing-3;
    }

    p {
      margin: 0;
      font-size: $font-size-sm;
    }

    &-hint {
      margin-top: $spacing-2 !important;
      font-size: $font-size-xs !important;
      color: $gray-600;
    }
  }
}

@media (max-width: 720px) {
  .upload-file-grid__grid {
    grid-template-columns: 1fr;
  }
}

// 过渡动画
.grid-enter-active {
  transition: opacity $duration-normal $ease-out;
}

.grid-leave-active {
  transition: opacity $duration-fast $ease-out;
}

.grid-enter-from {
  opacity: 0;
}

.grid-leave-to {
  opacity: 0;
}

.grid-move {
  transition: transform $duration-normal $ease-out;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity $duration-normal;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
