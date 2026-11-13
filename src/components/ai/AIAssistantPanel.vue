<template>
  <div v-if="pageLoading" class="ai-assistant-loading" role="status" aria-live="polite">
    <div class="spinner"></div>
    <p>正在加载 AI 配置</p>
  </div>

  <div v-else class="ai-assistant-panel">
    <header class="workspace-heading">
      <div>
        <h1>AI 工坊</h1>
        <p>分析图片，生成分类、标题与关键词。</p>
      </div>
      <div class="shared-ai-config">
        <strong :title="credentialsStore.selectedModel">{{
          credentialsStore.selectedModel || '未选择模型'
        }}</strong>
        <span :class="{ 'config-missing': !credentialsStore.hasModelReady }">
          {{
            credentialsStore.hasModelReady
              ? '当前标签页已配置'
              : credentialsStore.hasCredentials
                ? '未选择模型'
                : '未配置 API Key'
          }}
        </span>
        <router-link to="/settings#ai-config">
          {{ credentialsStore.hasModelReady ? '管理 AI 配置' : '去设置 AI' }}
        </router-link>
      </div>
    </header>

    <div class="panel-content" data-scroll-region>
      <aside class="left-column" data-scroll-region aria-label="分析配置">
        <section class="config-section">
          <h2>壁纸类型</h2>
          <el-radio-group
            v-model="primaryCategory"
            size="default"
            class="category-group"
            aria-label="壁纸类型"
          >
            <el-radio-button value="desktop">电脑</el-radio-button>
            <el-radio-button value="mobile">手机</el-radio-button>
            <el-radio-button value="avatar">头像</el-radio-button>
          </el-radio-group>
        </section>
        <PromptTemplateSelector
          v-model="aiStore.promptTemplate"
          :custom-prompt="customPrompt"
          :primary-category="primaryCategory"
          :provider="aiStore.currentProvider"
          @update:custom-prompt="val => (customPrompt = val)"
        />
        <p class="shared-config-note">与图片上传、视频分析共用当前标签页的 API 配置。</p>
      </aside>

      <section class="middle-column" data-scroll-region aria-labelledby="ai-upload-title">
        <div class="section-heading">
          <h2 id="ai-upload-title">待分析图片</h2>
          <span>{{ fileList.length }} 张</span>
        </div>
        <el-upload
          :file-list="fileList"
          drag
          multiple
          :auto-upload="false"
          accept="image/*"
          :on-change="handleFileChange"
          :on-remove="handleFileRemove"
          class="upload-area"
          :disabled="aiStore.analyzing"
          @click.capture="handleFileIntent"
          @keydown.capture="handleFileKeydown"
          @drop.capture="handleFileIntent"
        >
          <el-icon class="upload-icon"><UploadFilled /></el-icon>
          <div class="upload-text">拖拽图片到这里</div>
          <div class="upload-choice">或点击选择文件</div>
          <template #tip>
            <div class="upload-tip">
              JPG、PNG、WEBP · 支持批量上传<br />图片将自动压缩至 5MB 以下
            </div>
          </template>
        </el-upload>
        <el-collapse-transition>
          <div v-if="fileList.length > 0" class="action-buttons">
            <el-button
              type="primary"
              :loading="aiStore.analyzing"
              :disabled="aiStore.analyzing"
              class="analyze-btn"
              @click="handleAnalyze"
            >
              {{ aiStore.analyzing ? '分析中...' : `分析 ${fileList.length} 张图片` }}
            </el-button>
            <el-button :disabled="aiStore.analyzing" class="clear-btn" @click="handleClear"
              >清空</el-button
            >
          </div>
        </el-collapse-transition>
        <el-collapse-transition>
          <div v-if="aiStore.analyzing" class="progress-section" aria-live="polite">
            <el-progress
              :percentage="progress"
              :status="progress === 100 ? 'success' : undefined"
            />
            <p>正在分析 {{ currentIndex || 1 }} / {{ totalCount }} 张图片</p>
          </div>
        </el-collapse-transition>
        <Transition name="studio-feedback">
          <el-alert
            v-if="aiStore.error"
            type="error"
            :title="aiStore.error"
            :closable="false"
            show-icon
            class="error-alert"
          />
        </Transition>
      </section>

      <section class="right-column" aria-labelledby="ai-results-title">
        <div class="section-heading results-header">
          <h2 id="ai-results-title">
            分析结果 <span v-if="aiStore.hasResults">{{ aiStore.results.length }}</span>
          </h2>
          <el-button v-if="aiStore.hasResults" size="small" text @click="aiStore.clearResults"
            >清空结果</el-button
          >
        </div>
        <div class="results-body">
          <Transition name="studio-panel">
            <TransitionGroup
              v-if="aiStore.hasResults"
              key="results"
              name="studio-list"
              tag="div"
              class="results-list"
              data-scroll-region
            >
              <ResultCard v-for="result in aiStore.results" :key="result.id" :result="result" />
            </TransitionGroup>
            <div v-else key="empty" class="empty-state">
              <el-icon><Picture /></el-icon>
              <h3>分析结果会显示在这里</h3>
              <p>添加图片并开始分析，即可查看推荐分类和描述。</p>
            </div>
          </Transition>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElNotification } from 'element-plus'
import { UploadFilled, Picture } from '@element-plus/icons-vue'
import { useAIStore } from '@/stores/ai'
import { useCredentialsStore } from '@/stores/credentials'
import { useAiConfigurationGuard } from '@/composables/useAiConfigurationGuard'
import { detectImageTypeFromFile } from '@/utils/image-detector'
import PromptTemplateSelector from '@/components/ai/PromptTemplateSelector.vue'
import ResultCard from '@/components/ai/ResultCard.vue'

const { requireAiConfiguration } = useAiConfigurationGuard()
const aiStore = useAIStore()
const credentialsStore = useCredentialsStore()

const pageLoading = ref(true)
const primaryCategory = ref('desktop')
const customPrompt = ref('')
const fileList = ref([])
const progress = ref(0)
const currentIndex = ref(0)
const totalCount = ref(0)

function handleFileIntent(event) {
  if (event.target?.closest?.('.el-upload-list')) return
  if (aiStore.analyzing || !requireAiConfiguration()) {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
}

function handleFileKeydown(event) {
  if (event.key === 'Enter' || event.key === ' ') handleFileIntent(event)
}

async function handleFileChange(file, files) {
  if (aiStore.analyzing || !requireAiConfiguration()) return
  fileList.value = files

  if (files.length > 0 && file.raw) {
    try {
      const detection = await detectImageTypeFromFile(file.raw)

      if (detection.confidence >= 0.8 && detection.type !== primaryCategory.value) {
        const oldType = primaryCategory.value
        primaryCategory.value = detection.type

        ElNotification({
          title: '自动检测壁纸类型',
          message: `检测到 ${detection.resolution} (${detection.aspectRatio})\n已自动切换：${oldType} → ${detection.type}`,
          type: 'success',
          duration: 4000
        })
      } else if (detection.confidence < 0.8) {
        ElNotification({
          title: '请确认壁纸类型',
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
  if (aiStore.analyzing || !requireAiConfiguration()) return
  if (fileList.value.length === 0) {
    ElMessage.warning('请先选择图片')
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
    await credentialsStore.loadCredentials()
  } catch (err) {
    ElMessage.error(err.message || '加载 AI 配置失败')
  } finally {
    pageLoading.value = false
  }
})
</script>

<style lang="scss" scoped>
.ai-assistant-loading {
  display: flex;
  flex: 1;
  min-height: 240px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 16px;
  color: var(--studio-muted, #a1a6b0);
  font-size: 14px;
}
.spinner {
  width: 28px;
  height: 28px;
  border: 2px solid var(--studio-border, #30343b);
  border-top-color: var(--studio-accent, #a8c7fa);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.ai-assistant-panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  padding: 0;
  gap: 24px;
  color: var(--studio-text, #f3f4f6);
}
.workspace-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
h1,
h2,
h3,
p {
  margin: 0;
}
.workspace-heading h1 {
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.workspace-heading p {
  margin-top: 8px;
  font-size: 13px;
  color: var(--studio-muted, #a1a6b0);
}
.shared-ai-config {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 6px;
  font-size: 12px;
}
.shared-ai-config strong {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
}
.shared-ai-config span {
  color: var(--studio-muted, #a1a6b0);
}
.shared-ai-config .config-missing {
  color: var(--el-color-warning, #e6a23c);
}
.shared-ai-config a {
  color: var(--studio-accent, #a8c7fa);
  text-decoration: none;
}
.shared-ai-config a:hover {
  text-decoration: underline;
}
.panel-content {
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(220px, 0.85fr) minmax(250px, 1fr) minmax(300px, 1.35fr);
  gap: 24px;
  flex: 1;
  min-height: 0;
}
.left-column,
.middle-column,
.right-column {
  min-width: 0;
  min-height: 0;
}
.left-column {
  display: flex;
  flex-direction: column;
  gap: 24px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 20px;
  border-right: 1px solid var(--studio-border, #30343b);
  scrollbar-width: thin;
}
.config-section h2,
.section-heading h2 {
  font-size: 14px;
  font-weight: 600;
}
.config-section h2 {
  margin-bottom: 12px;
}
.category-group {
  display: flex;
  width: 100%;
}
.category-group :deep(.el-radio-button) {
  flex: 1;
}
.category-group :deep(.el-radio-button__inner) {
  width: 100%;
  padding: 9px 8px;
}
.shared-config-note {
  font-size: 12px;
  line-height: 1.7;
  color: var(--studio-muted, #a1a6b0);
}
.middle-column {
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 18px;
  overflow-y: auto;
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 32px;
}
.section-heading span {
  color: var(--studio-muted, #a1a6b0);
  font-size: 12px;
  margin-left: 6px;
  font-weight: 400;
}
.upload-area :deep(.el-upload) {
  width: 100%;
}
.upload-area :deep(.el-upload-dragger) {
  padding: 38px 16px;
  background: var(--studio-surface, #191b1e);
  border: 1px dashed var(--studio-border, #30343b);
  border-radius: 16px;
  transition:
    border-color 0.18s,
    background-color 0.18s;
}
.upload-area :deep(.el-upload-dragger:hover),
.upload-area :deep(.el-upload-dragger.is-dragover) {
  border-color: var(--studio-accent, #a8c7fa);
  background: var(--studio-raised, #22252a);
}
.upload-icon {
  font-size: 32px;
  color: var(--studio-muted, #a1a6b0);
  margin-bottom: 16px;
}
.upload-text {
  font-size: 14px;
  font-weight: 500;
}
.upload-choice {
  margin-top: 8px;
  color: var(--studio-accent, #a8c7fa);
  font-size: 13px;
}
.upload-tip {
  color: var(--studio-muted, #a1a6b0);
  font-size: 12px;
  line-height: 1.7;
  margin-top: 12px;
}
.action-buttons {
  display: flex;
  gap: 8px;
}
.action-buttons .el-button + .el-button {
  margin-left: 0;
}
.analyze-btn {
  flex: 1;
}
.progress-section p {
  margin-top: 8px;
  color: var(--studio-muted, #a1a6b0);
  font-size: 12px;
}
.right-column {
  display: flex;
  flex-direction: column;
  background: var(--studio-surface, #191b1e);
  border: 1px solid var(--studio-border, #30343b);
  border-radius: 16px;
  overflow: hidden;
}
.results-header {
  flex-shrink: 0;
  padding: 14px 18px;
  border-bottom: 1px solid var(--studio-border, #30343b);
}
.results-body {
  display: flex;
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.results-body > .studio-panel-leave-active {
  position: absolute;
  inset: 0;
}
.results-list > :deep(.result-card) {
  flex-shrink: 0;
}
.results-list {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  overflow-y: auto;
  min-height: 0;
}
.empty-state {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 32px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.empty-state .el-icon {
  font-size: 34px;
  color: var(--studio-muted, #a1a6b0);
  margin-bottom: 18px;
}
.empty-state h3 {
  font-size: 14px;
  font-weight: 500;
}
.empty-state p {
  max-width: 260px;
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--studio-muted, #a1a6b0);
}
@media (max-width: 1180px) {
  .panel-content {
    grid-template-columns: minmax(200px, 0.8fr) minmax(240px, 1fr);
  }
  .right-column {
    grid-column: 1 / -1;
    min-height: 300px;
  }
  .panel-content {
    overflow-y: auto;
    overflow-x: hidden;
    align-content: start;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }
  .left-column,
  .middle-column,
  .results-list {
    overflow: visible;
  }
  .results-body {
    overflow: visible;
  }
  .right-column {
    overflow: hidden;
  }
  .empty-state {
    min-height: 240px;
  }
}
@media (max-width: 700px) {
  .ai-assistant-panel {
    padding: 0;
    gap: 20px;
  }
  .panel-content {
    grid-template-columns: 1fr;
    gap: 20px;
  }
  .left-column {
    border-right: 0;
    border-bottom: 1px solid var(--studio-border, #30343b);
    padding: 0 0 20px;
  }
  .right-column {
    grid-column: auto;
  }
  .workspace-heading {
    gap: 12px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation-duration: 2s;
  }
  .upload-area :deep(.el-upload-dragger) {
    transition: none;
  }
}
</style>
