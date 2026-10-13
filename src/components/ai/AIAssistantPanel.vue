<template>
  <!-- 全局加载状态 -->
  <div v-if="pageLoading" class="ai-assistant-loading">
    <div class="loading-spinner">
      <div class="spinner"></div>
      <p class="loading-text">加载中...</p>
    </div>
  </div>

  <div v-else ref="panelRef" class="ai-assistant-panel">
    <!-- 三栏布局 -->
    <div class="panel-content">
      <!-- 左栏：配置区（可滚动） -->
      <div class="left-column">
        <!-- 凭证配置（仅生产环境显示） -->
        <!-- <div v-if="credentialsStore.isProduction" class="config-section">
          <CredentialsConfig />
        </div> -->

        <!-- Provider 选择 -->
        <el-card class="config-card compact" shadow="hover">
          <template #header>
            <div class="card-header">
              <span class="header-icon">🔌</span>
              <span class="header-title">AI 服务商</span>
            </div>
          </template>
          <el-radio-group
            v-model="currentProvider"
            size="default"
            class="provider-group"
            @change="handleProviderChange"
          >
            <el-radio-button
              v-for="(display, providerKey) in PROVIDER_DISPLAY"
              :key="providerKey"
              :value="providerKey"
              :disabled="display.disabled"
            >
              <div class="provider-option">
                <span class="provider-icon">{{ display.icon }}</span>
                <span class="provider-name">{{ display.name }}</span>
              </div>
            </el-radio-button>
          </el-radio-group>
        </el-card>

        <!-- 模型选择 -->
        <el-card class="config-card compact" shadow="hover">
          <template #header>
            <div class="card-header">
              <span class="header-icon">🎯</span>
              <span class="header-title">AI 模型</span>
            </div>
          </template>
          <el-radio-group v-model="aiStore.currentModel" size="default" class="model-group">
            <el-radio-button v-for="model in modelList" :key="model.key" :value="model.key">
              <div class="model-option">
                <span class="model-name">{{ model.name }}</span>
                <el-tag v-if="model.recommended" type="success" size="small" class="model-tag">
                  推荐
                </el-tag>
              </div>
            </el-radio-button>
          </el-radio-group>
        </el-card>

        <!-- 主分类选择 -->
        <el-card class="config-card compact" shadow="hover">
          <template #header>
            <div class="card-header">
              <span class="header-icon">📂</span>
              <span class="header-title">壁纸类型</span>
            </div>
          </template>
          <el-radio-group v-model="primaryCategory" size="default" class="category-group">
            <el-radio-button value="desktop">🖥️ Desktop</el-radio-button>
            <el-radio-button value="mobile">📱 Mobile</el-radio-button>
            <el-radio-button value="avatar">👤 Avatar</el-radio-button>
          </el-radio-group>
        </el-card>

        <!-- 提示词模板选择 -->
        <div class="config-section">
          <PromptTemplateSelector
            v-model="aiStore.promptTemplate"
            :custom-prompt="customPrompt"
            :primary-category="primaryCategory"
            :provider="aiStore.currentProvider"
            @update:custom-prompt="val => (customPrompt = val)"
          />
        </div>
      </div>

      <!-- 中栏：上传区 -->
      <div class="middle-column">
        <el-card class="upload-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span class="header-icon">2️⃣</span>
              <span class="header-title">上传图片</span>
            </div>
          </template>

          <el-alert title="💡 图片要求" type="info" :closable="false" class="upload-alert">
            <div class="alert-content">
              • JPG、PNG、WEBP<br />
              • &lt; 5MB（自动压缩）<br />
              • 支持批量上传
            </div>
          </el-alert>

          <el-upload
            :file-list="fileList"
            drag
            multiple
            :auto-upload="false"
            accept="image/*"
            :on-change="handleFileChange"
            :on-remove="handleFileRemove"
            class="upload-area"
          >
            <el-icon class="upload-icon"><UploadFilled /></el-icon>
            <div class="upload-text">拖拽或点击选择</div>
            <template #tip>
              <div class="upload-tip">已选 {{ fileList.length }} 张</div>
            </template>
          </el-upload>

          <div v-if="fileList.length > 0" class="action-buttons">
            <el-button
              type="primary"
              size="large"
              :loading="aiStore.analyzing"
              class="analyze-btn"
              @click="handleAnalyze"
            >
              {{ aiStore.analyzing ? '分析中...' : `🚀 开始 (${fileList.length})` }}
            </el-button>
            <el-button
              size="large"
              :disabled="aiStore.analyzing"
              class="clear-btn"
              @click="handleClear"
            >
              清空
            </el-button>
          </div>

          <!-- 分析进度 -->
          <div v-if="aiStore.analyzing" class="progress-section">
            <el-progress
              type="circle"
              :percentage="progress"
              :width="100"
              :status="progress === 100 ? 'success' : undefined"
            />
            <p class="progress-text">AI 分析中</p>
          </div>

          <!-- 错误提示 -->
          <el-alert
            v-if="aiStore.error"
            type="error"
            :title="aiStore.error"
            :closable="false"
            show-icon
            class="error-alert"
          />
        </el-card>
      </div>

      <!-- 右栏：结果展示区 -->
      <div class="right-column">
        <div v-if="aiStore.hasResults" class="results-container">
          <div class="results-header">
            <span class="header-title">✨ 分析结果 ({{ aiStore.results.length }})</span>
            <el-button size="small" @click="aiStore.clearResults"> 清空 </el-button>
          </div>

          <div class="results-list">
            <ResultCard v-for="result in aiStore.results" :key="result.id" :result="result" />
          </div>
        </div>

        <!-- 空状态 -->
        <el-empty v-else description="暂无分析结果" :image-size="120" class="empty-state">
          <template #image>
            <div class="empty-icon">🎨</div>
          </template>
        </el-empty>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { ElMessage, ElNotification } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { gsap } from 'gsap'
import { useAIStore } from '@/stores/ai'
import { useCredentialsStore } from '@/stores/credentials'
import { AI_PROVIDERS, PROVIDER_DISPLAY } from '@/services/ai/core'
import { getModelList, getRecommendedModel, ASSISTANT_CONFIG } from '@/services/ai/classifier'
import { detectImageTypeFromFile } from '@/utils/image-detector'
// import CredentialsConfig from '@/components/ai/CredentialsConfig.vue'
import PromptTemplateSelector from '@/components/ai/PromptTemplateSelector.vue'
import ResultCard from '@/components/ai/ResultCard.vue'

// 根据 Provider 获取模型列表
function getModelsByProvider(provider) {
  return getModelList(provider)
}

const aiStore = useAIStore()
const credentialsStore = useCredentialsStore()

// State
const panelRef = ref(null)
const pageLoading = ref(true) // 页面加载状态
const primaryCategory = ref('desktop')
const customPrompt = ref('')
const fileList = ref([])
const progress = ref(0)
const currentIndex = ref(0)
const totalCount = ref(0)
const currentProvider = ref(ASSISTANT_CONFIG.defaultProvider)

// 保存动画 timeline 引用，用于清理
let entranceTimeline = null

// Computed
const modelList = computed(() => {
  return getModelsByProvider(currentProvider.value)
})

// 监听 Provider 变化
watch(currentProvider, newProvider => {
  // 切换 Provider 时，自动选择该 Provider 的推荐模型
  const recommendedModel = getRecommendedModel(newProvider)
  if (recommendedModel) {
    aiStore.currentModel = recommendedModel.key
  }

  // 同步更新 AI Store 的 Provider
  aiStore.setProvider(newProvider)

  // 保存到 localStorage
  localStorage.setItem('ai_current_provider', newProvider)
})

// Methods
function handleProviderChange() {
  ElMessage.success(`已切换到 ${PROVIDER_DISPLAY[currentProvider.value].name}`)
}

async function handleFileChange(file, files) {
  fileList.value = files

  // 自动检测第一张图片的类型
  if (files.length > 0 && file.raw) {
    try {
      const detection = await detectImageTypeFromFile(file.raw)

      // 如果检测置信度较高，自动切换类型
      if (detection.confidence >= 0.8 && detection.type !== primaryCategory.value) {
        const oldType = primaryCategory.value
        primaryCategory.value = detection.type

        ElNotification({
          title: '🔍 自动检测壁纸类型',
          message: `检测到 ${detection.resolution} (${detection.aspectRatio})\n已自动切换：${oldType} → ${detection.type}`,
          type: 'success',
          duration: 4000
        })
      } else if (detection.confidence < 0.8) {
        // 置信度较低，提示用户确认
        ElNotification({
          title: '⚠️ 请确认壁纸类型',
          message: `${detection.reason}\n当前选择：${primaryCategory.value}\n如不正确请手动调整`,
          type: 'warning',
          duration: 5000
        })
      }
    } catch (error) {
      console.warn('图片类型检测失败:', error)
    }
  }
}

function handleFileRemove(file, files) {
  fileList.value = files
}

function handleClear() {
  fileList.value = []
}

async function handleAnalyze() {
  if (fileList.value.length === 0) {
    ElMessage.warning('请先选择图片')
    return
  }

  if (!credentialsStore.hasCredentials) {
    ElMessage.warning('请先配置 API 凭证')
    return
  }

  progress.value = 0
  currentIndex.value = 0
  totalCount.value = fileList.value.length

  let progressInterval = null

  try {
    if (fileList.value.length === 1) {
      progressInterval = setInterval(() => {
        if (progress.value < 90) {
          progress.value += 10
        }
      }, 300)

      await aiStore.analyzeImage(fileList.value[0].raw, primaryCategory.value, customPrompt.value)

      if (progressInterval) {
        clearInterval(progressInterval)
      }
      progress.value = 100

      setTimeout(() => {
        ElMessage.success('分析完成！')
      }, 500)
    } else {
      const files = fileList.value.map(f => f.raw)
      const result = await aiStore.analyzeBatch(
        files,
        primaryCategory.value,
        customPrompt.value,
        progressInfo => {
          currentIndex.value = progressInfo.current
          progress.value = progressInfo.progress
        }
      )

      progress.value = 100
      ElMessage.success(`批量分析完成！成功 ${result.success} 张，失败 ${result.failed} 张`)
    }

    fileList.value = []
  } catch (error) {
    if (progressInterval) {
      clearInterval(progressInterval)
    }
    ElMessage.error(error.message || '分析失败')
  }
}

onMounted(async () => {
  pageLoading.value = true

  try {
    // 1. 加载凭证
    await credentialsStore.loadCredentials()

    // 2. 加载上次选择的 Provider
    const savedProvider = localStorage.getItem('ai_current_provider')
    if (savedProvider && AI_PROVIDERS[savedProvider.toUpperCase()]) {
      currentProvider.value = savedProvider
      aiStore.setProvider(savedProvider)
    } else {
      // 使用默认 Provider
      aiStore.setProvider(currentProvider.value)
    }

    console.log('[AIAssistant] 数据加载完成')
  } catch (err) {
    console.error('加载凭证失败:', err)
  } finally {
    // 3. 隐藏 loading
    pageLoading.value = false
  }

  // 4. 等待 DOM 更新后播放动画
  await new Promise(resolve => setTimeout(resolve, 100))

  // 5. 播放入场动画
  entranceTimeline = gsap.timeline({ defaults: { ease: 'power3.out' } })

  const columns = panelRef.value?.querySelectorAll('.panel-content > *')
  if (columns?.length >= 3) {
    // 左栏：从左边滑入
    entranceTimeline.fromTo(
      columns[0],
      { opacity: 0, x: -50, scale: 0.96 },
      {
        opacity: 1,
        x: 0,
        scale: 1,
        duration: 0.8,
        ease: 'back.out(1.1)',
        clearProps: 'transform' // 只清除 transform，保留 opacity
      }
    )

    // 中栏：从底部向上
    entranceTimeline.fromTo(
      columns[1],
      { opacity: 0, y: 50, scale: 0.96 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.8,
        ease: 'back.out(1.1)',
        clearProps: 'transform' // 只清除 transform，保留 opacity
      },
      '-=0.6' // 与左栏重叠
    )

    // 右栏：从右边滑入
    entranceTimeline.fromTo(
      columns[2],
      { opacity: 0, x: 50, scale: 0.96 },
      {
        opacity: 1,
        x: 0,
        scale: 1,
        duration: 0.8,
        ease: 'back.out(1.1)',
        clearProps: 'transform' // 只清除 transform，保留 opacity
      },
      '-=0.6' // 与中栏重叠
    )
  }
})

onUnmounted(() => {
  // 清理入场动画 timeline，防止内存泄漏
  if (entranceTimeline) {
    entranceTimeline.kill()
    entranceTimeline = null
  }
})
</script>

<style lang="scss" scoped>
.ai-assistant-loading {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  z-index: 9999;
}

.loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

.spinner {
  width: 60px;
  height: 60px;
  border: 4px solid rgba(102, 126, 234, 0.2);
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  font-size: 20px;
  color: #ffffff;
  font-weight: 500;
  margin: 0;
}

.ai-assistant-panel {
  height: 100%;
  padding: 24px;
  display: flex;
  flex-direction: column;
}

.panel-content {
  display: grid;
  grid-template-columns: 1fr 2fr 2fr;
  gap: 20px;
  flex: 1;
  min-height: 0;

  // 初始状态：所有列隐藏，等待动画
  > * {
    opacity: 0;
  }
}

// 左栏：配置区（独立滚动）
.left-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 8px;
  min-height: 0;

  // 自定义滚动条
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 3px;

    &:hover {
      background: rgba(255, 255, 255, 0.4);
    }
  }
}

.config-section {
  margin-bottom: 0;
  flex-shrink: 0;
}

.config-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border: none;
  border-radius: 12px;
  flex-shrink: 0;

  :deep(.el-card__header) {
    padding: 16px 20px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  }

  :deep(.el-card__body) {
    padding: 20px;
  }

  // 紧凑样式
  &.compact {
    :deep(.el-card__header) {
      padding: 10px 16px;
    }

    :deep(.el-card__body) {
      padding: 12px 16px;
    }
  }
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;

  .header-icon {
    font-size: 16px;
  }

  .header-title {
    flex: 1;
    color: #fff;
  }
}

.category-group,
.model-group,
.provider-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;

  :deep(.el-radio-button) {
    width: 100%;
    margin: 0;

    .el-radio-button__inner {
      width: 100%;
      border-radius: 8px;
      border: 1px solid #dcdfe6;
      padding: 8px 12px;
      font-size: 13px;
      transition: all 0.3s;
      white-space: normal;
      word-break: break-word;
      height: auto;
      line-height: 1.5;

      &:hover {
        border-color: #667eea;
        background: rgba(102, 126, 234, 0.05);
      }
    }

    &.is-active .el-radio-button__inner {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-color: #667eea;
      color: white;
    }
  }
}

.provider-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;

  .provider-icon {
    font-size: 18px;
  }

  .provider-name {
    font-size: 14px;
    font-weight: 500;
  }
}

.model-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;

  .model-name {
    font-size: 14px;
    font-weight: 500;
  }

  .model-tag {
    margin-left: 8px;
  }
}

.model-info {
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

// 中栏：上传区
.middle-column {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

// 右栏：结果展示区（可滚动）
.right-column {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.results-container {
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  flex: 1;
  min-height: 0;
}

.results-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;

  .header-title {
    font-size: 16px;
    font-weight: 600;
    color: #ffffff;
  }
}

.results-list {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  overflow-x: hidden;
  flex: 1;
  min-height: 0;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 3px;

    &:hover {
      background: rgba(255, 255, 255, 0.4);
    }
  }
}

.upload-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border: none;
  border-radius: 12px;
  height: 100%;

  :deep(.el-card__header) {
    padding: 16px 20px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  }

  :deep(.el-card__body) {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
}

.upload-alert {
  border-radius: 8px;

  .alert-content {
    font-size: 13px;
    line-height: 1.6;
  }
}

.upload-area {
  :deep(.el-upload-dragger) {
    border-radius: 12px;
    border: 2px dashed #d9d9d9;
    background: rgba(102, 126, 234, 0.02);
    transition: all 0.3s;
    padding: 30px 16px;

    &:hover {
      border-color: #667eea;
      background: rgba(102, 126, 234, 0.05);
    }
  }
}

.upload-icon {
  font-size: 60px;
  color: #667eea;
  margin-bottom: 12px;
}

.upload-text {
  font-size: 15px;
  color: #606266;
  margin-bottom: 6px;
}

.upload-tip {
  font-size: 13px;
  color: #909399;
  margin-top: 8px;
}

.action-buttons {
  display: flex;
  flex-direction: row;
  gap: 12px;
  padding: 16px;
  background: rgba(102, 126, 234, 0.05);
  border-radius: 12px;

  .analyze-btn {
    flex: 1;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border: none;
    font-weight: 600;
    font-size: 15px;
    padding: 12px 20px;
    height: auto;

    &:hover {
      opacity: 0.9;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
  }

  .clear-btn {
    flex-shrink: 0;
    padding: 12px 24px;
    height: auto;
  }
}

.progress-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 16px;
  background: rgba(102, 126, 234, 0.05);
  border-radius: 12px;

  .progress-text {
    margin-top: 16px;
    font-size: 16px;
    font-weight: 500;
    color: #fff;
  }
}

.results-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border: none;
  border-radius: 12px;
  height: 100%;
  display: flex;
  flex-direction: column;

  :deep(.el-card__header) {
    padding: 16px 20px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  }

  :deep(.el-card__body) {
    padding: 20px;
    flex: 1;
    overflow-y: auto;
  }
}

.results-header {
  display: flex;
  align-items: center;
  justify-content: space-between;

  .header-title {
    font-size: 18px;
    font-weight: 600;
    color: #fff;
  }
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1) !important;
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 60px 20px;
  height: 100%;

  .empty-icon {
    font-size: 80px;
    margin-bottom: 20px;
  }

  :deep(.el-empty__description p) {
    color: rgba(255, 255, 255, 0.7);
  }
}

.error-alert {
  border-radius: 12px;
}

// 响应式设计
@media (max-width: 1199px) {
  .panel-content {
    grid-template-columns: 1fr 1fr 1fr;
  }
}

@media (max-width: 900px) {
  .panel-content {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}
</style>
