<template>
  <GlassCard
    class="workflow-panel"
    :class="{ 'workflow-panel--collapsed': collapsed }"
    :padding="collapsed ? '12px 16px' : '24px'"
    :hoverable="false"
  >
    <div class="workflow-panel__header">
      <span class="workflow-panel__title">
        <el-icon><Operation /></el-icon>
        发布工作流
      </span>
      <div class="workflow-panel__header-actions">
        <button
          v-if="!collapsed"
          class="workflow-panel__refresh"
          :disabled="loading"
          @click="refresh"
        >
          <el-icon :class="{ 'is-loading': loading }"><Refresh /></el-icon>
        </button>
        <button
          v-if="collapsed"
          class="workflow-panel__collapse"
          aria-label="展开工作流"
          @click="$emit('toggle')"
        >
          <span class="workflow-panel__collapse-icon">▾</span>
        </button>
      </div>
    </div>

    <div class="workflow-panel__inner" :class="{ 'workflow-panel__inner--hidden': collapsed }">
      <div class="workflow-panel__body">
        <div class="workflow-panel__content">
          <div v-if="workflowStore.sessionUploadCount > 0" class="workflow-panel__stat">
            <span class="workflow-panel__stat-label">本次上传</span>
            <span class="workflow-panel__stat-value workflow-panel__stat-value--success">
              {{ workflowStore.sessionUploadCount }} 张
            </span>
          </div>

          <div class="workflow-panel__stat">
            <span class="workflow-panel__stat-label">最新版本</span>
            <span class="workflow-panel__stat-value">
              <template v-if="pendingInfo.latestTag">
                {{ pendingInfo.latestTag }}
              </template>
              <template v-else>
                <span class="workflow-panel__stat-value--muted">无</span>
              </template>
            </span>
          </div>

          <div v-if="pendingInfo.latestTagInfo?.date" class="workflow-panel__stat">
            <span class="workflow-panel__stat-label">发布时间</span>
            <span class="workflow-panel__stat-value workflow-panel__stat-value--muted">
              {{ formatDate(pendingInfo.latestTagInfo.date) }}
            </span>
          </div>

          <div class="workflow-panel__stat">
            <span class="workflow-panel__stat-label">待处理</span>
            <span
              class="workflow-panel__stat-value"
              :class="{ 'workflow-panel__stat-value--warning': pendingInfo.pendingCount > 0 }"
            >
              {{ pendingInfo.pendingCount }} 张
            </span>
          </div>

          <div v-if="workflowStatus.latestRun && !isRunning" class="workflow-panel__stat">
            <span class="workflow-panel__stat-label">上次运行</span>
            <span class="workflow-panel__stat-value">
              <el-tag
                :type="getRunStatusType(workflowStatus.latestRun)"
                size="small"
                class="workflow-panel__run-tag"
                @click="openWorkflowRun"
              >
                {{ getRunStatusText(workflowStatus.latestRun) }}
              </el-tag>
            </span>
          </div>

          <div
            v-if="workflowStatus.latestRun?.conclusion === 'failure' && !isRunning"
            class="workflow-panel__failure"
          >
            <el-icon><CircleClose /></el-icon>
            <span>工作流执行失败</span>
            <a :href="getWorkflowRunUrl()" target="_blank" class="workflow-panel__failure-link">
              查看详情
            </a>
          </div>

          <div v-if="isRunning" class="workflow-panel__progress">
            <div class="workflow-panel__progress-header">
              <el-icon class="is-loading"><Loading /></el-icon>
              <span>{{ getProgressTitle() }}</span>
            </div>

            <div class="workflow-panel__steps">
              <div
                v-for="(step, index) in progressSteps"
                :key="step.key"
                class="workflow-panel__step"
                :class="{
                  'workflow-panel__step--active': step.status === 'active',
                  'workflow-panel__step--done': step.status === 'done',
                  'workflow-panel__step--pending': step.status === 'pending'
                }"
              >
                <div class="workflow-panel__step-indicator">
                  <el-icon v-if="step.status === 'active'" class="is-loading"><Loading /></el-icon>
                  <el-icon v-else-if="step.status === 'done'"><CircleCheck /></el-icon>
                  <span v-else>{{ index + 1 }}</span>
                </div>
                <span class="workflow-panel__step-text">{{ step.label }}</span>
              </div>
            </div>

            <a
              v-if="getWorkflowRunUrl()"
              :href="getWorkflowRunUrl()"
              target="_blank"
              class="workflow-panel__progress-link"
            >
              <el-icon><Link /></el-icon>
              查看 GitHub Actions
            </a>
          </div>

          <div v-if="pendingInfo.message" class="workflow-panel__message">
            <el-icon><InfoFilled /></el-icon>
            {{ pendingInfo.message }}
          </div>

          <div v-if="pendingInfo.error" class="workflow-panel__error">
            <el-icon><WarningFilled /></el-icon>
            {{ pendingInfo.error }}
          </div>
        </div>

        <Transition name="slide">
          <div
            v-if="showFiles && pendingInfo.pendingFiles.length > 0"
            class="workflow-panel__files"
          >
            <div class="workflow-panel__files-header">
              待处理文件 ({{ pendingInfo.pendingFiles.length }})
            </div>
            <div class="workflow-panel__files-list">
              <div
                v-for="file in pendingInfo.pendingFiles"
                :key="file.filename"
                class="workflow-panel__file"
              >
                <el-tag :type="getSeriesType(file.series)" size="small">
                  {{ file.series }}
                </el-tag>
                <span class="workflow-panel__file-name">
                  {{ file.filename.split('/').pop() }}
                </span>
              </div>
            </div>
          </div>
        </Transition>

        <button
          v-if="pendingInfo.pendingFiles.length > 0"
          class="workflow-panel__toggle"
          @click="showFiles = !showFiles"
        >
          <el-icon>
            <ArrowUp v-if="showFiles" />
            <ArrowDown v-else />
          </el-icon>
          {{ showFiles ? '收起' : '查看详情' }}
        </button>
      </div>

      <div class="workflow-panel__actions">
        <button
          class="workflow-panel__btn"
          :class="{
            'workflow-panel__btn--disabled':
              !workflowStore.canTrigger &&
              !workflowStatus.hasRunning &&
              !workflowStatus.justTriggered,
            'workflow-panel__btn--running':
              workflowStatus.hasRunning || workflowStatus.justTriggered
          }"
          :disabled="!workflowStore.canTrigger || triggering"
          @click="handleTrigger"
        >
          <el-icon v-if="triggering" class="is-loading"><Loading /></el-icon>
          <el-icon
            v-else-if="workflowStatus.justTriggered || workflowStatus.hasRunning"
            class="is-loading"
          >
            <Loading />
          </el-icon>
          <el-icon v-else><VideoPlay /></el-icon>
          <span v-if="triggering">触发中...</span>
          <span v-else-if="workflowStatus.justTriggered">已触发，等待启动...</span>
          <span v-else-if="workflowStatus.hasRunning">运行中...</span>
          <span v-else-if="pendingInfo.pendingCount === 0">无待处理</span>
          <span v-else>触发工作流</span>
        </button>

        <button
          v-if="isAdmin && pendingInfo.latestTag"
          class="workflow-panel__rollback-btn"
          :disabled="rolling || loading || isRunning"
          @click="handleRollback"
        >
          <el-icon v-if="rolling" class="is-loading"><Loading /></el-icon>
          <el-icon v-else><RefreshLeft /></el-icon>
          <span>撤销 {{ pendingInfo.latestTag }}</span>
        </button>

        <button
          v-if="canUpload"
          class="workflow-panel__deploy-btn"
          :disabled="deploying || loading"
          @click="handleDeployFrontend"
        >
          <el-icon v-if="deploying" class="is-loading"><Loading /></el-icon>
          <el-icon v-else><Upload /></el-icon>
          <span>{{ deploying ? '部署中...' : '重新部署前端' }}</span>
        </button>
      </div>
    </div>
  </GlassCard>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  Operation,
  Refresh,
  Loading,
  VideoPlay,
  InfoFilled,
  WarningFilled,
  ArrowUp,
  ArrowDown,
  RefreshLeft,
  CircleClose,
  CircleCheck,
  Link,
  Upload
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import GlassCard from '@/components/GlassCard.vue'
import { useWorkflowStore } from '@/stores/workflow'
import { useConfigStore } from '@/stores/config'
import { useAuthStore } from '@/stores/auth'

defineProps({
  collapsed: { type: Boolean, default: false }
})

defineEmits(['toggle'])

const workflowStore = useWorkflowStore()
const configStore = useConfigStore()
const authStore = useAuthStore()

const showFiles = ref(false)
const rolling = ref(false)
const deploying = ref(false)

const loading = computed(() => workflowStore.loading)
const triggering = computed(() => workflowStore.triggering)
const pendingInfo = computed(() => workflowStore.pendingInfo)
const workflowStatus = computed(() => workflowStore.workflowStatus)
const isAdmin = computed(() => authStore.permissionLevel === 'admin')
const canUpload = computed(() => authStore.canUpload)
const isRunning = computed(() => workflowStore.isRunning)

const progressSteps = computed(() => {
  const status = workflowStatus.value
  const run = status.runningWorkflow || status.latestRun

  const steps = [
    { key: 'trigger', label: '触发工作流' },
    { key: 'queue', label: '排队等待' },
    { key: 'process', label: '处理图片' },
    { key: 'release', label: '发布版本' }
  ]

  if (status.justTriggered && !status.hasRunning) {
    return steps.map((step, index) => ({ ...step, status: index === 0 ? 'active' : 'pending' }))
  }

  if (run?.status === 'queued') {
    return steps.map((step, index) => ({
      ...step,
      status: index === 0 ? 'done' : index === 1 ? 'active' : 'pending'
    }))
  }

  if (run?.status === 'in_progress') {
    const startTime = run.run_started_at ? new Date(run.run_started_at).getTime() : Date.now()
    const elapsed = Date.now() - startTime

    if (elapsed < 30000) {
      return steps.map((step, index) => ({
        ...step,
        status: index <= 1 ? 'done' : index === 2 ? 'active' : 'pending'
      }))
    }

    return steps.map((step, index) => ({
      ...step,
      status: index <= 2 ? 'done' : 'active'
    }))
  }

  return steps.map((step, index) => ({ ...step, status: index === 0 ? 'active' : 'pending' }))
})

function getProgressTitle() {
  const status = workflowStatus.value
  const run = status.runningWorkflow

  if (status.justTriggered && !status.hasRunning) return '已触发，等待启动...'
  if (run?.status === 'queued') return '排队中，请稍候...'
  if (run?.status === 'in_progress') return '正在处理...'
  return '工作流运行中...'
}

const workflowOwner = computed(() => configStore.config.workflowOwner)
const workflowRepo = computed(() => configStore.config.workflowRepo)
const frontendOwner = computed(() => configStore.config.frontendOwner)
const frontendRepo = computed(() => configStore.config.frontendRepo)

async function refresh() {
  const { owner, repo, branch } = configStore.config
  try {
    const tasks = [
      workflowStore.refreshPendingInfo(owner, repo, branch),
      workflowStore.refreshStatsData(owner, repo, branch)
    ]

    if (workflowOwner.value && workflowRepo.value) {
      tasks.push(workflowStore.refreshWorkflowStatus(workflowOwner.value, workflowRepo.value))
    }

    await Promise.all(tasks)
  } catch (error) {
    ElMessage.error('刷新失败: ' + (error.message || '未知错误'))
  }
}

async function handleTrigger() {
  if (!workflowOwner.value || !workflowRepo.value) {
    ElMessage.warning('请先在设置中填写工作流仓库')
    return
  }
  try {
    const publisher = authStore.user?.login || ''
    await workflowStore.triggerWorkflow(workflowOwner.value, workflowRepo.value, '', publisher)
    ElMessage.success('工作流已触发，正在处理中...')
    setTimeout(() => {
      workflowStore.refreshWorkflowStatus(workflowOwner.value, workflowRepo.value)
    }, 2000)
  } catch (error) {
    if (error.type === 'WORKFLOW_PERMISSION_DENIED') {
      ElMessageBox.confirm(
        '您没有工作流仓库的触发权限。\n\n您可以手动前往 GitHub Actions 页面触发工作流。',
        '权限不足',
        {
          confirmButtonText: '前往 GitHub',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )
        .then(() => {
          window.open(
            `https://github.com/${workflowOwner.value}/${workflowRepo.value}/actions`,
            '_blank'
          )
        })
        .catch(() => {})
    } else {
      ElMessage.error('触发失败: ' + (error.message || '未知错误'))
    }
  }
}

async function handleRollback() {
  if (!workflowOwner.value || !workflowRepo.value) {
    ElMessage.warning('请先在设置中填写工作流仓库')
    return
  }
  const tagName = pendingInfo.value.latestTag
  if (!tagName) {
    ElMessage.warning('没有可回滚的版本')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要回滚版本 ${tagName} 吗？\n\n这将：\n• 删除该版本新增的壁纸文件\n• 更新时间戳和统计数据\n• 删除 tag 和 release\n\n注意：不会影响 Bing 每日同步的数据`,
      '回滚确认',
      {
        confirmButtonText: '确定回滚',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger'
      }
    )

    rolling.value = true
    const { owner, repo } = configStore.config
    const result = await workflowStore.rollbackLastRelease(
      owner,
      repo,
      workflowOwner.value,
      workflowRepo.value,
      tagName
    )

    ElMessage.success(`回滚工作流已触发，正在处理 ${result.deletedTag}...`)
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('回滚失败: ' + (error.message || '未知错误'))
    }
  } finally {
    rolling.value = false
  }
}

async function handleDeployFrontend() {
  if (!frontendOwner.value || !frontendRepo.value) {
    ElMessage.warning('请先在设置中填写网站仓库')
    return
  }
  try {
    await ElMessageBox.confirm(
      '确定要重新部署前端吗？\n\n这将：\n• 触发 GitHub Pages 重新构建\n• 更新 CDN 版本号\n• 清除 Cloudflare 缓存\n\n部署过程约需 2-3 分钟',
      '部署确认',
      {
        confirmButtonText: '确定部署',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    deploying.value = true
    await workflowStore.triggerFrontendDeploy(frontendOwner.value, frontendRepo.value)
    ElMessage.success('前端部署已触发，请稍后查看 GitHub Actions 状态')
  } catch (error) {
    if (error !== 'cancel') {
      const errMsg =
        error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error))
      console.error('Failed to trigger frontend deploy:', error)
      ElMessage.error('部署失败: ' + errMsg)
    }
  } finally {
    deploying.value = false
  }
}

function getRunStatusType(run) {
  if (!run) return 'info'
  if (run.conclusion === 'success') return 'success'
  if (run.conclusion === 'failure') return 'danger'
  if (run.status === 'in_progress' || run.status === 'queued') return 'warning'
  return 'info'
}

function getRunStatusText(run) {
  if (!run) return '未知'
  if (run.conclusion === 'success') return '成功'
  if (run.conclusion === 'failure') return '失败'
  if (run.conclusion === 'cancelled') return '已取消'
  if (run.status === 'in_progress') return '运行中'
  if (run.status === 'queued') return '排队中'
  return run.status
}

function getSeriesType(series) {
  const map = { desktop: 'primary', mobile: 'success', avatar: 'warning' }
  return map[series] || 'info'
}

function getWorkflowRunUrl() {
  const run = workflowStatus.value.latestRun
  if (!run) return ''
  return (
    run.html_url ||
    (workflowOwner.value && workflowRepo.value
      ? `https://github.com/${workflowOwner.value}/${workflowRepo.value}/actions/runs/${run.id}`
      : '')
  )
}

function openWorkflowRun() {
  const url = getWorkflowRunUrl()
  if (url) window.open(url, '_blank')
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now - date

  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000)
    return mins <= 1 ? '刚刚' : `${mins} 分钟前`
  }
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000)
    return `${hours} 小时前`
  }
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000)
    return `${days} 天前`
  }
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

onMounted(() => {
  const { owner, repo, branch } = configStore.config
  workflowStore.setImageRepoConfig(owner, repo, branch)
  refresh()
})

onUnmounted(() => {
  workflowStore.cleanup()
})
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.workflow-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    margin-bottom: $spacing-3;
    min-height: 28px;
  }

  &__header-actions {
    display: flex;
    align-items: center;
    gap: $spacing-2;
  }

  &__title {
    display: flex;
    align-items: center;
    gap: $spacing-2;
    font-size: $font-size-sm;
    font-weight: 600;
    color: $white;
    line-height: 1;

    .el-icon {
      color: $primary-start;
    }
  }

  &__refresh {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.05);
    border: none;
    border-radius: $radius-md;
    color: $gray-400;
    cursor: pointer;
    transition: all $duration-normal;

    &:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.1);
      color: $white;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &__collapse {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    color: $gray-400;
    font-size: $font-size-xs;
    cursor: pointer;
    transition: all $duration-normal;

    &:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.14);
      color: $white;
    }
  }

  &__collapse-icon {
    font-size: 11px;
    line-height: 1;
  }

  &__inner {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
    overflow: hidden;
    transition: opacity 0.34s ease;

    &--hidden {
      opacity: 0;
      pointer-events: none;
    }
  }

  &__body {
    flex: 1;
    overflow-y: auto;
    min-height: 0;

    &::-webkit-scrollbar {
      width: 4px;
    }

    &::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 2px;
    }
  }

  &__content {
    display: flex;
    flex-direction: column;
    gap: $spacing-2;
  }

  &__stat {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: $spacing-2 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);

    &:last-child {
      border-bottom: none;
    }

    &-label {
      font-size: $font-size-xs;
      color: $gray-400;
    }

    &-value {
      font-size: $font-size-sm;
      color: $white;
      font-weight: 500;

      &--success {
        color: $success;
      }

      &--warning {
        color: $warning;
      }

      &--muted {
        color: $gray-500;
      }
    }
  }

  &__progress {
    padding: $spacing-3;
    background: rgba($primary-start, 0.08);
    border: 1px solid rgba($primary-start, 0.2);
    border-radius: 12px;

    &-header {
      display: flex;
      align-items: center;
      gap: $spacing-2;
      margin-bottom: $spacing-3;
      font-size: $font-size-sm;
      font-weight: 600;
      color: $primary-start;

      .el-icon {
        font-size: 16px;
      }
    }

    &-link {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: $spacing-1;
      margin-top: $spacing-3;
      padding: $spacing-2;
      background: rgba(255, 255, 255, 0.05);
      border-radius: $radius-md;
      font-size: $font-size-xs;
      color: $gray-400;
      text-decoration: none;
      transition: all $duration-normal;

      &:hover {
        background: rgba(255, 255, 255, 0.1);
        color: $white;
      }

      .el-icon {
        font-size: 12px;
      }
    }
  }

  &__steps {
    display: flex;
    flex-direction: column;
    gap: $spacing-2;
  }

  &__step {
    display: flex;
    align-items: center;
    gap: $spacing-2;
    padding: $spacing-1 0;

    &-indicator {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      font-size: 10px;
      font-weight: 600;
      background: rgba(255, 255, 255, 0.1);
      color: $gray-500;

      .el-icon {
        font-size: 12px;
      }
    }

    &-text {
      font-size: $font-size-xs;
      color: $gray-500;
    }

    &--active {
      .workflow-panel__step-indicator {
        background: $primary-start;
        color: $white;
      }

      .workflow-panel__step-text {
        color: $primary-start;
        font-weight: 500;
      }
    }

    &--done {
      .workflow-panel__step-indicator {
        background: rgba($success, 0.2);
        color: $success;
      }

      .workflow-panel__step-text {
        color: $gray-400;
      }
    }

    &--pending {
      .workflow-panel__step-indicator {
        background: rgba(255, 255, 255, 0.05);
        color: $gray-600;
      }

      .workflow-panel__step-text {
        color: $gray-600;
      }
    }
  }

  &__message,
  &__error {
    display: flex;
    align-items: flex-start;
    gap: $spacing-2;
    padding: $spacing-2;
    border-radius: $radius-md;
    font-size: $font-size-xs;

    .el-icon {
      flex-shrink: 0;
      margin-top: 2px;
    }
  }

  &__message {
    background: rgba($info, 0.1);
    color: $info;
  }

  &__error {
    background: rgba($danger, 0.1);
    color: $danger;
  }

  &__failure {
    display: flex;
    align-items: center;
    gap: $spacing-2;
    padding: $spacing-2;
    background: rgba($danger, 0.08);
    border: 1px solid rgba($danger, 0.18);
    border-radius: $radius-md;
    font-size: $font-size-xs;
    color: $danger;

    &-link {
      margin-left: auto;
      color: inherit;
    }
  }

  &__files {
    margin-top: $spacing-3;
    padding-top: $spacing-3;
    border-top: 1px solid rgba(255, 255, 255, 0.05);

    &-header {
      font-size: $font-size-xs;
      color: $gray-500;
      margin-bottom: $spacing-2;
    }

    &-list {
      max-height: 120px;
      overflow-y: auto;
    }
  }

  &__file {
    display: flex;
    align-items: center;
    gap: $spacing-2;
    padding: $spacing-1 0;

    &-name {
      font-size: $font-size-xs;
      color: $gray-300;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  &__toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: $spacing-1;
    padding: $spacing-2;
    margin-top: $spacing-2;
    background: transparent;
    border: none;
    color: $gray-400;
    font-size: $font-size-xs;
    cursor: pointer;
    transition: color $duration-normal;

    &:hover {
      color: $white;
    }
  }

  &__actions {
    flex-shrink: 0;
    margin-top: $spacing-3;
    padding-top: $spacing-3;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  &__btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: $spacing-2;
    padding: $spacing-3;
    background: var(--studio-accent);
    color: #11151d;
    border: none;
    border-radius: 12px;
    color: $white;
    font-size: $font-size-sm;
    font-weight: 600;
    cursor: pointer;
    transition: all $duration-normal;

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: none;
    }

    &--disabled,
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      background: $gray-700;
    }

    &--running {
      background: var(--el-color-warning);
      cursor: not-allowed;

      &:hover {
        transform: none;
        box-shadow: none;
      }
    }
  }

  &__rollback-btn,
  &__deploy-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: $spacing-2;
    padding: $spacing-2;
    margin-top: $spacing-2;
    background: transparent;
    border-radius: $radius-md;
    color: $gray-400;
    font-size: $font-size-xs;
    cursor: pointer;
    transition: all $duration-normal;

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &__rollback-btn {
    border: 1px solid rgba($danger, 0.3);

    &:hover:not(:disabled) {
      background: rgba($danger, 0.1);
      border-color: $danger;
      color: $danger;
    }
  }

  &__deploy-btn {
    border: 1px solid rgba($info, 0.3);

    &:hover:not(:disabled) {
      background: rgba($info, 0.1);
      border-color: $info;
      color: $info;
    }
  }

  &--collapsed {
    .workflow-panel__header {
      margin-bottom: 0;
    }
  }
}

.is-loading {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
  overflow: hidden;
}

.slide-enter-to,
.slide-leave-from {
  max-height: 300px;
}
</style>
