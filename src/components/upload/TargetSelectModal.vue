<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="visible"
        class="target-modal__overlay"
        :style="{ zIndex }"
        @click.self="$emit('close')"
      >
        <div class="target-modal">
          <div class="target-modal__header">
            <h3 class="target-modal__title">📁 选择目标目录</h3>
            <button class="target-modal__close" @click="$emit('close')">
              <el-icon><Close /></el-icon>
            </button>
          </div>

          <div class="target-modal__body">
            <!-- 文件预览 -->
            <div v-if="file" class="target-modal__preview">
              <img :src="file.preview" class="target-modal__preview-img" />
              <span class="target-modal__preview-name">{{ file.name }}</span>
            </div>

            <!-- 系列选择 -->
            <div class="target-modal__section">
              <label class="target-modal__label">系列</label>
              <div class="target-modal__series">
                <button
                  v-for="s in seriesOptions"
                  :key="s.value"
                  class="target-modal__series-btn"
                  :class="{ 'target-modal__series-btn--active': selectedSeries === s.value }"
                  @click="selectSeries(s.value)"
                >
                  {{ s.icon }} {{ s.label }}
                </button>
              </div>
            </div>

            <!-- 分类树 -->
            <div class="target-modal__section">
              <label class="target-modal__label">分类</label>
              <div class="target-modal__tree">
                <el-tree
                  ref="treeRef"
                  :data="localTreeData"
                  :props="{
                    label: 'name',
                    children: 'children',
                    isLeaf: node => node.type === 'l2'
                  }"
                  :load="handleLoadNode"
                  lazy
                  highlight-current
                  @node-click="handleNodeClick"
                />
              </div>
            </div>

            <!-- 当前选择 -->
            <div class="target-modal__current">
              <span class="target-modal__current-label">目标路径：</span>
              <span
                class="target-modal__current-path"
                :class="{ 'target-modal__current-path--empty': !currentPath }"
              >
                {{ currentPath || '请选择分类' }}
              </span>
            </div>
          </div>

          <div class="target-modal__footer">
            <button class="target-modal__btn target-modal__btn--cancel" @click="$emit('close')">
              取消
            </button>
            <button
              class="target-modal__btn target-modal__btn--confirm"
              :disabled="!selectedL1"
              @click="handleConfirm"
            >
              确定
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Close } from '@element-plus/icons-vue'
import { useUploadWorkspaceInfrastructure } from '@/features/upload-workspace/composables/use-upload-workspace-infrastructure'
import { useModalZIndex } from '@/composables/useModalZIndex'

const props = defineProps({
  visible: { type: Boolean, default: false },
  file: { type: Object, default: null },
  currentSeries: { type: String, default: 'desktop' }
})

const emit = defineEmits(['close', 'confirm'])
const zIndex = useModalZIndex(() => props.visible)

const uploadWorkspace = useUploadWorkspaceInfrastructure()
const treeRef = ref(null)

const seriesOptions = [
  { value: 'desktop', label: '桌面', icon: '🖥️' },
  { value: 'mobile', label: '手机', icon: '📱' },
  { value: 'avatar', label: '头像', icon: '👤' }
]

const selectedSeries = ref('desktop')
const selectedL1 = ref('')
const selectedL2 = ref('')
const localTreeData = ref([])

const currentPath = computed(() => {
  if (!selectedL1.value) return ''
  const parts = ['wallpaper', selectedSeries.value, selectedL1.value]
  if (selectedL2.value) parts.push(selectedL2.value)
  return parts.join('/')
})

// 监听弹窗打开，初始化状态
watch(
  () => props.visible,
  val => {
    if (val && props.file) {
      selectedSeries.value = props.file.targetSeries || props.currentSeries
      selectedL1.value = props.file.targetL1 || ''
      selectedL2.value = props.file.targetL2 || ''
      loadRootCategories()
    }
  }
)

async function loadRootCategories() {
  try {
    localTreeData.value = await uploadWorkspace.loadRootCategories(selectedSeries.value)
  } catch {
    localTreeData.value = []
  }
}

function selectSeries(s) {
  selectedSeries.value = s
  selectedL1.value = ''
  selectedL2.value = ''
  loadRootCategories()
}

async function handleLoadNode(node, resolve) {
  if (node.level === 0) {
    resolve(localTreeData.value)
    return
  }
  if (node.data.type !== 'l1') {
    resolve([])
    return
  }

  try {
    resolve(await uploadWorkspace.loadChildCategories(node.data.path))
  } catch {
    resolve([])
  }
}

function handleNodeClick(data, node) {
  if (data.type === 'l1') {
    selectedL1.value = data.name
    selectedL2.value = ''
  } else {
    selectedL1.value = node.parent.data.name
    selectedL2.value = data.name
  }
}

function handleConfirm() {
  emit('confirm', {
    series: selectedSeries.value,
    l1: selectedL1.value,
    l2: selectedL2.value
  })
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.target-modal {
  width: 90%;
  max-width: 480px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, rgba(30, 30, 50, 0.95), rgba(20, 20, 40, 0.98));
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: $radius-2xl;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
  overflow: hidden;

  &__overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: $spacing-4 $spacing-5;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  &__title {
    font-size: $font-size-lg;
    font-weight: 600;
    color: $white;
    margin: 0;
  }

  &__close {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.05);
    border: none;
    border-radius: $radius-md;
    color: $gray-400;
    cursor: pointer;
    transition: all $duration-normal;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      color: $white;
    }
  }

  &__body {
    flex: 1;
    padding: $spacing-4 $spacing-5;
    overflow-y: auto;
  }

  &__preview {
    display: flex;
    align-items: center;
    gap: $spacing-3;
    padding: $spacing-3;
    background: rgba(255, 255, 255, 0.03);
    border-radius: $radius-lg;
    margin-bottom: $spacing-4;

    &-img {
      width: 48px;
      height: 48px;
      object-fit: cover;
      border-radius: $radius-md;
    }

    &-name {
      flex: 1;
      font-size: $font-size-sm;
      color: $gray-300;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  &__section {
    margin-bottom: $spacing-4;
  }

  &__label {
    display: block;
    font-size: $font-size-sm;
    color: $gray-400;
    margin-bottom: $spacing-2;
  }

  &__series {
    display: flex;
    gap: $spacing-2;

    &-btn {
      flex: 1;
      padding: $spacing-2 $spacing-3;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: $radius-md;
      color: $gray-300;
      font-size: $font-size-sm;
      cursor: pointer;
      transition: all $duration-normal;

      &:hover {
        background: rgba(255, 255, 255, 0.1);
      }

      &--active {
        background: rgba($primary-start, 0.2);
        border-color: $primary-start;
        color: $white;
      }
    }
  }

  &__tree {
    max-height: 200px;
    overflow-y: auto;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: $radius-lg;
    padding: $spacing-2;

    :deep(.el-tree) {
      background: transparent;
      color: $gray-300;

      .el-tree-node__content {
        &:hover {
          background: rgba(255, 255, 255, 0.05);
        }
      }

      .el-tree-node.is-current > .el-tree-node__content {
        background: rgba($primary-start, 0.2);
      }
    }
  }

  &__current {
    display: flex;
    align-items: center;
    gap: $spacing-2;
    padding: $spacing-3;
    background: rgba($success, 0.1);
    border: 1px solid rgba($success, 0.3);
    border-radius: $radius-lg;

    &-label {
      font-size: $font-size-sm;
      color: $gray-400;
    }

    &-path {
      flex: 1;
      font-size: $font-size-sm;
      font-family: monospace;
      color: $success;

      &--empty {
        color: $warning;
      }
    }
  }

  &__footer {
    display: flex;
    justify-content: flex-end;
    gap: $spacing-3;
    padding: $spacing-4 $spacing-5;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  &__btn {
    padding: $spacing-2 $spacing-5;
    border: none;
    border-radius: $radius-lg;
    font-size: $font-size-sm;
    font-weight: 500;
    cursor: pointer;
    transition: all $duration-normal;

    &--cancel {
      background: rgba(255, 255, 255, 0.1);
      color: $gray-300;

      &:hover {
        background: rgba(255, 255, 255, 0.15);
      }
    }

    &--confirm {
      background: $primary-gradient;
      color: $white;

      &:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba($primary-start, 0.4);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
  }
}

// 动画
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;

  .target-modal {
    transition: transform 0.2s ease;
  }
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;

  .target-modal {
    transform: scale(0.95) translateY(10px);
  }
}
</style>
