<template>
  <div class="studio-shell">
    <a class="studio-shell__skip" href="#studio-main">跳到工作区</a>
    <aside class="studio-shell__sidebar">
      <router-link
        to="/upload"
        class="studio-shell__brand"
        aria-label="Wallpaper Gallery Studio 首页"
      >
        <strong>Studio</strong>
        <span>Wallpaper Gallery</span>
      </router-link>
      <nav class="studio-shell__navigation" aria-label="工作台导航">
        <span class="studio-shell__group-label">工作空间</span>
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="studio-shell__nav-item"
          :class="{ 'is-active': isActive(item.path) }"
          :aria-current="isActive(item.path) ? 'page' : undefined"
        >
          <el-icon aria-hidden="true"><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
          <span v-if="isActive(item.path)" class="studio-shell__selection" aria-hidden="true" />
        </router-link>
        <span class="studio-shell__group-label studio-shell__group-label--secondary">管理</span>
        <router-link
          to="/settings"
          class="studio-shell__nav-item"
          :class="{ 'is-active': isActive('/settings') }"
          :aria-current="isActive('/settings') ? 'page' : undefined"
        >
          <el-icon><Setting /></el-icon><span>设置</span>
        </router-link>
      </nav>
      <div class="studio-shell__sidebar-footer">
        <router-link to="/settings#ai-config" class="studio-shell__ai">
          <el-icon><Cpu /></el-icon>
          <span
            ><strong :title="credentials.selectedModel">{{
              credentials.selectedModel || '未选择模型'
            }}</strong
            ><small>{{
              credentials.hasModelReady
                ? '当前会话已配置'
                : credentials.hasCredentials
                  ? '请选择分析模型'
                  : '配置你的 API Key'
            }}</small></span
          >
          <el-icon class="studio-shell__ai-arrow"><ArrowRight /></el-icon>
        </router-link>
        <el-dropdown trigger="click" placement="top-start" @command="handleCommand">
          <button type="button" class="studio-shell__user" aria-label="账户菜单">
            <el-avatar :size="32" :src="authStore.user?.avatar_url">{{
              authStore.user?.login?.slice(0, 1).toUpperCase()
            }}</el-avatar>
            <span class="studio-shell__user-info"
              ><strong>{{ authStore.user?.login }}</strong
              ><small>{{
                authStore.permissionChecked ? permissionLabel : '正在检查权限'
              }}</small></span
            >
            <el-icon><ArrowDown /></el-icon>
          </button>
          <template #dropdown
            ><el-dropdown-menu>
              <el-dropdown-item command="repository" :icon="FolderOpened"
                >切换仓库</el-dropdown-item
              >
              <el-dropdown-item command="settings" :icon="Setting">设置与 AI 配置</el-dropdown-item>
              <el-dropdown-item command="logout" :icon="SwitchButton" divided
                >退出登录</el-dropdown-item
              >
            </el-dropdown-menu></template
          >
        </el-dropdown>
      </div>
    </aside>
    <section class="studio-shell__window">
      <header class="studio-shell__toolbar">
        <div class="studio-shell__location">
          <el-icon><component :is="currentItem.icon" /></el-icon
          ><span>{{ currentItem.label }}</span>
        </div>
        <router-link
          to="/settings#ai-config"
          class="studio-shell__session"
          :class="{ 'is-connected': credentials.hasModelReady }"
        >
          <el-icon><Key /></el-icon
          ><span>{{ credentials.hasModelReady ? 'AI 会话已就绪' : '配置 AI' }}</span>
        </router-link>
        <el-dropdown trigger="click" placement="bottom-end" @command="handleCommand">
          <button
            type="button"
            class="studio-shell__tool-button"
            aria-label="工作台菜单"
            title="设置与账户"
          >
            <el-icon><Setting /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="repository" :icon="FolderOpened"
                >切换仓库</el-dropdown-item
              >
              <el-dropdown-item command="settings" :icon="Setting">设置与 AI 配置</el-dropdown-item>
              <el-dropdown-item command="logout" :icon="SwitchButton" divided
                >退出登录</el-dropdown-item
              >
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </header>
      <main id="studio-main" class="studio-shell__main" tabindex="-1">
        <Transition name="studio-page" appear>
          <div :key="route.path" class="studio-shell__scene"><slot /></div>
        </Transition>
      </main>
    </section>
    <nav class="studio-shell__dock" aria-label="移动工作台导航">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        :class="{ 'is-active': isActive(item.path) }"
        :aria-current="isActive(item.path) ? 'page' : undefined"
      >
        <el-icon><component :is="item.icon" /></el-icon><span>{{ item.shortLabel }}</span>
      </router-link>
    </nav>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  VideoCamera,
  Clock,
  Setting,
  ArrowDown,
  ArrowRight,
  SwitchButton,
  Picture,
  FolderOpened,
  Cpu,
  Key
} from '@element-plus/icons-vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { useCredentialsStore } from '@/stores/credentials'
import { useUploadSessionStore } from '@/stores/upload-session'
import { hasPendingRepositoryWrites } from '@/utils/repository-switch'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const credentials = useCredentialsStore()
const uploadSession = useUploadSessionStore()
const permissionLabel = computed(
  () =>
    ({ admin: '管理员', write: '协作者', read: '只读', none: '无权限' })[
      authStore.permissionLevel
    ] || '未知'
)
const navItems = [
  { path: '/upload', label: '图片上传', shortLabel: '图片', icon: Picture },
  { path: '/video-upload', label: '视频工作台', shortLabel: '视频', icon: VideoCamera },
  { path: '/ai-assistant', label: 'AI 工坊', shortLabel: '工坊', icon: Cpu },
  { path: '/history', label: '上传历史', shortLabel: '历史', icon: Clock }
]
const currentItem = computed(
  () => navItems.find(item => isActive(item.path)) || { label: '设置', icon: Setting }
)
function isActive(path) {
  return route.path === path
}
async function handleCommand(command) {
  if (command === 'repository' && hasPendingRepositoryWrites(uploadSession)) {
    ElMessage.warning('请先完成或移除当前图片任务，再切换仓库')
    return
  }
  if (uploadSession.uploading || uploadSession.metadataStatus === 'uploading') {
    ElMessage.warning('图片正在提交，请完成后再切换配置或账号')
    return
  }
  if (command === 'logout') {
    try {
      await ElMessageBox.confirm('确定要退出登录吗？', '退出确认', {
        confirmButtonText: '退出登录',
        cancelButtonText: '取消'
      })
      authStore.logout()
      ElMessage.success('已退出登录')
      router.push('/login')
    } catch {
      return
    }
  } else if (command === 'settings') router.push('/settings')
  else if (command === 'repository') router.push('/login?select_repo=1')
}
</script>

<style scoped lang="scss">
.studio-shell {
  display: grid;
  grid-template-columns: 216px minmax(0, 1fr);
  gap: 10px;
  height: 100vh;
  height: 100dvh;
  max-height: 100dvh;
  padding: 12px;
  overflow: hidden;
  color: var(--studio-text);
  background:
    radial-gradient(ellipse at 0 25%, rgba(59, 112, 146, 0.4), transparent 46%),
    radial-gradient(ellipse at 100% 100%, rgba(87, 82, 148, 0.2), transparent 45%),
    linear-gradient(150deg, #172734, #141b29 56%, #151828);
  &__skip {
    position: fixed;
    top: 8px;
    left: 16px;
    z-index: 1000;
    transform: translateY(-160%);
    background: var(--studio-raised);
    color: var(--studio-text);
    padding: 12px 16px;
    border-radius: 14px;
    &:focus {
      transform: none;
    }
  }
  &__sidebar {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    padding: 30px 12px 12px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 26px;
    background: rgba(44, 58, 75, 0.38);
    backdrop-filter: blur(50px) saturate(160%);
    -webkit-backdrop-filter: blur(50px) saturate(160%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.12),
      0 8px 30px rgba(0, 0, 0, 0.12);
  }
  &__brand {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0 14px 28px;
    color: var(--studio-text);
    text-decoration: none;
    strong {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.035em;
    }
    span {
      color: #bcc8d8;
      font-size: 11px;
      letter-spacing: 0.01em;
    }
  }
  &__navigation {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }
  &__group-label {
    padding: 0 14px 7px;
    color: #a9b6c8;
    font-size: 11px;
    font-weight: 550;
    &--secondary {
      margin-top: 24px;
    }
  }
  &__nav-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 42px;
    padding: 10px 14px;
    border-radius: 13px;
    text-decoration: none;
    color: #d2dbe8;
    font-size: 13px;
    white-space: nowrap;
    isolation: isolate;
    transition:
      color 180ms ease,
      background-color 180ms ease,
      box-shadow 180ms ease;
    .el-icon {
      font-size: 18px;
      color: #9cc8ff;
    }
    &:hover {
      background: rgba(255, 255, 255, 0.07);
      color: #fff;
    }
    &.is-active {
      background: linear-gradient(180deg, rgba(185, 210, 244, 0.21), rgba(166, 196, 235, 0.13));
      color: #fff;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.16),
        0 3px 8px rgba(0, 0, 0, 0.08);
    }
    &.is-active .el-icon {
      color: #b5d8ff;
    }
  }
  &__selection {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    margin-left: auto;
    background: #d7e8ff;
  }
  &__sidebar-footer {
    flex-shrink: 0;
    margin-top: auto;
    padding-top: 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    .el-dropdown {
      width: 100%;
    }
  }
  &__ai {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.09);
    text-decoration: none;
    color: #a9c9f0;
    > .el-icon {
      font-size: 18px;
      flex-shrink: 0;
    }
    span {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 11px;
      color: #d7e2ef;
      font-weight: 550;
    }
    small {
      font-size: 10px;
      color: #b1bdce;
    }
  }
  &__ai-arrow {
    margin-left: auto;
    font-size: 12px !important;
  }
  &__user {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 48px;
    padding: 8px 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    color: #dce4f0;
    background: rgba(255, 255, 255, 0.05);
    font: inherit;
    cursor: pointer;
    > .el-icon {
      font-size: 11px;
      margin-left: auto;
    }
    .el-avatar {
      background: rgba(157, 187, 227, 0.2);
      color: #e0eeff;
      font-size: 13px;
    }
    &:hover,
    &[aria-expanded='true'] {
      background: rgba(255, 255, 255, 0.1);
    }
  }
  &__user-info {
    display: flex;
    flex-direction: column;
    align-items: start;
    gap: 4px;
    min-width: 0;
    strong {
      font-size: 11px;
      font-weight: 550;
      max-width: 112px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    small {
      font-size: 10px;
      color: #adbbcd;
    }
  }
  &__window {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 26px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(17, 22, 32, 0.72);
    box-shadow:
      0 12px 36px rgba(0, 0, 0, 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
  }
  &__toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 22px;
    flex: 0 0 auto;
    min-height: 64px;
  }
  &__location {
    display: flex;
    align-items: center;
    gap: 9px;
    color: #cad4e2;
    font-size: 12px;
    font-weight: 500;
    .el-icon {
      font-size: 17px;
      color: #9dacc0;
    }
  }
  &__session,
  &__tool-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 34px;
    padding: 0 13px;
    border-radius: 999px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.045));
    color: #d2dcec;
    text-decoration: none;
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 3px 8px rgba(0, 0, 0, 0.1);
    transition:
      background-color 180ms ease,
      transform 180ms ease;
    &:hover {
      background-color: rgba(255, 255, 255, 0.08);
    }
    &:active {
      transform: scale(0.96);
    }
  }
  &__session {
    margin-left: auto;
    font-size: 11px;
    &.is-connected {
      color: #9ed6c1;
    }
  }
  &__tool-button {
    width: 34px;
    padding: 0;
    font-size: 16px;
  }
  &__main {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    padding: 10px 24px 24px;
  }
  &__scene {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  &__dock {
    display: none;
  }
  @media (max-width: 1180px) and (min-width: 761px) {
    grid-template-columns: 176px minmax(0, 1fr);
    gap: 8px;
    padding: 8px;
    &__sidebar {
      padding-inline: 8px;
    }
    &__brand {
      padding-inline: 12px;
      strong {
        font-size: 25px;
      }
    }
    &__nav-item {
      padding-inline: 12px;
      gap: 8px;
      font-size: 12px;
    }
    &__main {
      padding: 8px 18px 18px;
    }
    &__user-info strong {
      max-width: 85px;
    }
  }
  @media (max-width: 760px) {
    display: block;
    padding: 0;
    &__sidebar {
      display: none;
    }
    &__window {
      height: 100%;
      border: 0;
      border-radius: 0;
      background: rgba(17, 22, 32, 0.65);
    }
    &__toolbar {
      min-height: 58px;
      padding: 10px 18px;
    }
    &__main {
      padding: 6px 16px calc(98px + env(safe-area-inset-bottom));
    }
    &__dock {
      position: fixed;
      display: flex;
      align-items: center;
      gap: 3px;
      bottom: calc(14px + env(safe-area-inset-bottom));
      left: 50%;
      transform: translateX(-50%);
      z-index: 100;
      width: min(356px, calc(100% - 36px));
      padding: 5px;
      border: 1px solid rgba(255, 255, 255, 0.23);
      border-radius: 29px;
      background: rgba(66, 77, 94, 0.56);
      backdrop-filter: blur(30px) saturate(180%);
      -webkit-backdrop-filter: blur(30px) saturate(180%);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.18),
        0 12px 32px rgba(0, 0, 0, 0.28);
      a {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        gap: 4px;
        min-height: 52px;
        border-radius: 23px;
        color: #c8d2e0;
        text-decoration: none;
        font-size: 10px;
        transition:
          background-color 180ms ease,
          color 180ms ease;
        .el-icon {
          font-size: 22px;
        }
      }
      a.is-active {
        background: rgba(255, 255, 255, 0.15);
        color: #b5d9ff;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
      }
    }
  }
  @media (prefers-reduced-motion: reduce) {
    a,
    button {
      transition: none;
      &:active {
        transform: none;
      }
    }
  }
  @supports not (backdrop-filter: blur(1px)) {
    &__sidebar,
    &__dock {
      background: #273547;
    }
  }
}
</style>
