<template>
  <MainLayout>
    <div ref="viewRef" class="settings-view">
      <header class="settings-view__heading">
        <h1>设置</h1>
        <p>管理 AI 配置、仓库连接与账号权限。</p>
      </header>
      <div class="settings-view__body" data-scroll-region>
        <div class="settings-view__container">
          <CredentialsConfig class="settings-view__ai-config" />

          <GlassCard :hoverable="false" class="settings-view__card">
            <div class="settings-view__header">
              <h2 class="settings-view__title">仓库连接</h2>
            </div>

            <el-form :model="formData" label-position="top" class="settings-view__form">
              <el-form-item label="仓库所有者">
                <el-input v-model="formData.owner" placeholder="GitHub 用户名或组织名" />
              </el-form-item>

              <el-form-item label="仓库名称">
                <el-input v-model="formData.repo" placeholder="仓库名称" />
              </el-form-item>

              <div class="settings-view__row">
                <el-form-item label="默认分支" class="settings-view__row-item">
                  <el-input v-model="formData.branch" placeholder="main" />
                </el-form-item>
                <el-form-item label="Client ID" class="settings-view__row-item">
                  <el-input v-model="formData.clientId" placeholder="OAuth Client ID" />
                </el-form-item>
              </div>

              <el-form-item label="OAuth Worker URL">
                <el-input
                  v-model="formData.oauthWorkerUrl"
                  placeholder="https://your-oauth-worker.your-subdomain.workers.dev"
                />
              </el-form-item>

              <div class="settings-view__actions">
                <el-button @click="handleReset">重置默认</el-button>
                <el-button type="primary" :loading="validating" @click="handleSave">
                  验证并保存
                </el-button>
              </div>
            </el-form>

            <Transition name="studio-feedback">
              <div v-if="validationResult" class="settings-view__result">
                <el-alert
                  :title="validationResult.success ? '配置验证成功' : '配置验证失败'"
                  :type="validationResult.success ? 'success' : 'error'"
                  :description="validationResult.message"
                  show-icon
                  :closable="false"
                />
              </div>
            </Transition>
          </GlassCard>

          <GlassCard :hoverable="false" class="settings-view__card settings-view__card--status">
            <div class="settings-view__header">
              <h2 class="settings-view__title">当前状态</h2>
            </div>

            <div class="settings-view__status">
              <div v-if="authStore.isAuthenticated" class="settings-view__user">
                <el-avatar :size="48" :src="authStore.user?.avatar_url" />
                <div class="settings-view__user-info">
                  <span class="settings-view__user-name">{{
                    authStore.user?.name || authStore.user?.login
                  }}</span>
                  <span class="settings-view__user-login">@{{ authStore.user?.login }}</span>
                </div>
              </div>

              <div class="settings-view__status-list">
                <div class="settings-view__status-item">
                  <span class="settings-view__status-label">登录状态</span>
                  <el-tag :type="authStore.isAuthenticated ? 'success' : 'danger'" size="small">
                    {{ authStore.isAuthenticated ? '已登录' : '未登录' }}
                  </el-tag>
                </div>

                <div class="settings-view__status-item">
                  <span class="settings-view__status-label">权限级别</span>
                  <el-tag
                    :type="authStore.permissionChecked ? permissionTagType : 'info'"
                    size="small"
                    class="settings-view__permission-tag"
                  >
                    {{ authStore.permissionChecked ? permissionLabel : '检查中...' }}
                  </el-tag>
                </div>

                <div class="settings-view__status-item">
                  <span class="settings-view__status-label">目标仓库</span>
                  <a
                    :href="repoUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="settings-view__repo-link"
                  >
                    {{ configStore.config.owner }}/{{ configStore.config.repo }}
                  </a>
                </div>
              </div>

              <div class="settings-view__quick-actions">
                <a
                  :href="repoUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="settings-view__quick-btn"
                >
                  访问仓库
                </a>
                <a
                  href="https://github.com/settings/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="settings-view__quick-btn"
                >
                  管理 Token
                </a>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  </MainLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import MainLayout from '@/components/MainLayout.vue'
import GlassCard from '@/components/GlassCard.vue'
import CredentialsConfig from '@/components/ai/CredentialsConfig.vue'
import { useConfigStore } from '@/stores/config'
import { useAuthStore } from '@/stores/auth'

const configStore = useConfigStore()
const authStore = useAuthStore()

const viewRef = ref(null)
const validating = ref(false)
const validationResult = ref(null)

const formData = reactive({
  owner: configStore.config.owner,
  repo: configStore.config.repo,
  branch: configStore.config.branch,
  clientId: configStore.config.clientId,
  oauthWorkerUrl: configStore.config.oauthWorkerUrl
})

const permissionLabel = computed(() => {
  const labels = { admin: '管理员', write: '协作者', read: '只读', none: '无权限' }
  return labels[authStore.permissionLevel] || '未知'
})

const permissionTagType = computed(() => {
  const types = { admin: 'success', write: 'primary', read: 'warning', none: 'danger' }
  return types[authStore.permissionLevel] || 'info'
})

const repoUrl = computed(
  () => `https://github.com/${configStore.config.owner}/${configStore.config.repo}`
)

async function handleSave() {
  if (!configStore.isValidOwnerName(formData.owner)) {
    ElMessage.error('仓库所有者名称格式不正确')
    return
  }
  if (!configStore.isValidRepoName(formData.repo)) {
    ElMessage.error('仓库名称格式不正确')
    return
  }

  validating.value = true
  validationResult.value = null

  try {
    configStore.setConfig({
      owner: formData.owner,
      repo: formData.repo,
      branch: formData.branch,
      clientId: formData.clientId,
      oauthWorkerUrl: formData.oauthWorkerUrl
    })

    const valid = await configStore.validateConfig()
    if (valid) {
      validationResult.value = { success: true, message: '仓库访问正常，配置已保存' }
      ElMessage.success('配置保存成功')
      await authStore.checkPermission(formData.owner, formData.repo)
    } else {
      validationResult.value = {
        success: false,
        message: configStore.validationError || '验证失败'
      }
    }
  } catch (error) {
    validationResult.value = { success: false, message: error.message || '验证失败' }
  } finally {
    validating.value = false
  }
}

function handleReset() {
  configStore.resetConfig()
  formData.owner = configStore.config.owner
  formData.repo = configStore.config.repo
  formData.branch = configStore.config.branch
  formData.clientId = configStore.config.clientId
  formData.oauthWorkerUrl = configStore.config.oauthWorkerUrl
  validationResult.value = null
  ElMessage.success('已重置为默认配置')
}

onMounted(async () => {
  if (authStore.isAuthenticated && !authStore.permissionChecked) {
    await authStore.checkPermission(configStore.config.owner, configStore.config.repo)
  }
})
</script>

<style scoped lang="scss">
.settings-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  gap: 24px;
  padding: 0;
  color: var(--studio-text, #f3f4f6);
}
.settings-view__body {
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 1060px;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  padding-right: 4px;
}
.settings-view__heading {
  flex-shrink: 0;
  width: 100%;
  max-width: 1060px;
}
.settings-view__container {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 24px;
  width: 100%;
  max-width: 1060px;
  align-items: start;
}
.settings-view__ai-config {
  grid-column: 1 / -1;
}
.settings-view__heading h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.settings-view__heading p {
  margin: 8px 0 0;
  color: var(--studio-muted, #a1a6b0);
  font-size: 13px;
}
.settings-view__header {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--studio-border, #30343b);
}
.settings-view__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.settings-view__form :deep(.el-form-item) {
  margin-bottom: 18px;
}
.settings-view__form :deep(.el-form-item__label) {
  color: var(--studio-muted, #a1a6b0);
  font-size: 12px;
  padding-bottom: 6px;
}
.settings-view__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.settings-view__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--studio-border, #30343b);
}
.settings-view__actions .el-button + .el-button {
  margin-left: 0;
}
.settings-view__result {
  margin-top: 16px;
}
.settings-view__status {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.settings-view__user {
  display: flex;
  align-items: center;
  gap: 12px;
}
.settings-view__user-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.settings-view__user-name {
  font-size: 14px;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.settings-view__user-login {
  color: var(--studio-muted, #a1a6b0);
  font-size: 12px;
}
.settings-view__status-list {
  display: flex;
  flex-direction: column;
}
.settings-view__status-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid var(--studio-border, #30343b);
}
.settings-view__status-item:last-child {
  flex-direction: column;
  align-items: flex-start;
  border-bottom: 0;
}
.settings-view__status-label {
  font-size: 12px;
  color: var(--studio-muted, #a1a6b0);
}
.settings-view__repo-link {
  font-size: 12px;
  line-height: 1.6;
  color: var(--studio-accent, #a8c7fa);
  text-decoration: none;
  overflow-wrap: anywhere;
}
.settings-view__quick-actions {
  display: flex;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid var(--studio-border, #30343b);
}
.settings-view__quick-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--studio-border, #30343b);
  border-radius: 999px;
  color: var(--studio-text, #f3f4f6);
  font-size: 12px;
  text-decoration: none;
  background: var(--studio-raised, #22252a);
}
.settings-view__quick-btn:hover {
  border-color: var(--studio-muted, #a1a6b0);
}
.settings-view a:focus-visible {
  outline: 2px solid var(--studio-accent, #a8c7fa);
  outline-offset: 3px;
}
@media (max-width: 850px) {
  .settings-view__container {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 600px) {
  .settings-view {
    padding: 0;
  }
  .settings-view__row {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .fade-enter-active,
  .fade-leave-active {
    transition: none;
  }
}
</style>
