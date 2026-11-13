<template>
  <div class="category-sidebar">
    <div class="category-sidebar__header">
      <div class="category-sidebar__header-top">
        <h3 class="category-sidebar__title">
          <el-icon><Folder /></el-icon>
          分类目录
        </h3>

        <div class="category-sidebar__header-actions">
          <span v-if="syncing" class="category-sidebar__syncing">
            <span class="category-sidebar__syncing-dot"></span>
            同步中
          </span>
          <span
            v-else
            class="category-sidebar__status"
            :class="{
              'category-sidebar__status--selected': targetPath,
              'category-sidebar__status--pending': !targetPath
            }"
          >
            {{ targetPath ? '已选择' : '待选择' }}
          </span>
          <button
            class="category-sidebar__refresh-btn"
            title="刷新目录"
            :disabled="syncing"
            @click="$emit('refresh')"
          >
            <el-icon><Refresh /></el-icon>
          </button>
        </div>
      </div>

      <p class="category-sidebar__hint" :title="currentPathLabel">{{ currentPathLabel }}</p>
    </div>

    <div class="category-sidebar__series">
      <button
        v-for="item in seriesList"
        :key="item.value"
        class="category-sidebar__series-btn"
        :class="{ 'category-sidebar__series-btn--active': series === item.value }"
        :aria-pressed="series === item.value"
        @click="$emit('select-series', item.value)"
      >
        <el-icon class="category-sidebar__series-icon"><component :is="item.icon" /></el-icon>
        <span class="category-sidebar__series-meta">
          <span class="category-sidebar__series-label">{{ item.label }}</span>
        </span>
      </button>
    </div>

    <div class="category-sidebar__tree-shell">
      <div class="category-sidebar__tree-toolbar">
        <span class="category-sidebar__tree-toolbar-label">{{ currentSeriesLabel }}目录</span>
        <el-tooltip content="点击目录即可设为目标路径" placement="top" :show-after="400">
          <span class="category-sidebar__tree-toolbar-tip">
            <el-icon><InfoFilled /></el-icon>
          </span>
        </el-tooltip>
      </div>

      <el-collapse-transition>
        <div v-if="currentPathSegments.length" class="category-sidebar__current-path">
          <span class="category-sidebar__current-path-label">当前路径</span>
          <div class="category-sidebar__current-path-trail">
            <span
              v-for="segment in currentPathSegments"
              :key="segment.key"
              class="category-sidebar__current-path-chip"
            >
              {{ segment.label }}
            </span>
          </div>
        </div>
      </el-collapse-transition>
      <div class="category-sidebar__tree-stage">
        <Transition name="studio-panel">
          <div v-if="loading" key="loading" class="category-sidebar__loading">
            <div class="category-sidebar__loading-head">
              <span class="category-sidebar__loading-badge">同步中</span>
              <span class="category-sidebar__loading-text">正在拉取目录结构，请稍等</span>
            </div>
            <div class="category-sidebar__loading-list">
              <div v-for="index in 6" :key="index" class="category-sidebar__loading-row">
                <span class="category-sidebar__loading-icon"></span>
                <span
                  class="category-sidebar__loading-line"
                  :style="getLoadingLineStyle(index)"
                ></span>
              </div>
            </div>
          </div>

          <div
            v-else-if="treeData.length > 0"
            key="tree"
            class="category-sidebar__tree"
            data-scroll-region
          >
            <el-tree
              :data="treeData"
              :props="treeProps"
              :load="loadNode"
              :current-node-key="targetPath || undefined"
              lazy
              highlight-current
              node-key="path"
              @node-click="handleNodeClick"
            >
              <template #default="{ node, data }">
                <div
                  class="category-sidebar__tree-node"
                  :class="{
                    'category-sidebar__tree-node--active': isActiveNode(data.path),
                    'category-sidebar__tree-node--ancestor': isAncestorNode(data.path)
                  }"
                >
                  <el-icon class="category-sidebar__tree-icon"
                    ><Folder v-if="data.type === 'l1'" /><FolderOpened v-else
                  /></el-icon>
                  <span class="category-sidebar__tree-label">{{ node.label }}</span>
                  <span
                    v-if="isActiveNode(data.path)"
                    class="category-sidebar__tree-badge category-sidebar__tree-badge--active"
                  >
                    当前
                  </span>
                  <span
                    v-else-if="isAncestorNode(data.path)"
                    class="category-sidebar__tree-badge category-sidebar__tree-badge--ancestor"
                  >
                    上级
                  </span>
                  <button
                    v-if="authStore.canUpload"
                    class="category-sidebar__tree-delete"
                    title="删除分类"
                    @click.stop="handleDelete(data, node)"
                  >
                    <el-icon><Delete /></el-icon>
                  </button>
                </div>
              </template>
            </el-tree>
          </div>

          <div v-else key="empty" class="category-sidebar__tree-empty">
            <el-icon class="category-sidebar__tree-empty-icon"><FolderOpened /></el-icon>
            <strong class="category-sidebar__tree-empty-title">当前系列还没有目录</strong>
            <span class="category-sidebar__tree-empty-text">可以先新建分类，再开始上传。</span>
          </div>
        </Transition>
      </div>
    </div>

    <button v-if="authStore.canUpload" class="category-sidebar__new-btn" @click="$emit('create')">
      <el-icon><Plus /></el-icon>
      新建分类
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import {
  Folder,
  FolderOpened,
  Monitor,
  Iphone,
  User,
  Plus,
  Delete,
  Refresh,
  InfoFilled
} from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

const props = defineProps({
  series: { type: String, required: true },
  treeData: { type: Array, required: true },
  loading: { type: Boolean, default: false },
  syncing: { type: Boolean, default: false },
  targetPath: { type: String, default: '' },
  loadNode: { type: Function, required: true }
})

const emit = defineEmits(['select-series', 'select-category', 'create', 'delete', 'refresh'])

const seriesList = [
  { value: 'desktop', label: '电脑', icon: Monitor },
  { value: 'mobile', label: '手机', icon: Iphone },
  { value: 'avatar', label: '头像', icon: User }
]

const treeProps = {
  label: 'name',
  children: 'children',
  isLeaf: data => data.type === 'l2'
}

const currentSeriesLabel = computed(() => {
  return seriesList.find(item => item.value === props.series)?.label || '当前系列'
})

const currentPathLabel = computed(() => {
  return props.targetPath || '请选择上传目录'
})

const currentPathSegments = computed(() => {
  if (!props.targetPath) return []

  const parts = props.targetPath.split('/').filter(Boolean).slice(1)

  return parts.map((part, index) => ({
    key: `${index}-${part}`,
    label: index === 0 ? currentSeriesLabel.value : part
  }))
})

function getLoadingLineStyle(index) {
  const widths = ['72%', '58%', '80%', '64%', '76%', '52%']
  return { width: widths[(index - 1) % widths.length] }
}

function isActiveNode(path) {
  return !!props.targetPath && props.targetPath === path
}

function isAncestorNode(path) {
  return !!props.targetPath && props.targetPath.startsWith(`${path}/`)
}

function handleNodeClick(data, node) {
  emit('select-category', { data, node })
}

function handleDelete(data, node) {
  emit('delete', { data, node })
}
</script>

<style scoped lang="scss">
.category-sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  height: 100%;
  padding: 18px;
  overflow: hidden;
  background: var(--studio-surface);
  border: 1px solid var(--studio-border);
  border-radius: 16px;
}
.category-sidebar__header {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
}
.category-sidebar__header-top,
.category-sidebar__header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.category-sidebar__header-top {
  justify-content: space-between;
}
.category-sidebar__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--studio-text);
  white-space: nowrap;
}
.category-sidebar__title .el-icon {
  color: var(--studio-muted);
}
.category-sidebar__status,
.category-sidebar__syncing {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--studio-muted);
  font-size: 10px;
  white-space: nowrap;
}
.category-sidebar__status--selected {
  color: var(--studio-accent);
}
.category-sidebar__syncing-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--studio-accent);
}
.category-sidebar__refresh-btn {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 50%;
  color: var(--studio-muted);
  background: var(--studio-raised);
  cursor: pointer;
}
.category-sidebar__refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.category-sidebar__hint {
  margin: 0;
  color: var(--studio-muted);
  font-size: 11px;
  line-height: 1.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.category-sidebar__series {
  display: flex;
  gap: 3px;
  padding: 3px;
  background: var(--studio-raised);
  border-radius: 999px;
  flex-shrink: 0;
}
.category-sidebar__series-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 8px 5px;
  flex: 1;
  min-width: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--studio-muted);
  cursor: pointer;
  font-size: 11px;
  transition:
    background-color 0.18s,
    color 0.18s;
}
.category-sidebar__series-btn--active {
  background: rgba(255, 255, 255, 0.14);
  color: var(--studio-text);
  box-shadow:
    0 1px 4px rgba(0, 0, 0, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}
.category-sidebar__series-icon {
  font-size: 13px;
  flex-shrink: 0;
}
.category-sidebar__series-label {
  white-space: nowrap;
}
.category-sidebar__tree-shell {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.category-sidebar__tree-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--studio-border);
  flex-shrink: 0;
}
.category-sidebar__tree-toolbar-label,
.category-sidebar__tree-toolbar-tip {
  color: var(--studio-muted);
  font-size: 11px;
}
.category-sidebar__current-path {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 0;
  border-bottom: 1px solid var(--studio-border);
}
.category-sidebar__current-path-label {
  font-size: 10px;
  color: var(--studio-muted);
}
.category-sidebar__current-path-trail {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.category-sidebar__current-path-chip {
  color: var(--studio-text);
  font-size: 11px;
  line-height: 1.5;
}
.category-sidebar__current-path-chip + .category-sidebar__current-path-chip::before {
  content: '/';
  margin-right: 6px;
  color: var(--studio-muted);
}
.category-sidebar__tree-stage {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.category-sidebar__tree-stage > .studio-panel-leave-active {
  position: absolute;
  inset: 0;
}
.category-sidebar__tree {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-top: 10px;
  scrollbar-width: thin;
}
.category-sidebar__tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  padding-right: 4px;
}
.category-sidebar__tree-icon {
  color: var(--studio-muted);
  flex-shrink: 0;
  font-size: 14px;
}
.category-sidebar__tree-label {
  flex: 1;
  min-width: 0;
  color: var(--studio-text);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.category-sidebar__tree-node--active .category-sidebar__tree-label {
  color: var(--studio-accent);
  font-weight: 500;
}
.category-sidebar__tree-badge {
  color: var(--studio-muted);
  font-size: 10px;
}
.category-sidebar__tree-badge--active {
  color: var(--studio-accent);
}
.category-sidebar__tree-delete {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--studio-muted);
  opacity: 0;
  cursor: pointer;
}
.category-sidebar__tree-node:hover .category-sidebar__tree-delete,
.category-sidebar__tree-delete:focus-visible {
  opacity: 1;
}
.category-sidebar__tree-delete:hover {
  color: var(--el-color-danger);
  background: var(--studio-raised);
}
.category-sidebar__tree-empty {
  display: flex;
  flex: 1;
  min-height: 100px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 20px 8px;
  text-align: center;
}
.category-sidebar__tree-empty-icon {
  font-size: 30px;
  color: var(--studio-muted);
}
.category-sidebar__tree-empty-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--studio-text);
}
.category-sidebar__tree-empty-text {
  font-size: 11px;
  line-height: 1.7;
  color: var(--studio-muted);
}
.category-sidebar__new-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 36px;
  flex-shrink: 0;
  border: 1px solid var(--studio-border);
  border-radius: 999px;
  background: var(--studio-raised);
  color: var(--studio-text);
  font-size: 12px;
  cursor: pointer;
}
.category-sidebar__new-btn:hover {
  border-color: var(--studio-accent);
}
.category-sidebar button:focus-visible {
  outline: 2px solid var(--studio-accent);
  outline-offset: 2px;
}
.category-sidebar__loading {
  padding-top: 18px;
}
.category-sidebar__loading-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
  color: var(--studio-muted);
  font-size: 11px;
}
.category-sidebar__loading-row {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 36px;
}
.category-sidebar__loading-icon {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  background: var(--studio-raised);
}
.category-sidebar__loading-line {
  height: 6px;
  border-radius: 4px;
  background: var(--studio-raised);
}
.category-sidebar :deep(.el-tree) {
  background: transparent;
  color: var(--studio-text);
}
.category-sidebar :deep(.el-tree-node__content) {
  height: 36px;
  border-radius: 7px;
}
.category-sidebar :deep(.el-tree-node__content:hover),
.category-sidebar :deep(.el-tree-node.is-current > .el-tree-node__content) {
  background: var(--studio-raised);
}
@media (max-width: 760px) {
  .category-sidebar__tree-delete {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .category-sidebar__series-btn {
    transition: none;
  }
}
</style>
