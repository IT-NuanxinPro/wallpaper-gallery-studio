<template>
  <main class="studio-login">
    <section class="studio-login__window" aria-labelledby="login-title">
      <header class="studio-login__header">
        <span class="studio-login__brand">Wallpaper Gallery <span>Studio</span></span>
        <div class="studio-login__steps" aria-label="登录步骤">
          <span :class="{ 'is-current': !sessionReady }">1 登录 GitHub</span
          ><el-icon><ArrowRight /></el-icon
          ><span :class="{ 'is-current': sessionReady }">2 选择仓库</span>
        </div>
      </header>
      <div
        class="studio-login__body"
        data-scroll-region
        tabindex="0"
        aria-label="登录与仓库选择，可滚动"
      >
        <Transition name="studio-feedback"
          ><el-alert
            v-if="loginError"
            :title="loginError"
            type="error"
            :closable="false"
            show-icon
            class="studio-login__error"
        /></Transition>
        <Transition name="studio-panel" mode="out-in">
          <div v-if="restoring" key="restoring" class="studio-login__checking" role="status">
            <el-icon class="is-loading"><Loading /></el-icon><span>正在验证 GitHub 登录…</span>
          </div>
          <div
            v-else-if="sessionReady && authStore.isAuthenticated"
            key="repositories"
            class="studio-login__panel"
          >
            <div class="studio-login__intro">
              <h1 id="login-title">选择你的仓库</h1>
              <p>
                已登录
                {{
                  authStore.user?.name || authStore.user?.login
                }}。从可访问的仓库中选择内容保存位置。
              </p>
            </div>
            <Transition name="studio-panel" mode="out-in">
              <div v-if="editingConfig" key="advanced">
                <RepositoryConfigForm
                  v-model="configDraft"
                  :busy="busy"
                  submit-label="验证仓库并保存"
                  @submit="useManualRepository"
                  ><template #actions
                    ><el-button :disabled="busy" @click="editingConfig = false"
                      >返回仓库列表</el-button
                    ></template
                  ></RepositoryConfigForm
                >
              </div>
              <div v-else key="picker">
                <div
                  v-if="configStore.isConfigured && !selectedRepository"
                  class="studio-login__repository"
                >
                  <el-icon><FolderOpened /></el-icon>
                  <div>
                    <span>上次使用</span
                    ><strong>{{ configStore.config.owner }}/{{ configStore.config.repo }}</strong
                    ><small>分支 {{ configStore.config.branch }}</small>
                  </div>
                  <el-button text :disabled="busy" @click="continuePrevious"
                    >继续上次仓库</el-button
                  >
                </div>
                <RepositoryPicker
                  :token="authStore.token"
                  :selected-id="selectedRepository?.id || ''"
                  @select="chooseRepository"
                />
                <el-collapse-transition
                  ><form
                    v-if="selectedRepository"
                    class="studio-login__selection"
                    data-testid="use-repository"
                    @submit.prevent="useSelectedRepository"
                  >
                    <strong>{{ selectedRepository.fullName }}</strong>
                    <label for="repository-branch">使用分支</label
                    ><el-input
                      id="repository-branch"
                      v-model="selectedBranch"
                      aria-label="使用分支"
                      :disabled="busy"
                      placeholder="仓库默认分支"
                    />
                    <p>
                      {{
                        selectedRepository.archived
                          ? '此仓库已归档，将以只读模式打开。'
                          : '已自动填入此仓库的默认分支，可按需修改。'
                      }}
                    </p>
                    <el-button
                      type="primary"
                      native-type="submit"
                      :loading="busy"
                      :disabled="busy || !selectedBranch.trim()"
                      >{{
                        selectedRepository.archived ? '以只读方式选择' : '使用此仓库'
                      }}</el-button
                    >
                  </form></el-collapse-transition
                >
                <el-collapse-transition
                  ><div v-if="readOnlyReady" class="studio-login__readonly" role="status">
                    <p>此账号仅有读取权限，可以浏览内容，不能上传或发布。</p>
                    <el-button type="primary" data-testid="enter-readonly" @click="enterWorkspace"
                      >以只读模式进入</el-button
                    >
                  </div></el-collapse-transition
                >
                <div class="studio-login__picker-actions">
                  <el-button link :disabled="busy" @click="openAdvanced">高级手动配置</el-button
                  ><el-button text :disabled="busy" @click="logout">更换账号</el-button>
                </div>
              </div>
            </Transition>
          </div>
          <div v-else key="identity" class="studio-login__panel">
            <div class="studio-login__intro">
              <h1 id="login-title">登录 GitHub</h1>
              <p>登录后自动读取你可以访问的仓库，无需手动填写仓库地址。</p>
            </div>
            <el-button
              v-if="configStore.isOAuthConfigured"
              class="studio-login__oauth"
              type="primary"
              :loading="oauthLoading"
              :disabled="busy"
              @click="startOAuth"
              >使用 GitHub 登录</el-button
            >
            <div v-else class="studio-login__oauth-hint">
              <span>此部署尚未配置 GitHub OAuth，可先使用 Token 登录。</span
              ><el-button
                link
                :disabled="busy"
                @click="showConnectionConfig = !showConnectionConfig"
                >{{ showConnectionConfig ? '收起 OAuth 配置' : '配置 GitHub OAuth' }}</el-button
              >
            </div>
            <el-collapse-transition
              ><form
                v-if="showConnectionConfig"
                class="studio-login__connection"
                data-testid="oauth-config"
                @submit.prevent="saveConnection"
              >
                <p>填写属于此部署的 OAuth App，仓库将在登录后选择。</p>
                <label for="oauth-client">OAuth Client ID</label
                ><el-input
                  id="oauth-client"
                  v-model="connection.clientId"
                  aria-label="OAuth Client ID"
                  :disabled="busy"
                /><label for="oauth-worker">OAuth Worker 地址</label
                ><el-input
                  id="oauth-worker"
                  v-model="connection.oauthWorkerUrl"
                  aria-label="OAuth Worker 地址"
                  :disabled="busy"
                  placeholder="https://oauth.example.com"
                /><el-button native-type="submit" :disabled="busy">保存 OAuth 配置</el-button>
              </form></el-collapse-transition
            >
            <form
              data-testid="token-login"
              class="studio-login__token"
              @submit.prevent="loginWithToken"
            >
              <label for="github-token">Personal Access Token</label
              ><el-input
                id="github-token"
                v-model="tokenInput"
                aria-label="GitHub Token"
                type="password"
                autocomplete="off"
                placeholder="粘贴 GitHub Token"
                :disabled="busy"
              />
              <p>Token 的访问范围决定可显示的仓库。选择仓库后会再次验证权限。</p>
              <el-button
                :type="configStore.isOAuthConfigured ? 'default' : 'primary'"
                native-type="submit"
                :loading="busy"
                :disabled="!tokenInput.trim() || busy"
                >使用 Token 登录</el-button
              >
            </form>
            <a
              class="studio-login__token-help"
              href="https://github.com/settings/tokens"
              target="_blank"
              rel="noopener noreferrer"
              >在 GitHub 管理 Token <el-icon><TopRight /></el-icon
            ></a>
          </div>
        </Transition>
      </div>
      <footer class="studio-login__footer">
        <el-icon><Lock /></el-icon><span>仓库列表仅在当前页面读取。Token 不会写入仓库配置。</span>
      </footer>
    </section>
  </main>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, FolderOpened, Loading, Lock, TopRight } from '@element-plus/icons-vue'
import RepositoryConfigForm from '@/components/settings/RepositoryConfigForm.vue'
import RepositoryPicker from '@/components/settings/RepositoryPicker.vue'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useUploadSessionStore } from '@/stores/upload-session'
import { changesRepository, hasPendingRepositoryWrites } from '@/utils/repository-switch'
import { githubService } from '@/services/github'
import { getAuthUrl } from '@/config/oauth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const configStore = useConfigStore()
const uploadSession = useUploadSessionStore()
const editingConfig = ref(false)
const configDraft = ref({ ...configStore.config })
const showConnectionConfig = ref(false)
const connection = ref({
  clientId: configStore.config.clientId || '',
  oauthWorkerUrl: configStore.config.oauthWorkerUrl || ''
})
const loginError = ref('')
const busy = ref(false)
const restoring = ref(false)
const oauthLoading = ref(false)
const tokenInput = ref('')
const sessionReady = ref(false)
const selectedRepository = ref(null)
const selectedBranch = ref('')
const readOnlyReady = ref(false)

function loginDestination() {
  const requested = route.query.redirect
  if (
    typeof requested !== 'string' ||
    !requested.startsWith('/') ||
    requested.startsWith('//') ||
    requested.includes('\\') ||
    [...requested].some(
      character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127
    )
  )
    return '/upload'
  try {
    const url = new URL(requested, window.location.origin)
    if (
      url.origin !== window.location.origin ||
      /^\/(login|callback)(\/|$)/i.test(decodeURIComponent(url.pathname))
    )
      return '/upload'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/upload'
  }
}
function enterWorkspace() {
  return router.replace(loginDestination())
}
function clearAuthentication() {
  sessionReady.value = false
  readOnlyReady.value = false
  selectedRepository.value = null
  authStore.logout()
  githubService.setToken(null)
}
function logout() {
  clearAuthentication()
  loginError.value = ''
  tokenInput.value = ''
  editingConfig.value = false
}
async function loginWithToken() {
  const token = tokenInput.value.trim()
  if (busy.value || !token) return
  busy.value = true
  loginError.value = ''
  try {
    githubService.setToken(token)
    const user = await githubService.getCurrentUser()
    authStore.setToken(token)
    authStore.setUser(user)
    authStore.permissionLevel = 'none'
    authStore.permissionChecked = false
    tokenInput.value = ''
    sessionReady.value = true
  } catch {
    clearAuthentication()
    tokenInput.value = ''
    loginError.value = '无法验证 GitHub 身份，请检查 Token 和网络后重试。'
  } finally {
    busy.value = false
  }
}
async function restoreSession() {
  if (!authStore.token) return
  restoring.value = true
  try {
    if (!(await authStore.validateToken())) throw new Error('INVALID_SESSION')
    sessionReady.value = true
  } catch {
    clearAuthentication()
    loginError.value = '当前 GitHub 登录已失效，请重新登录。'
  } finally {
    restoring.value = false
  }
}
function chooseRepository(repository) {
  if (busy.value) return
  selectedRepository.value = repository
  selectedBranch.value = repository.defaultBranch || 'main'
  readOnlyReady.value = false
  loginError.value = ''
}
function connectionForTarget(owner, repo) {
  const current = configStore.config
  const sameTarget =
    current.owner?.toLowerCase() === owner.toLowerCase() &&
    current.repo?.toLowerCase() === repo.toLowerCase()
  return {
    ...current,
    ...(sameTarget
      ? {}
      : {
          workflowOwner: '',
          workflowRepo: '',
          frontendOwner: '',
          frontendRepo: '',
          videoApiUrl: ''
        }),
    owner,
    repo
  }
}
async function verifyAndUse(config, archived = false) {
  if (busy.value || !sessionReady.value) return
  if (changesRepository(configStore.config, config) && hasPendingRepositoryWrites(uploadSession)) {
    loginError.value = '请先回到原仓库完成或移除当前图片任务，再切换仓库'
    return
  }
  const validationError = configStore.validateConfigInput(config)
  if (validationError) {
    loginError.value = validationError
    return
  }
  busy.value = true
  loginError.value = ''
  readOnlyReady.value = false
  const token = authStore.token
  const revision = configStore.configRevision
  try {
    githubService.setToken(token)
    let level = await githubService.checkRepoAccess(config.owner, config.repo)
    if (!['admin', 'write', 'read'].includes(level)) throw new Error('REPOSITORY_ACCESS_DENIED')
    if (archived) level = 'read'
    if (!(await configStore.validateConfig(config))) throw new Error('BRANCH_UNAVAILABLE')
    if (token !== authStore.token || revision !== configStore.configRevision)
      throw new Error('CONFIG_CHANGED')
    configStore.setConfig(config)
    authStore.permissionLevel = level
    authStore.permissionChecked = true
    editingConfig.value = false
    if (level === 'read') readOnlyReady.value = true
    else await enterWorkspace()
  } catch (error) {
    authStore.permissionLevel = 'none'
    authStore.permissionChecked = false
    if (error.status === 401 || error.type === 'TOKEN_EXPIRED') clearAuthentication()
    loginError.value =
      error.message === 'REPOSITORY_ACCESS_DENIED'
        ? '当前账号无法访问此仓库，请选择其他仓库或调整访问权限。'
        : error.message === 'BRANCH_UNAVAILABLE'
          ? '所选分支不存在或无法读取，请检查后重试'
          : '无法验证或保存目标仓库，请检查分支、网络与权限后重试。'
  } finally {
    busy.value = false
  }
}
function useSelectedRepository() {
  if (!selectedRepository.value) return
  const repository = selectedRepository.value
  return verifyAndUse(
    {
      ...connectionForTarget(repository.owner, repository.name),
      branch: selectedBranch.value.trim()
    },
    repository.archived
  )
}
function continuePrevious() {
  const { owner, repo, branch } = configStore.config
  chooseRepository({
    id: `previous:${owner}/${repo}`,
    owner,
    name: repo,
    fullName: `${owner}/${repo}`,
    defaultBranch: branch
  })
  return useSelectedRepository()
}
function openAdvanced() {
  const repository = selectedRepository.value
  configDraft.value = repository
    ? {
        ...connectionForTarget(repository.owner, repository.name),
        branch: selectedBranch.value || repository.defaultBranch
      }
    : { ...configStore.config }
  editingConfig.value = true
  loginError.value = ''
}
function useManualRepository(config) {
  return verifyAndUse(config)
}
function saveConnection() {
  try {
    configStore.setConnectionConfig({
      clientId: connection.value.clientId.trim(),
      oauthWorkerUrl: connection.value.oauthWorkerUrl.trim()
    })
    showConnectionConfig.value = false
    loginError.value = ''
  } catch {
    loginError.value = 'OAuth 配置无效，请同时填写 Client ID 和正确的 Worker 地址。'
  }
}
function startOAuth() {
  if (busy.value || !configStore.isOAuthConfigured) return
  try {
    oauthLoading.value = true
    window.location.assign(getAuthUrl())
  } catch {
    oauthLoading.value = false
    loginError.value = 'GitHub OAuth 配置不完整，请检查 Client ID 和 Worker 地址。'
  }
}
watch(
  () => [route.query.setup, route.query.select_repo],
  () => {
    editingConfig.value = false
    readOnlyReady.value = false
    selectedRepository.value = null
  }
)
watch(selectedBranch, () => {
  readOnlyReady.value = false
})
onMounted(restoreSession)
</script>

<style scoped lang="scss">
.studio-login {
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  padding: 32px;
  color: var(--studio-text, #f4f6fb);
  background:
    radial-gradient(ellipse at 12% 5%, rgba(63, 101, 159, 0.18), transparent 50%),
    radial-gradient(ellipse at 95% 95%, rgba(87, 80, 130, 0.14), transparent 50%), #11151d;
  &__window {
    display: flex;
    flex-direction: column;
    width: min(100%, 630px);
    max-height: calc(100dvh - 64px);
    min-height: 0;
    overflow: hidden;
    background: rgba(28, 33, 44, 0.88);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 26px;
    box-shadow:
      inset 0 1px rgba(255, 255, 255, 0.1),
      0 26px 80px rgba(0, 0, 0, 0.35);
  }
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: none;
    gap: 18px;
    padding: 22px 28px;
    background: rgba(108, 126, 157, 0.08);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(24px) saturate(1.3);
  }
  &__brand {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }
  &__brand > span {
    margin-left: 5px;
    font-weight: 400;
    color: #aab8ca;
  }
  &__steps {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    color: #919eb2;
    white-space: nowrap;
  }
  &__steps .is-current {
    color: #cce2ff;
  }
  &__steps .el-icon {
    font-size: 10px;
  }
  &__body {
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    padding: 30px 36px;
  }
  &__intro {
    margin-bottom: 26px;
  }
  &__intro-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 43px;
    height: 43px;
    border-radius: 14px;
    background: rgba(125, 183, 255, 0.12);
    color: #a8cfff;
    font-size: 23px;
    margin-bottom: 18px;
  }
  h1 {
    margin: 0 0 9px;
    font-size: 27px;
    font-weight: 650;
    letter-spacing: -0.03em;
    line-height: 1.3;
  }
  &__intro p {
    margin: 0;
    color: #b1b9c9;
    font-size: 13px;
    line-height: 1.7;
  }
  &__repository {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border-radius: 17px;
    background: rgba(112, 137, 174, 0.1);
    margin-bottom: 24px;
  }
  &__repository > .el-icon {
    font-size: 22px;
    color: #aecff6;
    flex: none;
  }
  &__repository > div {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
    gap: 5px;
  }
  &__repository span,
  &__repository small {
    color: #a9b6c9;
    font-size: 11px;
  }
  &__repository strong {
    font-size: 14px;
    font-weight: 550;
    overflow-wrap: anywhere;
  }
  &__repository :deep(.el-button) {
    color: #bcd9ff;
    padding-inline: 8px;
  }
  &__selection,
  &__connection {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 18px;
    padding: 17px;
    border-radius: 17px;
    background: rgba(125, 183, 255, 0.07);
  }
  &__selection strong {
    font-size: 13px;
    font-weight: 550;
    overflow-wrap: anywhere;
  }
  &__selection label,
  &__connection label {
    font-size: 12px;
    color: #d4deeb;
  }
  &__selection p,
  &__connection p,
  &__readonly p {
    font-size: 11px;
    line-height: 1.6;
    color: #a8b6ca;
    margin: 0;
  }
  &__selection :deep(.el-input__wrapper),
  &__connection :deep(.el-input__wrapper) {
    background: rgba(9, 14, 24, 0.3);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.13);
    border-radius: 10px;
    min-height: 36px;
  }
  &__selection :deep(.el-input__inner),
  &__connection :deep(.el-input__inner) {
    color: #f4f6fb;
  }
  &__connection {
    margin: 0 0 22px;
  }
  &__selection > .el-button,
  &__connection > .el-button {
    border-radius: 999px;
    margin-top: 4px;
  }
  &__readonly {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 0 4px;
  }
  &__picker-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 18px;
  }
  &__error {
    margin-bottom: 20px;
  }
  &__checking {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 24px 0;
    font-size: 13px;
    color: #b1b9c9;
  }
  &__oauth {
    width: 100%;
    min-height: 40px;
    border-radius: 999px;
    margin-bottom: 22px;
  }
  &__oauth-hint {
    display: flex;
    align-items: start;
    flex-direction: column;
    gap: 7px;
    margin: 0 0 24px;
    color: #b1b9c9;
    font-size: 12px;
    line-height: 1.6;
  }
  &__token {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  &__token label {
    font-size: 12px;
    color: #d4deeb;
  }
  &__token p {
    font-size: 11px;
    color: #9eacbf;
    line-height: 1.65;
    margin: 0 0 8px;
  }
  &__token :deep(.el-input__wrapper) {
    min-height: 42px;
    border-radius: 12px;
    background: rgba(9, 14, 24, 0.3);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
  }
  &__token :deep(.el-input__inner) {
    color: #f4f6fb;
  }
  &__token :deep(.el-button) {
    border-radius: 999px;
    min-height: 40px;
  }
  &__token-help {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: 20px;
    font-size: 12px;
    color: #bcd9ff;
    text-decoration: none;
  }
  &__account {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  &__account > .el-button {
    margin: 0;
    border-radius: 999px;
  }
  &__identity {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 6px 0 12px;
  }
  &__identity > div {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  &__identity strong {
    font-size: 16px;
  }
  &__identity span {
    font-size: 12px;
    color: #b1b9c9;
    line-height: 1.6;
  }
  &__footer {
    flex: none;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    padding: 16px 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 10px;
    line-height: 1.6;
    color: #96a4b8;
  }
  &__footer .el-icon {
    flex: none;
    font-size: 12px;
  }
  button:focus-visible,
  a:focus-visible,
  &__body:focus-visible {
    outline: 2px solid #7db7ff;
    outline-offset: 3px;
  }
  @media (max-width: 600px) {
    padding: 14px;
    &__window {
      max-height: calc(100dvh - 28px);
      border-radius: 23px;
    }
    &__header {
      padding: 20px;
      flex-wrap: wrap;
      gap: 11px;
    }
    &__body {
      padding: 24px 22px;
    }
    &__footer {
      padding: 14px 20px;
      justify-content: flex-start;
    }
    h1 {
      font-size: 25px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
}
</style>
