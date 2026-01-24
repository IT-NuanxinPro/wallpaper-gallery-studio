<template>
  <GradientBackground :particle-count="15">
    <div class="layout">
      <!-- 顶部导航 -->
      <header class="layout__header">
        <GlassCard class="layout__nav" :hoverable="false" padding="12px 24px">
          <div class="layout__nav-left">
            <router-link to="/upload" class="layout__logo">
              <svg class="layout__logo-github" viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"
                />
              </svg>
              <span class="layout__logo-text">Wallpaper Gallery</span>
              <span class="layout__logo-divider">·</span>
              <span class="layout__logo-badge">Studio</span>
            </router-link>
          </div>

          <nav class="layout__nav-center">
            <router-link
              v-for="item in navItems"
              :key="item.path"
              :to="item.path"
              class="layout__nav-item"
              :class="{ 'layout__nav-item--active': isActive(item.path) }"
            >
              <el-icon><component :is="item.icon" /></el-icon>
              <span>{{ item.label }}</span>
            </router-link>
          </nav>

          <div class="layout__nav-right">
            <!-- 权限标签 -->
            <el-tag
              v-if="authStore.permissionChecked"
              :type="permissionTagType"
              size="small"
              class="layout__permission-tag"
            >
              {{ permissionLabel }}
            </el-tag>

            <el-dropdown trigger="click" @command="handleCommand">
              <div class="layout__user">
                <el-avatar :size="32" :src="authStore.user?.avatar_url" />
                <span class="layout__user-name">{{ authStore.user?.login }}</span>
                <el-icon><ArrowDown /></el-icon>
              </div>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="settings">
                    <el-icon><Setting /></el-icon>
                    设置
                  </el-dropdown-item>
                  <el-dropdown-item command="logout" divided>
                    <el-icon><SwitchButton /></el-icon>
                    退出登录
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </GlassCard>
      </header>

      <!-- 主内容区 -->
      <main class="layout__main">
        <slot />
      </main>
    </div>
  </GradientBackground>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  Upload,
  Clock,
  Setting,
  ArrowDown,
  SwitchButton,
  MagicStick
} from '@element-plus/icons-vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import GradientBackground from '@/components/GradientBackground.vue'
import GlassCard from '@/components/GlassCard.vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

// 权限标签
const permissionLabel = computed(() => {
  const map = {
    admin: '管理员',
    write: '可写',
    read: '只读',
    none: '无权限'
  }
  return map[authStore.permissionLevel] || '未知'
})

const permissionTagType = computed(() => {
  const map = {
    admin: 'success',
    write: 'primary',
    read: 'warning',
    none: 'danger'
  }
  return map[authStore.permissionLevel] || 'info'
})

const navItems = [
  { path: '/upload', label: '上传', icon: Upload },
  { path: '/ai-assistant', label: 'AI 工坊', icon: MagicStick },
  { path: '/history', label: '历史', icon: Clock },
  { path: '/settings', label: '设置', icon: Setting }
]

function isActive(path) {
  return route.path === path
}

async function handleCommand(command) {
  if (command === 'logout') {
    try {
      await ElMessageBox.confirm('确定要退出登录吗？', '退出确认', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      })
      authStore.logout()
      ElMessage.success('已退出登录')
      router.push('/login')
    } catch {
      // 取消
    }
  } else if (command === 'settings') {
    router.push('/settings')
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.layout {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  &__header {
    position: sticky;
    top: 0;
    z-index: 100;
    padding: $spacing-4;
  }

  &__nav {
    display: flex;
    align-items: center;
    justify-content: space-between;

    &-left,
    &-right {
      flex: 1;
    }

    &-right {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: $spacing-3;
    }

    &-center {
      display: flex;
      gap: $spacing-2;
    }

    &-item {
      display: flex;
      align-items: center;
      gap: $spacing-2;
      padding: $spacing-2 $spacing-4;
      border-radius: $radius-md;
      color: $gray-400;
      text-decoration: none;
      transition: all $duration-normal $ease-out;

      &:hover {
        color: $white;
        background: rgba(255, 255, 255, 0.1);
      }

      &--active {
        color: $white;
        background: $primary-gradient;
      }
    }
  }

  &__logo {
    display: flex;
    align-items: center;
    gap: $spacing-2;
    color: $white;
    text-decoration: none;
    font-weight: 600;
    font-size: $font-size-base;

    &-github {
      width: 22px;
      height: 22px;
      opacity: 0.9;
    }

    &-text {
      background: linear-gradient(135deg, #fff 0%, rgba(255, 255, 255, 0.85) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      font-weight: 600;
    }

    &-divider {
      color: $gray-600;
      font-weight: 300;
    }

    &-badge {
      font-size: $font-size-sm;
      font-weight: 500;
      color: $primary-start;
      background: rgba($primary-start, 0.15);
      padding: 2px 8px;
      border-radius: 4px;
    }
  }

  &__permission-tag {
    font-size: $font-size-xs;
  }

  &__user {
    display: flex;
    align-items: center;
    gap: $spacing-2;
    cursor: pointer;
    padding: $spacing-1 $spacing-2;
    border-radius: $radius-md;
    transition: background $duration-normal;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    &-name {
      color: $gray-300;
      font-size: $font-size-sm;
    }
  }

  &__main {
    flex: 1;
    padding: 0 $spacing-4 $spacing-4;
    min-height: 0;
    overflow: visible;
    display: flex;
    flex-direction: column;
  }
}
</style>
