<template>
  <div class="credentials-config">
    <el-card shadow="hover">
      <template #header>
        <div class="card-header">
          <span>🔐 API 凭证配置</span>
          <el-tag v-if="credentialsStore.hasCredentials" type="success" size="small">
            已配置
          </el-tag>
          <el-tag v-else type="warning" size="small"> 未配置 </el-tag>
        </div>
      </template>

      <!-- 环境提示 -->
      <el-alert
        :title="isProduction ? '🌐 线上环境' : '💻 本地开发'"
        :type="credentialsStore.hasCredentials ? 'success' : 'warning'"
        :closable="false"
        style="margin-bottom: 16px"
      >
        <template #default>
          <div style="line-height: 1.6; font-size: 13px">
            <template v-if="isProduction">
              <p v-if="credentialsStore.hasCredentials" style="margin: 0">
                ✅ 已通过 Cloudflare Pages 环境变量注入凭证，可直接使用 AI 功能。
              </p>
              <p v-else style="margin: 0">
                ⚠️ 未检测到环境变量，请在 Cloudflare Pages 设置中配置：<br />
                <code>VITE_CLOUDFLARE_ACCOUNT_ID</code> 和 <code>VITE_CLOUDFLARE_API_TOKEN</code>
              </p>
            </template>
            <template v-else>
              <p v-if="credentialsStore.hasCredentials" style="margin: 0">
                ✅ 凭证已配置，可以使用 AI 功能。
              </p>
              <p v-else style="margin: 0">
                请在下方手动输入 Cloudflare API 凭证，或创建 <code>.env.local</code> 文件。
              </p>
            </template>
          </div>
        </template>
      </el-alert>

      <!-- 手动输入模式（本地开发或未配置环境变量时显示） -->
      <div v-if="!isProduction || !credentialsStore.hasCredentials">
        <el-alert
          title="📖 如何获取 API 凭证"
          type="info"
          :closable="false"
          style="margin-bottom: 16px"
        >
          <template #default>
            <div style="line-height: 1.6; font-size: 13px">
              <p style="margin: 0 0 6px 0">
                1. 登录
                <a href="https://dash.cloudflare.com" target="_blank">Cloudflare Dashboard</a>
              </p>
              <p style="margin: 0 0 6px 0">2. 点击头像 → My Profile → API Tokens</p>
              <p style="margin: 0 0 6px 0">3. 创建 Token，选择 "Workers AI" 权限</p>
              <p style="margin: 0">4. Account ID 在 Workers & Pages 页面可以找到</p>
            </div>
          </template>
        </el-alert>

        <el-form label-width="100px" size="default">
          <el-form-item label="Account ID" required>
            <el-input v-model="accountId" placeholder="输入 Cloudflare Account ID" clearable />
          </el-form-item>

          <el-form-item label="API Token" required>
            <el-input
              v-model="apiToken"
              type="password"
              placeholder="输入 Cloudflare API Token"
              show-password
              clearable
            />
          </el-form-item>

          <el-form-item>
            <div class="button-group">
              <el-button
                type="primary"
                :loading="saving"
                :disabled="!accountId || !apiToken"
                @click="handleSave"
              >
                保存
              </el-button>
              <el-button
                :loading="testing"
                :disabled="!credentialsStore.hasCredentials"
                @click="handleTest"
              >
                测试
              </el-button>
              <el-button :disabled="!credentialsStore.hasCredentials" @click="handleClear">
                清除
              </el-button>
            </div>
          </el-form-item>
        </el-form>
      </div>

      <!-- 线上已配置时显示简化信息 -->
      <div v-else class="production-info">
        <el-descriptions :column="1" size="small" border>
          <el-descriptions-item label="凭证来源">
            <el-tag type="success" size="small">环境变量</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="Worker URL">
            <el-text type="info" size="small">{{ AI_CONFIG.workerUrl }}</el-text>
          </el-descriptions-item>
        </el-descriptions>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useCredentialsStore } from '@/stores/credentials'

// 默认配置
const AI_CONFIG = {
  workerUrl: 'https://ai-proxy.han1569250882.workers.dev'
}

const credentialsStore = useCredentialsStore()

// State
const accountId = ref('')
const apiToken = ref('')
const saving = ref(false)
const testing = ref(false)

// Computed
const isProduction = computed(() => import.meta.env.PROD)

// Methods
async function handleSave() {
  if (!accountId.value || !apiToken.value) {
    ElMessage.warning('请填写完整的凭证信息')
    return
  }

  saving.value = true

  try {
    await credentialsStore.saveCredentials(accountId.value, apiToken.value, 'manual')
    ElMessage.success('配置已保存')
  } catch (error) {
    ElMessage.error(error.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function handleTest() {
  testing.value = true

  try {
    const result = await credentialsStore.testConnection()
    ElMessage.success(result.message)
  } catch (error) {
    ElMessage.error(error.message || '连接测试失败')
  } finally {
    testing.value = false
  }
}

function handleClear() {
  credentialsStore.clearCredentials()
  accountId.value = ''
  apiToken.value = ''
  ElMessage.success('配置已清除')
}

// Lifecycle
onMounted(() => {
  // 如果凭证已加载，填充表单
  if (credentialsStore.accountId) {
    accountId.value = credentialsStore.accountId
    apiToken.value = credentialsStore.apiToken
  }
})
</script>

<style lang="scss" scoped>
.credentials-config {
  flex-shrink: 0;

  :deep(.el-card) {
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border: none;
    border-radius: 12px;
  }

  :deep(.el-card__header) {
    padding: 14px 16px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  }

  :deep(.el-card__body) {
    padding: 16px;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 15px;
    font-weight: 600;
    color: #ffffff;
  }

  .button-group {
    display: flex;
    gap: 8px;
    width: 100%;
  }

  .production-info {
    :deep(.el-descriptions) {
      --el-descriptions-item-bordered-label-background: #fafafa;
    }
  }

  :deep(.el-alert__content) {
    line-height: 1.6;
  }

  code {
    background: rgba(0, 0, 0, 0.06);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
  }

  a {
    color: #409eff;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
}
</style>
