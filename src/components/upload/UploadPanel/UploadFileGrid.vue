<template>
  <Transition name="studio-panel">
    <div v-if="files.length > 0" key="files" class="upload-file-grid">
      <div v-if="!uploading" class="upload-file-grid__batch">
        <div class="upload-file-grid__batch-left">
          <el-checkbox
            :model-value="selectAll"
            :indeterminate="isIndeterminate"
            :disabled="pendingFiles.length === 0"
            @update:model-value="handleSelectAll"
          >
            全选（用于批量删除）
          </el-checkbox>

          <span class="upload-file-grid__count">
            共 {{ files.length }} 个文件
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

          <Transition name="fade">
            <button
              v-if="filesWithAiButNoTarget > 0"
              class="upload-file-grid__batch-apply"
              @click="$emit('apply-all-ai')"
            >
              <el-icon><Cpu /></el-icon>
              应用全部 AI 推荐 ({{ filesWithAiButNoTarget }})
            </button>
          </Transition>
        </div>
      </div>

      <div class="upload-file-grid__grid" data-scroll-region>
        <TransitionGroup
          name="studio-list"
          @before-leave="lockLeavingItem"
          @after-leave="releaseLeavingItem"
          @leave-cancelled="releaseLeavingItem"
        >
          <UploadFileItem
            v-for="file in files"
            :key="file.id"
            :file="file"
            :is-selected="selectedId === file.id"
            :is-checked="selectedIds.includes(file.id)"
            :uploading="uploading"
            @select="$emit('select', file)"
            @remove="$emit('remove', $event)"
            @change-target="$emit('change-target', file)"
            @toggle-check="toggleCheck"
            @edit-ai="$emit('edit-ai', file)"
          />
        </TransitionGroup>
      </div>
    </div>

    <div v-else key="empty" class="upload-file-grid__empty">
      <el-icon class="upload-file-grid__empty-icon"><Picture /></el-icon>
      <p>暂无待上传文件</p>
      <p class="upload-file-grid__empty-hint">支持 JPG、PNG、WebP，单个最大 25MB</p>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Delete, Cpu, Picture } from '@element-plus/icons-vue'
import UploadFileItem from './UploadFileItem.vue'

const props = defineProps({
  files: { type: Array, default: () => [] },
  selectedId: { type: String, default: null },
  uploading: { type: Boolean, default: false }
})

defineEmits(['select', 'remove', 'change-target', 'batch-delete', 'apply-all-ai', 'edit-ai'])

const selectedIds = ref([])
const leavingItemStyles = new WeakMap()
const leavingStyleProperties = ['position', 'left', 'top', 'width', 'height', 'right']

function lockLeavingItem(element) {
  const previous = Object.fromEntries(
    leavingStyleProperties.map(name => [name, element.style[name]])
  )
  const geometry = {
    left: element.offsetLeft,
    top: element.offsetTop,
    width: element.offsetWidth,
    height: element.offsetHeight
  }
  leavingItemStyles.set(element, previous)
  Object.assign(element.style, {
    position: 'absolute',
    left: `${geometry.left}px`,
    top: `${geometry.top}px`,
    width: `${geometry.width}px`,
    height: `${geometry.height}px`,
    right: 'auto'
  })
}

function releaseLeavingItem(element) {
  const previous = leavingItemStyles.get(element)
  if (!previous) return
  Object.assign(element.style, previous)
  leavingItemStyles.delete(element)
}

const pendingFiles = computed(() =>
  props.files.filter(f => f.status === 'pending' || f.status === 'error')
)

const filesWithAiButNoTarget = computed(
  () => props.files.filter(f => f.status === 'pending' && f.aiMetadata && !f.targetPath).length
)

const selectAll = computed(
  () => pendingFiles.value.length > 0 && selectedIds.value.length === pendingFiles.value.length
)

const isIndeterminate = computed(
  () => selectedIds.value.length > 0 && selectedIds.value.length < pendingFiles.value.length
)

watch(
  () => props.files,
  files => {
    const ids = files.map(f => f.id)
    selectedIds.value = selectedIds.value.filter(id => ids.includes(id))
  },
  { deep: true }
)

function handleSelectAll(val) {
  if (val) {
    selectedIds.value = pendingFiles.value.map(f => f.id)
  } else {
    selectedIds.value = []
  }
}

function toggleCheck(fileId) {
  const index = selectedIds.value.indexOf(fileId)
  if (index > -1) {
    selectedIds.value.splice(index, 1)
  } else {
    selectedIds.value.push(fileId)
  }
}

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
  margin-top: $spacing-3;
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;

  &__batch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $spacing-3;
    margin-bottom: $spacing-3;
    padding-bottom: $spacing-2;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    flex-wrap: wrap;

    &-left,
    &-right {
      display: flex;
      align-items: center;
      gap: $spacing-3;
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
    position: relative;
    --upload-grid-item-size: 144px;

    flex: 1;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--upload-grid-item-size), 1fr));
    grid-auto-rows: var(--upload-grid-item-size);
    gap: $spacing-5;
    overflow-y: auto;
    padding-right: $spacing-2;
    padding-bottom: $spacing-4;
    align-content: start;
    align-items: start;
    justify-items: stretch;
    min-height: 0;
    scrollbar-gutter: stable;

    @media (min-width: 1400px) {
      --upload-grid-item-size: 156px;
    }

    @media (min-width: 1600px) {
      --upload-grid-item-size: 168px;
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
      color: var(--studio-muted);
    }
  }
}

.upload-file-grid__grid :deep(.studio-list-enter-active),
.upload-file-grid__grid :deep(.studio-list-leave-active),
.upload-file-grid__grid :deep(.studio-list-move) {
  transition:
    opacity 220ms var(--studio-ease-out),
    transform 240ms var(--studio-ease-out);
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity $duration-normal;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.upload-file-grid__empty-icon {
  color: var(--studio-muted);
  font-size: 36px;
}
.upload-file-grid__empty p {
  color: var(--studio-muted);
  font-size: 13px;
}
.upload-file-grid__empty .upload-file-grid__empty-hint {
  font-size: 11px;
}
@media (prefers-reduced-motion: reduce) {
  .upload-file-grid__grid :deep(.studio-list-enter-active),
  .upload-file-grid__grid :deep(.studio-list-leave-active),
  .upload-file-grid__grid :deep(.studio-list-move),
  .fade-enter-active,
  .fade-leave-active {
    transition: none;
  }
}
</style>
