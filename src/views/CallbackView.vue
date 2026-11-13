<template>
  <GradientBackground>
    <div class="callback">
      <GlassCard class="callback__card" :hoverable="false" padding="40px">
        <div v-if="loading" class="callback__loading">
          <el-icon class="callback__spinner" :size="48">
            <Loading />
          </el-icon>
          <p class="callback__text">正在验证登录...</p>
        </div>

        <div v-else-if="error" class="callback__error">
          <el-icon class="callback__icon callback__icon--error" :size="48">
            <CircleClose />
          </el-icon>
          <p class="callback__text">{{ error }}</p>
          <el-button type="primary" @click="goToLogin">返回登录</el-button>
        </div>

        <div v-else class="callback__success">
          <el-icon class="callback__icon callback__icon--success" :size="48">
            <CircleCheck />
          </el-icon>
          <p class="callback__text">登录成功，正在跳转...</p>
        </div>
      </GlassCard>
    </div>
  </GradientBackground>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Loading, CircleCheck, CircleClose } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import GradientBackground from '@/components/GradientBackground.vue'
import GlassCard from '@/components/GlassCard.vue'
import { useAuthStore } from '@/stores/auth'
import { githubService } from '@/services/github'
import { verifyState, exchangeToken } from '@/config/oauth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const loading = ref(true)
const error = ref(null)

function goToLogin() {
  router.push('/login')
}

onMounted(async () => {
  const previousToken = authStore.token
  const previousUser = authStore.user?.id ?? authStore.user?.login ?? null
  const identityUnchanged = () =>
    authStore.token === previousToken &&
    (authStore.user?.id ?? authStore.user?.login ?? null) === previousUser
  const code = route.query.code
  const state = route.query.state
  const errorParam = route.query.error

  // GitHub 返回错误
  if (errorParam) {
    error.value = '授权被拒绝，请重新登录'
    loading.value = false
    return
  }

  // 没有 code
  if (!code) {
    error.value = '授权失败：未获取到授权码'
    loading.value = false
    return
  }

  // 验证 state 防止 CSRF
  if (!verifyState(state)) {
    error.value = '安全验证失败，请重新登录'
    loading.value = false
    return
  }

  try {
    // 用 code 换 token
    const token = await exchangeToken(code)
    if (!identityUnchanged()) {
      error.value = '账号已变更，请返回登录页重新验证'
      return
    }

    // 设置 token 并获取用户信息
    githubService.setToken(token)
    const userData = await githubService.getCurrentUser()
    if (!identityUnchanged()) {
      error.value = '账号已变更，请返回登录页重新验证'
      return
    }

    // 保存认证信息
    authStore.setToken(token)
    authStore.setUser(userData)
    authStore.invalidatePermission()

    ElMessage.success(`欢迎，${userData.name || userData.login}！`)

    await router.replace('/login?select_repo=1')
  } catch {
    error.value = '登录失败，请检查 GitHub 授权配置后重试'
  } finally {
    githubService.setToken(authStore.token)
    loading.value = false
  }
})
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.callback {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: $spacing-4;

  &__card {
    width: 100%;
    max-width: 400px;
    text-align: center;
  }

  &__loading,
  &__error,
  &__success {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: $spacing-4;
  }

  &__spinner {
    animation: spin 1s linear infinite;
    color: $primary-start;
  }

  &__icon {
    &--success {
      color: $success;
    }

    &--error {
      color: $danger;
    }
  }

  &__text {
    color: $gray-300;
    font-size: $font-size-base;
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
</style>
