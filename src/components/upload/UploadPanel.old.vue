<template>
  <div class="upload-panel">
    <!-- 顶部：模式切换 + 路径/系列 + 操作按钮 -->
    <div class="upload-panel__header">
      <!-- 模式切换 -->
      <div class="upload-panel__mode-switch">
        <button
          class="upload-panel__mode-btn"
          :class="{ 'upload-panel__mode-btn--active': uploadMode === 'ai' }"
          :disabled="isSwitching"
          @click="handleModeChange('ai')"
        >
          <span class="upload-panel__mode-icon">🤖</span>
          <span>AI 智能</span>
        </button>
        <button
          class="upload-panel__mode-btn"
          :class="{ 'upload-panel__mode-btn--active': uploadMode === 'manual' }"
          :disabled="isSwitching"
          @click="handleModeChange('manual')"
        >
          <span class="upload-panel__mode-icon">📁</span>
          <span>手动选择</span>
        </button>
      </div>

      <!-- 使用 Transition 包裹内容区域 -->
      <Transition name="mode-fade" mode="out-in">
        <!-- AI 模式：显示系列选择 + AI 配置 -->
        <div v-if="uploadMode === 'ai'" key="ai" class="upload-panel__ai-config">
          <div class="upload-panel__series">
            <span class="upload-panel__series-label">系列:</span>
            <div class="upload-panel__series-btns">
              <button
                v-for="s in seriesOptions"
                :key="s.value"
                class="upload-panel__series-btn"
                :class="{ 'upload-panel__series-btn--active': currentSeries === s.value }"
                @click="$emit('series-change', s.value)"
              >
                <span>{{ s.icon }}</span>
                <span>{{ s.label }}</span>
              </button>
            </div>
          </div>

          <!-- AI Provider/Model 显示 -->
          <div class="upload-panel__ai-info">
            <el-popover
              placement="bottom"
              :width="280"
              trigger="click"
              popper-class="upload-panel__ai-popover"
            >
              <template #reference>
                <button class="upload-panel__ai-btn" :disabled="aiAnalyzing">
                  <span class="upload-panel__ai-btn-icon">{{
                    aiConfig?.providerIcon || '🤖'
                  }}</span>
                  <span class="upload-panel__ai-btn-text">{{
                    aiConfig?.modelName || 'AI 模型'
                  }}</span>
                  <span v-if="aiAnalyzing" class="upload-panel__ai-btn-loading">⏳</span>
                  <span v-else class="upload-panel__ai-btn-arrow">▼</span>
                </button>
              </template>

              <!-- AI 配置弹出层 -->
              <div class="upload-panel__ai-dropdown">
                <div class="upload-panel__ai-dropdown-section">
                  <div class="upload-panel__ai-dropdown-label">AI 服务商</div>
                  <div class="upload-panel__ai-dropdown-options">
                    <button
                      v-for="p in availableProviders"
                      :key="p.key"
                      class="upload-panel__ai-dropdown-option"
                      :class="{
                        'upload-panel__ai-dropdown-option--active': aiConfig?.provider === p.key
                      }"
                      @click="$emit('provider-change', p.key)"
                    >
                      <span>{{ p.icon }}</span>
                      <span>{{ p.name }}</span>
                      <span class="upload-panel__ai-dropdown-source">{{ p.source }}</span>
                    </button>
                  </div>
                </div>

                <div class="upload-panel__ai-dropdown-section">
                  <div class="upload-panel__ai-dropdown-label">模型</div>
                  <div class="upload-panel__ai-dropdown-options">
                    <button
                      v-for="m in aiConfig?.availableModels || []"
                      :key="m.key"
                      class="upload-panel__ai-dropdown-option"
                      :class="{
                        'upload-panel__ai-dropdown-option--active': aiConfig?.modelKey === m.key
                      }"
                      @click="$emit('model-change', m.key)"
                    >
                      <span>{{ m.name }}</span>
                      <span v-if="m.recommended" class="upload-panel__ai-dropdown-badge">推荐</span>
                    </button>
                  </div>
                </div>
              </div>
            </el-popover>

            <!-- 分析状态 -->
            <span v-if="aiAnalyzing" class="upload-panel__ai-status">
              分析中 ({{ aiAnalyzingCount }})
            </span>
          </div>
        </div>

        <!-- 手动模式：显示完整路径 -->
        <div
          v-else
          key="manual"
          class="upload-panel__path"
          :class="{ 'upload-panel__path--empty': !targetPath }"
        >
          <el-icon v-if="targetPath"><FolderOpened /></el-icon>
          <el-icon v-else><Warning /></el-icon>
          <span>{{ targetPath || '请先选择分类' }}</span>
        </div>
      </Transition>

      <div class="upload-panel__actions">
        <Transition name="fade">
          <div v-if="files.length > 0" class="upload-panel__stats">
            <span class="upload-panel__count">
              <el-icon><Picture /></el-icon>
              {{ files.length }}
            </span>
            <Transition name="fade">
              <span v-if="errorCount > 0" class="upload-panel__error" @click="$emit('retry')">
                {{ errorCount }} 失败
              </span>
            </Transition>
            <button v-if="!uploading" class="upload-panel__btn-clear" @click="handleClear">
              <el-icon><Delete /></el-icon>
            </button>
          </div>
        </Transition>
        <button
          v-if="authStore.canUpload"
          class="upload-panel__btn-upload"
          :disabled="!canUpload"
          @click="$emit('upload')"
        >
          <el-icon v-if="uploading" class="is-loading"><Loading /></el-icon>
          <el-icon v-else><Upload /></el-icon>
          <span v-if="uploading">{{ progress }}%</span>
          <span v-else>上传</span>
        </button>
      </div>
    </div>

    <!-- 主内容区：撑满 -->
    <div class="upload-panel__main">
      <!-- 隐藏的文件输入 -->
      <input
        ref="fileInputRef"
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        class="upload-panel__input"
        @change="handleFileSelect"
      />
      <input
        ref="folderInputRef"
        type="file"
        webkitdirectory
        class="upload-panel__input"
        @change="handleFolderSelect"
      />

      <!-- 拖拽区域 -->
      <div
        class="upload-panel__dropzone"
        :class="{
          'upload-panel__dropzone--active': isDragging,
          'upload-panel__dropzone--disabled': dropzoneDisabled,
          'upload-panel__dropzone--compact': files.length > 0
        }"
        @dragenter.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @dragover.prevent
        @drop.prevent="handleDrop"
      >
        <div class="upload-panel__dropzone-content">
          <span class="upload-panel__dropzone-icon">{{ dropzoneIcon }}</span>
          <span class="upload-panel__dropzone-text">
            {{ dropzoneText }}
          </span>
          <div v-if="canAddFiles && !uploading" class="upload-panel__dropzone-btns">
            <button class="upload-panel__add-btn" @click="triggerInput">🖼️ 选择图片</button>
            <button class="upload-panel__add-btn" @click="triggerFolderInput">📂 选择文件夹</button>
          </div>
        </div>
      </div>

      <!-- 文件网格 -->
      <div v-if="files.length > 0" class="upload-panel__files">
        <!-- 批量操作栏 -->
        <div v-if="!uploading" class="upload-panel__batch">
          <el-checkbox
            v-model="selectAll"
            :indeterminate="isIndeterminate"
            :disabled="pendingFiles.length === 0"
            @change="handleSelectAll"
          >
            全选（用于批量删除）
          </el-checkbox>
          <Transition name="fade">
            <button
              v-if="selectedIds.length > 0"
              class="upload-panel__batch-delete"
              @click="handleBatchDelete"
            >
              <el-icon><Delete /></el-icon>
              删除选中 ({{ selectedIds.length }})
            </button>
          </Transition>
          <!-- AI 模式：批量应用 AI 推荐 -->
          <Transition name="fade">
            <button
              v-if="uploadMode === 'ai' && filesWithAiButNoTarget > 0"
              class="upload-panel__batch-apply"
              @click="$emit('apply-all-ai')"
            >
              <span>🤖</span>
              应用全部 AI 推荐 ({{ filesWithAiButNoTarget }})
            </button>
          </Transition>
        </div>

        <!-- 图片网格 -->
        <div class="upload-panel__grid">
          <TransitionGroup name="grid">
            <el-tooltip
              v-for="file in files"
              :key="file.id"
              placement="top"
              :disabled="!file.aiMetadata"
              popper-class="upload-panel__ai-tooltip"
            >
              <template #content>
                <div class="ai-tooltip-content">
                  <div v-if="getAiFilename(file)" class="ai-tooltip-section">
                    <span class="ai-tooltip-label">🤖 AI 文件名</span>
                    <span class="ai-tooltip-value">{{ getAiFilename(file) }}</span>
                  </div>
                  <div class="ai-tooltip-section">
                    <span class="ai-tooltip-label">📁 推荐分类</span>
                    <span class="ai-tooltip-value">{{ getAiCategory(file) }}</span>
                  </div>
                  <div v-if="file.aiMetadata?.description" class="ai-tooltip-section">
                    <span class="ai-tooltip-label">📝 描述</span>
                    <span class="ai-tooltip-value">{{ file.aiMetadata.description }}</span>
                  </div>
                  <div v-if="getAiKeywords(file).length > 0" class="ai-tooltip-section">
                    <span class="ai-tooltip-label">🏷️ 关键词</span>
                    <div class="ai-tooltip-tags">
                      <span v-for="tag in getAiKeywords(file)" :key="tag" class="ai-tooltip-tag">
                        {{ tag }}
                      </span>
                    </div>
                  </div>
                </div>
              </template>

              <div
                class="upload-panel__item"
                :class="[
                  `upload-panel__item--${file.status}`,
                  { 'upload-panel__item--selected': selectedId === file.id },
                  { 'upload-panel__item--checked': selectedIds.includes(file.id) }
                ]"
                @click="$emit('select', file)"
              >
                <!-- 复选框 -->
                <el-checkbox
                  v-if="(file.status === 'pending' || file.status === 'error') && !uploading"
                  v-model="selectedIds"
                  :value="file.id"
                  class="upload-panel__item-checkbox"
                  @click.stop
                />
                <img :src="file.preview" class="upload-panel__item-img" draggable="false" />
                <div v-if="file.status === 'uploading'" class="upload-panel__item-overlay">
                  <el-progress
                    type="circle"
                    :percentage="file.progress"
                    :width="36"
                    :stroke-width="3"
                  />
                </div>
                <span
                  v-else-if="file.status === 'success'"
                  class="upload-panel__item-badge upload-panel__item-badge--success"
                  >✓</span
                >
                <span
                  v-else-if="file.status === 'error'"
                  class="upload-panel__item-badge upload-panel__item-badge--error"
                  >!</span
                >
                <button
                  v-if="file.status === 'pending' || file.status === 'error'"
                  class="upload-panel__item-remove"
                  @click.stop="$emit('remove', file.id)"
                >
                  ×
                </button>
                <!-- 目标路径标签 -->
                <div
                  v-if="file.status === 'pending' && file.targetPath"
                  class="upload-panel__item-path"
                  :class="[
                    `upload-panel__item-path--${file.targetSeries}`,
                    { 'upload-panel__item-path--ai': file.aiMetadata && uploadMode === 'ai' }
                  ]"
                  :title="file.targetPath"
                  @click.stop="$emit('change-target', file)"
                >
                  <span class="upload-panel__item-path-icon">{{
                    getSeriesIcon(file.targetSeries)
                  }}</span>
                  <span class="upload-panel__item-path-text">{{
                    getShortPath(file.targetPath)
                  }}</span>
                  <span
                    v-if="file.aiMetadata && uploadMode === 'ai'"
                    class="upload-panel__item-path-ai"
                    >🤖</span
                  >
                </div>
                <!-- AI 模式下：等待分类的文件 -->
                <div
                  v-else-if="file.status === 'pending' && uploadMode === 'ai' && !file.targetPath"
                  class="upload-panel__item-path upload-panel__item-path--waiting"
                  :title="file.aiMetadata ? 'AI 分析完成，点击确认分类' : '等待 AI 分析'"
                  @click.stop="$emit('change-target', file)"
                >
                  <span v-if="file.aiMetadata" class="upload-panel__item-path-icon">🤖</span>
                  <span
                    v-else
                    class="upload-panel__item-path-icon upload-panel__item-path-icon--loading"
                    >⏳</span
                  >
                  <span class="upload-panel__item-path-text">{{
                    file.aiMetadata ? '点击确认' : '分析中...'
                  }}</span>
                </div>
              </div>
            </el-tooltip>
          </TransitionGroup>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="upload-panel__empty">
        <span class="upload-panel__empty-icon">🖼️</span>
        <p>暂无待上传文件</p>
        <p class="upload-panel__empty-hint">支持 JPG、PNG、WebP，单个最大 25MB</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { FolderOpened, Warning, Picture, Delete, Upload, Loading } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

// 系列选项
const seriesOptions = [
  { value: 'desktop', label: '电脑', icon: '🖥️' },
  { value: 'mobile', label: '手机', icon: '📱' },
  { value: 'avatar', label: '头像', icon: '👤' }
]

const props = defineProps({
  targetPath: { type: String, default: '' },
  files: { type: Array, default: () => [] },
  selectedId: { type: String, default: null },
  uploading: { type: Boolean, default: false },
  progress: { type: Number, default: 0 },
  pendingCount: { type: Number, default: 0 },
  errorCount: { type: Number, default: 0 },
  // 上传模式
  uploadMode: { type: String, default: 'ai' }, // 'ai' | 'manual'
  currentSeries: { type: String, default: 'desktop' },
  // AI 配置
  aiConfig: { type: Object, default: null },
  aiAnalyzing: { type: Boolean, default: false },
  aiAnalyzingCount: { type: Number, default: 0 },
  availableProviders: { type: Array, default: () => [] }
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
  'mode-change',
  'series-change',
  'apply-all-ai',
  // AI 配置事件
  'provider-change',
  'model-change'
])

const fileInputRef = ref(null)
const folderInputRef = ref(null)
const isDragging = ref(false)
const selectedIds = ref([])
const isSwitching = ref(false)

// 全选相关
const pendingFiles = computed(() =>
  props.files.filter(f => f.status === 'pending' || f.status === 'error')
)
const hasFilesWithoutTarget = computed(() => pendingFiles.value.some(f => !f.targetPath))

// AI 模式相关计算属性
const filesWithAiButNoTarget = computed(
  () => props.files.filter(f => f.status === 'pending' && f.aiMetadata && !f.targetPath).length
)

// 是否可以添加文件
const canAddFiles = computed(() => {
  if (props.uploadMode === 'ai') {
    return true // AI 模式始终可以添加
  }
  return !!props.targetPath // 手动模式需要选择路径
})

// 拖拽区域是否禁用
const dropzoneDisabled = computed(() => {
  if (props.uploading) return true
  if (props.uploadMode === 'ai') return false
  return !props.targetPath
})

// 拖拽区域图标
const dropzoneIcon = computed(() => {
  if (props.uploadMode === 'ai') return '🤖'
  return props.targetPath ? '📁' : '🔒'
})

// 拖拽区域文本
const dropzoneText = computed(() => {
  if (props.uploadMode === 'ai') {
    return '拖拽图片到此处，AI 将自动分类'
  }
  return props.targetPath ? '拖拽图片或文件夹到此处' : '请先选择分类'
})

// 是否可以上传
const canUpload = computed(() => {
  if (props.uploading) return false
  if (props.pendingCount === 0) return false

  // AI 模式：需要所有文件都已设置 targetPath（通过应用 AI 推荐或手动设置）
  // 手动模式：需要所有文件都有 targetPath
  if (props.uploadMode === 'ai') {
    // AI 模式下，检查是否所有待上传文件都已经有目标路径
    return !hasFilesWithoutTarget.value
  }

  // 手动模式：需要选择分类且所有文件有 targetPath
  return !hasFilesWithoutTarget.value
})

const selectAll = computed({
  get: () =>
    pendingFiles.value.length > 0 && selectedIds.value.length === pendingFiles.value.length,
  set: () => {}
})
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

// 处理模式切换
async function handleModeChange(mode) {
  if (isSwitching.value || props.uploadMode === mode) return

  isSwitching.value = true
  emit('mode-change', mode)

  // 等待动画完成
  await new Promise(resolve => setTimeout(resolve, 400))
  isSwitching.value = false
}

// 全局阻止拖拽默认行为（防止在新标签页打开图片）
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

function triggerInput() {
  if (!canAddFiles.value) {
    ElMessage.warning('请先选择上传分类')
    return
  }
  if (!props.uploading) fileInputRef.value?.click()
}

function triggerFolderInput() {
  if (!canAddFiles.value) {
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
  if (!canAddFiles.value) {
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

function handleFileSelect(e) {
  emit('add-files', Array.from(e.target.files))
  e.target.value = ''
}

function handleFolderSelect(e) {
  const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'))
  if (files.length > 0) {
    emit('add-files', files)
  } else {
    ElMessage.warning('文件夹中没有找到图片文件')
  }
  e.target.value = ''
}

// 全选/取消全选
function handleSelectAll(val) {
  if (val) {
    selectedIds.value = pendingFiles.value.map(f => f.id)
  } else {
    selectedIds.value = []
  }
}

// 批量删除
async function handleBatchDelete() {
  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selectedIds.value.length} 个文件吗？`,
      '确认删除',
      {
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    emit('remove-batch', [...selectedIds.value])
    selectedIds.value = []
  } catch {
    // 取消
  }
}

// 全部删除确认
async function handleClear() {
  try {
    await ElMessageBox.confirm(`确定要删除全部 ${props.files.length} 个文件吗？`, '确认删除', {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    emit('clear')
    selectedIds.value = []
  } catch {
    // 取消
  }
}

// 获取简短路径显示
function getShortPath(path) {
  if (!path) return ''
  // wallpaper/avatar/人像/卡通简笔画 -> 卡通简笔画
  const parts = path.split('/')
  return parts[parts.length - 1] || parts[parts.length - 2] || path
}

// 获取系列图标
function getSeriesIcon(series) {
  const icons = {
    desktop: '🖥️',
    mobile: '📱',
    avatar: '👤'
  }
  return icons[series] || '📁'
}

// 获取 AI 推荐的文件名
function getAiFilename(file) {
  if (!file.aiMetadata) return ''

  // 支持多种字段名
  if (file.aiMetadata.suggestedFilename) {
    return file.aiMetadata.suggestedFilename
  }

  // filenameSuggestions 是数组，取第一个
  if (file.aiMetadata.filenameSuggestions && file.aiMetadata.filenameSuggestions.length > 0) {
    return file.aiMetadata.filenameSuggestions[0]
  }

  // display_title 作为备选
  if (file.aiMetadata.display_title) {
    return file.aiMetadata.display_title
  }

  return ''
}

// 获取 AI 推荐的完整分类路径（series/category/subcategory）
function getAiCategory(file) {
  if (!file.aiMetadata) return ''

  const metadata = file.aiMetadata

  // 支持两种字段命名方式
  const series = metadata.series || metadata.primary || ''
  const category = metadata.category || metadata.secondary || ''
  const subcategory = metadata.subcategory || metadata.third || ''

  // 构建完整路径
  const parts = []
  if (series) parts.push(series)
  if (category) parts.push(category)
  if (subcategory) parts.push(subcategory)

  return parts.join('/') || '未分类'
}

// 获取 AI 提取的关键词
function getAiKeywords(file) {
  if (!file.aiMetadata) return []

  // 支持多种字段名
  const keywords = file.aiMetadata.keywords || file.aiMetadata.tags || []

  // 确保返回数组
  return Array.isArray(keywords) ? keywords : []
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.upload-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  min-height: 0;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $spacing-3;
    margin-bottom: $spacing-4;
    flex-shrink: 0;
    flex-wrap: wrap;
    min-height: 48px; // 确保 header 高度稳定
  }

  // 模式切换
  &__mode-switch {
    display: flex;
    background: rgba(255, 255, 255, 0.05);
    border-radius: $radius-lg;
    padding: 2px;
  }

  &__mode-btn {
    display: flex;
    align-items: center;
    gap: $spacing-1;
    padding: $spacing-2 $spacing-3;
    background: transparent;
    border: none;
    border-radius: $radius-md;
    color: $gray-400;
    font-size: $font-size-sm;
    cursor: pointer;
    transition: all $duration-normal;

    &:hover:not(&--active) {
      color: $gray-200;
    }

    &--active {
      background: $primary-gradient;
      color: $white;
      font-weight: 500;
    }
  }

  &__mode-icon {
    font-size: 14px;
  }

  // 系列选择（AI 模式）
  &__series {
    display: flex;
    align-items: center;
    gap: $spacing-2;
    flex: 1;
    min-width: 0;
  }

  &__series-label {
    font-size: $font-size-sm;
    color: $gray-400;
    flex-shrink: 0;
  }

  &__series-btns {
    display: flex;
    gap: $spacing-1;
  }

  &__series-btn {
    display: flex;
    align-items: center;
    gap: $spacing-1;
    padding: $spacing-2 $spacing-3;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: $radius-md;
    color: $gray-300;
    font-size: $font-size-sm;
    cursor: pointer;
    transition: all $duration-normal;

    &:hover:not(&--active) {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
    }

    &--active {
      background: rgba($primary-start, 0.2);
      border-color: rgba($primary-start, 0.5);
      color: $white;
    }
  }

  // AI 配置区域
  &__ai-config {
    display: flex;
    align-items: center;
    gap: $spacing-3;
    flex: 1;
    min-width: 0;
  }

  &__ai-info {
    display: flex;
    align-items: center;
    gap: $spacing-2;
  }

  &__ai-btn {
    display: flex;
    align-items: center;
    gap: $spacing-2;
    padding: $spacing-2 $spacing-3;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: $radius-md;
    color: $gray-200;
    font-size: $font-size-sm;
    cursor: pointer;
    transition: all $duration-normal;

    &:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba($primary-start, 0.4);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    &-icon {
      font-size: 14px;
    }

    &-text {
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &-loading {
      animation: pulse 1.5s ease-in-out infinite;
    }

    &-arrow {
      font-size: 10px;
      color: $gray-400;
    }
  }

  &__ai-status {
    font-size: $font-size-xs;
    color: $warning;
    padding: $spacing-1 $spacing-2;
    background: rgba($warning, 0.1);
    border-radius: $radius-sm;
    animation: pulse 2s ease-in-out infinite;
  }

  &__ai-dropdown {
    &-section {
      margin-bottom: $spacing-3;

      &:last-of-type {
        margin-bottom: $spacing-2;
      }
    }

    &-label {
      font-size: $font-size-xs;
      color: $gray-400;
      margin-bottom: $spacing-2;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    &-options {
      display: flex;
      flex-direction: column;
      gap: $spacing-1;
    }

    &-option {
      display: flex;
      align-items: center;
      gap: $spacing-2;
      padding: $spacing-2 $spacing-3;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid transparent;
      border-radius: $radius-md;
      color: $gray-300;
      font-size: $font-size-sm;
      cursor: pointer;
      transition: all $duration-normal;
      text-align: left;
      width: 100%;

      &:hover {
        background: rgba(255, 255, 255, 0.1);
      }

      &--active {
        background: rgba($primary-start, 0.15);
        border-color: rgba($primary-start, 0.4);
        color: $white;
      }
    }

    &-source {
      margin-left: auto;
      font-size: $font-size-xs;
      color: $gray-500;
    }

    &-badge {
      font-size: 10px;
      padding: 1px 4px;
      background: rgba($success, 0.2);
      color: $success;
      border-radius: $radius-sm;
    }
  }

  &__path {
    flex: 1;
    display: flex;
    align-items: center;
    gap: $spacing-2;
    padding: $spacing-3 $spacing-4;
    background: rgba($success, 0.1);
    border: 1px solid rgba($success, 0.3);
    border-radius: $radius-lg;
    font-size: $font-size-sm;
    color: $white;
    transition: all $duration-normal;
    min-width: 0;
    min-height: 48px; // 确保与 AI 模式高度一致

    .el-icon {
      font-size: 18px;
      color: $success;
      flex-shrink: 0;
    }

    span {
      font-family: monospace;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &--empty {
      background: rgba($warning, 0.1);
      border-color: rgba($warning, 0.3);

      .el-icon {
        color: $warning;
      }
      span {
        color: $warning;
        font-family: inherit;
      }
    }
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: $spacing-2;
    flex-shrink: 0;
  }

  &__stats {
    display: flex;
    align-items: center;
    gap: $spacing-2;
  }

  &__count {
    display: flex;
    align-items: center;
    gap: $spacing-1;
    font-size: $font-size-sm;
    color: $gray-300;
    padding: $spacing-2 $spacing-3;
    background: rgba(255, 255, 255, 0.05);
    border-radius: $radius-md;

    .el-icon {
      font-size: 14px;
      color: $primary-start;
    }
  }

  &__error {
    font-size: $font-size-xs;
    color: $danger;
    padding: $spacing-1 $spacing-2;
    background: rgba($danger, 0.1);
    border-radius: $radius-sm;
    cursor: pointer;

    &:hover {
      background: rgba($danger, 0.2);
    }
  }

  &__btn-clear {
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
      background: rgba($danger, 0.1);
      color: $danger;
    }
  }

  &__btn-upload {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: $spacing-2;
    padding: $spacing-2 $spacing-5;
    background: $primary-gradient;
    border: none;
    border-radius: $radius-lg;
    color: $white;
    font-size: $font-size-sm;
    font-weight: 600;
    cursor: pointer;
    transition: all $duration-normal $ease-out;

    &:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba($primary-start, 0.4);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .is-loading {
      animation: spin 1s linear infinite;
    }
  }

  &__main {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: $glass-bg;
    backdrop-filter: blur($glass-blur);
    border: 1px solid $glass-border;
    border-radius: $radius-xl;
    padding: $spacing-4;
    overflow: hidden;
    min-height: 0;
    height: 100%;
  }

  &__dropzone {
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

    &-content {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      gap: $spacing-3;
      flex-wrap: wrap;
    }

    &-icon {
      font-size: 18px;
    }

    &-text {
      color: $gray-300;
      font-size: $font-size-sm;
    }
  }

  &__dropzone-btns {
    display: flex;
    gap: $spacing-2;
  }

  &__add-btn {
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

  &__input {
    display: none;
  }

  &__files {
    flex: 1;
    margin-top: $spacing-3;
    overflow: hidden;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  &__grid {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: $spacing-3;
    overflow-y: auto;
    padding-right: $spacing-1;
    align-content: start;

    &::-webkit-scrollbar {
      width: 4px;
    }

    &::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 2px;

      &:hover {
        background: rgba(255, 255, 255, 0.25);
      }
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }
  }

  &__batch {
    display: flex;
    align-items: center;
    gap: $spacing-3;
    margin-bottom: $spacing-3;
    padding-bottom: $spacing-2;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);

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
      margin-left: auto;

      &:hover {
        background: rgba($primary-start, 0.2);
      }

      span {
        font-size: 12px;
      }
    }
  }

  &__item {
    position: relative;
    aspect-ratio: 1;
    border-radius: $radius-lg;
    overflow: hidden;
    cursor: pointer;
    border: 2px solid transparent;
    transition: all $duration-normal;

    &:hover {
      border-color: rgba(255, 255, 255, 0.3);
      transform: scale(1.03);
    }

    &--selected {
      border-color: $primary-start;
      box-shadow: 0 0 0 2px rgba($primary-start, 0.3);
    }

    &--checked {
      border-color: rgba($primary-start, 0.5);

      .upload-panel__item-checkbox {
        opacity: 1;
      }
    }

    &--success {
      border-color: $success;
    }
    &--error {
      border-color: $danger;
    }

    &-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      pointer-events: none;
    }

    &-checkbox {
      position: absolute;
      top: 4px;
      left: 4px;
      z-index: 2;
      opacity: 0;
      transition: opacity $duration-normal;

      .upload-panel__item:hover & {
        opacity: 1;
      }

      :deep(.el-checkbox__inner) {
        background: rgba(0, 0, 0, 0.6);
        border-color: rgba(255, 255, 255, 0.5);
      }

      :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
        background: $primary-start;
        border-color: $primary-start;
      }
    }

    &-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.7);
    }

    &-badge {
      position: absolute;
      top: 4px;
      right: 4px;
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      font-size: 11px;
      font-weight: bold;

      &--success {
        background: $success;
        color: $white;
      }
      &--error {
        background: $danger;
        color: $white;
      }
    }

    &-remove {
      position: absolute;
      top: 4px;
      right: 4px;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.7);
      border: none;
      border-radius: 50%;
      color: $white;
      font-size: 14px;
      cursor: pointer;
      opacity: 0;
      transition: all $duration-normal;

      .upload-panel__item:hover & {
        opacity: 1;
      }
      &:hover {
        background: $danger;
      }
    }

    &-path {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 2px;
      padding: 2px 6px;
      background: rgba(0, 0, 0, 0.75);
      color: $gray-300;
      font-size: 10px;
      text-align: center;
      cursor: pointer;
      transition: all $duration-normal;

      &:hover {
        background: rgba($primary-start, 0.8);
        color: $white;
      }

      &-icon {
        font-size: 9px;
      }

      &-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      // 不同系列不同颜色
      &--desktop {
        border-top: 2px solid $primary-start;
      }

      &--mobile {
        border-top: 2px solid $success;
      }

      &--avatar {
        border-top: 2px solid $warning;
      }

      // AI 推荐的分类
      &--ai {
        background: rgba($primary-start, 0.6);
      }

      // 等待 AI 分析
      &--waiting {
        background: rgba($warning, 0.7);
        color: $white;
        border-top: 2px solid $warning;
      }

      &-ai {
        font-size: 9px;
        margin-left: 2px;
      }

      &-icon--loading {
        animation: pulse 1.5s ease-in-out infinite;
      }
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

// 过渡动画
.grid-enter-active,
.grid-leave-active {
  transition: all $duration-normal $ease-out;
}

.grid-enter-from,
.grid-leave-to {
  opacity: 0;
  transform: scale(0.8);
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

// 模式切换动画
.mode-fade-enter-active,
.mode-fade-leave-active {
  transition: opacity 0.3s ease;
}

.mode-fade-enter-from,
.mode-fade-leave-to {
  opacity: 0;
}

// 支持减少动画偏好
@media (prefers-reduced-motion: reduce) {
  .mode-fade-enter-active,
  .mode-fade-leave-active {
    transition: opacity 0.1s ease;
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>

<style lang="scss">
@use '@/styles/variables' as *;

// AI 分析悬浮提示样式（全局样式，因为 el-tooltip 的 popper 在 body 下）
.upload-panel__ai-tooltip {
  max-width: 320px;

  .ai-tooltip-content {
    padding: $spacing-2;
  }

  .ai-tooltip-section {
    margin-bottom: $spacing-2;

    &:last-child {
      margin-bottom: 0;
    }
  }

  .ai-tooltip-label {
    display: block;
    font-size: $font-size-xs;
    color: $gray-400;
    margin-bottom: $spacing-1;
  }

  .ai-tooltip-value {
    display: block;
    font-size: $font-size-sm;
    color: $white;
    word-break: break-word;
  }

  .ai-tooltip-tags {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-1;
  }

  .ai-tooltip-tag {
    padding: 2px 8px;
    background: rgba($primary-start, 0.2);
    border: 1px solid rgba($primary-start, 0.4);
    border-radius: $radius-sm;
    font-size: $font-size-xs;
    color: $primary-start;
  }
}
</style>
