<template>
  <el-dialog v-model="visible" title="AI 智能分析" width="800px" :close-on-click-modal="false">
    <div class="ai-analysis-modal">
      <p class="ai-analysis-modal__config">
        GPT-6.1 Sol · {{ credentialsStore.hasCredentials ? '当前标签页已配置' : '未配置 API Key' }}
        <router-link to="/settings#ai-config" @click="visible = false">
          {{ credentialsStore.hasCredentials ? '管理 AI 配置' : '去设置 API Key' }}
        </router-link>
      </p>
      <!-- 分析进度 -->
      <div v-if="analyzing" class="analyzing">
        <el-progress type="circle" :percentage="progress" :width="120">
          <template #default="{ percentage }">
            <span class="percentage-value">{{ percentage }}%</span>
            <span class="percentage-label">分析中</span>
          </template>
        </el-progress>
        <p class="analyzing-text">AI 正在分析图片内容...</p>
      </div>

      <!-- 分析结果 -->
      <div v-else-if="analysisResult" class="analysis-result">
        <!-- 图片预览 -->
        <div class="image-preview">
          <img :src="imagePreview" alt="预览" />
        </div>

        <!-- 分析详情 -->
        <div class="analysis-details">
          <!-- 文件名建议 -->
          <div class="section">
            <h3>📝 文件名建议</h3>
            <el-radio-group v-model="selectedFilename" class="filename-options">
              <el-radio
                v-for="(name, index) in analysisResult.filenameSuggestions"
                :key="index"
                :value="name"
                border
              >
                {{ name }}
              </el-radio>
            </el-radio-group>
            <el-input
              v-model="customFilename"
              placeholder="或输入自定义文件名"
              class="custom-input"
            >
              <template #prepend>自定义</template>
            </el-input>
          </div>

          <!-- 分类建议 -->
          <div class="section">
            <h3>📁 分类建议</h3>
            <div class="category-suggestion">
              <el-tag type="primary" size="large">
                {{ analysisResult.categorySuggestion.primary }}
              </el-tag>
              <el-icon><ArrowRight /></el-icon>
              <el-tag type="success" size="large">
                {{ analysisResult.categorySuggestion.secondary }}
              </el-tag>
              <el-tag :type="confidenceType" size="small" class="confidence-tag">
                置信度: {{ (analysisResult.categorySuggestion.confidence * 100).toFixed(0) }}%
              </el-tag>
            </div>

            <!-- 手动调整分类 -->
            <div class="manual-adjust">
              <el-select v-model="selectedPrimaryCategory" placeholder="主分类">
                <el-option label="Desktop" value="desktop" />
                <el-option label="Mobile" value="mobile" />
                <el-option label="Avatar" value="avatar" />
              </el-select>
              <el-select v-model="selectedSecondaryCategory" placeholder="二级分类">
                <el-option
                  v-for="cat in secondaryCategories"
                  :key="cat"
                  :label="cat"
                  :value="cat"
                />
              </el-select>
            </div>
          </div>

          <!-- 图片描述 -->
          <div class="section">
            <h3>🎨 图片描述</h3>
            <p class="description">{{ analysisResult.description }}</p>
          </div>

          <!-- 标签 -->
          <div class="section">
            <h3>🏷️ 标签</h3>
            <div class="tags">
              <el-tag v-for="tag in analysisResult.tags" :key="tag" class="tag-item">
                {{ tag }}
              </el-tag>
            </div>
          </div>
        </div>
      </div>

      <!-- 错误提示 -->
      <div v-else-if="error" class="error-state">
        <el-result icon="error" title="分析失败" :sub-title="error">
          <template #extra>
            <el-button
              type="primary"
              :disabled="!credentialsStore.hasCredentials"
              @click="retryAnalysis"
            >
              重新分析
            </el-button>
          </template>
        </el-result>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :disabled="!analysisResult" @click="confirmAnalysis">
          确认并应用
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, onBeforeUnmount, watch } from 'vue'
import { ArrowRight } from '@element-plus/icons-vue'
import { analyzeImage } from '@/services/ai/classifier'
import { AI_MODEL_KEY, AI_PROVIDER } from '@/services/ai/model'
import { useCredentialsStore } from '@/stores/credentials'

const credentialsStore = useCredentialsStore()

const props = defineProps({
  modelValue: Boolean,
  file: Object,
  series: { type: String, default: 'desktop' }
})

const emit = defineEmits(['update:modelValue', 'confirm'])

const visible = computed({
  get: () => props.modelValue,
  set: val => emit('update:modelValue', val)
})

const analyzing = ref(false)
const progress = ref(0)
const analysisResult = ref(null)
const error = ref(null)
const imagePreview = ref('')

const selectedFilename = ref('')
const customFilename = ref('')
const selectedPrimaryCategory = ref('')
const selectedSecondaryCategory = ref('')

// 你的实际分类结构
const CATEGORIES = {
  desktop: ['插画', '动漫', '风景', '萌宠', '人像', '影视', '游戏', '政治', 'IP形象'],
  mobile: ['插画', '创意', '动漫', '风景', '萌宠', '人像', '影视', 'IP形象'],
  avatar: ['表情包', '插画', '动漫', '萌宠', '人像', 'IP形象']
}

const secondaryCategories = computed(() => {
  return CATEGORIES[selectedPrimaryCategory.value] || []
})

// 置信度标签类型
const confidenceType = computed(() => {
  const confidence = analysisResult.value?.categorySuggestion.confidence || 0
  if (confidence >= 0.8) return 'success'
  if (confidence >= 0.6) return 'warning'
  return 'danger'
})

let requestId = 0
let progressInterval = null

function clearProgress() {
  if (progressInterval) clearInterval(progressInterval)
  progressInterval = null
}

function releasePreview() {
  if (imagePreview.value) URL.revokeObjectURL(imagePreview.value)
  imagePreview.value = ''
}

// 弹窗和文件共同决定本次分析，切换时不接收旧结果。
watch(
  () => [props.file, props.modelValue],
  ([file, open]) => {
    requestId += 1
    clearProgress()
    releasePreview()
    analyzing.value = false
    analysisResult.value = null
    error.value = null
    if (file && open) startAnalysis()
  },
  { immediate: true }
)

async function startAnalysis() {
  if (!props.file || !credentialsStore.hasCredentials) return
  const currentRequestId = ++requestId
  const credentials = credentialsStore.getCredentialsByProvider(AI_PROVIDER)
  analyzing.value = true
  progress.value = 0
  error.value = null
  analysisResult.value = null
  clearProgress()
  releasePreview()
  imagePreview.value = URL.createObjectURL(props.file)
  progressInterval = setInterval(() => {
    if (progress.value < 90) progress.value += 10
  }, 300)

  try {
    const result = await analyzeImage({
      file: props.file,
      series: props.series,
      providerType: AI_PROVIDER,
      modelKey: AI_MODEL_KEY,
      credentials
    })
    if (currentRequestId !== requestId) return
    if (credentials.signal?.aborted) {
      throw new globalThis.DOMException('AI 配置已变更，请重新分析', 'AbortError')
    }
    progress.value = 100
    analysisResult.value = {
      ...result,
      categorySuggestion: {
        primary: props.series,
        secondary: result.secondary,
        confidence: result.confidence || 0
      },
      tags: result.keywords || []
    }
    selectedFilename.value = result.filenameSuggestions?.[0] || ''
    selectedPrimaryCategory.value = props.series
    selectedSecondaryCategory.value = result.secondary || ''
  } catch (err) {
    if (currentRequestId === requestId) error.value = err.message || 'AI 分析失败，请重试'
  } finally {
    if (currentRequestId === requestId) {
      clearProgress()
      analyzing.value = false
    }
  }
}

onBeforeUnmount(() => {
  requestId += 1
  clearProgress()
  releasePreview()
})

// 重新分析
function retryAnalysis() {
  startAnalysis()
}

// 确认分析结果
function confirmAnalysis() {
  const finalFilename = customFilename.value || selectedFilename.value

  emit('confirm', {
    filename: finalFilename,
    primaryCategory: selectedPrimaryCategory.value,
    secondaryCategory: selectedSecondaryCategory.value,
    description: analysisResult.value.description,
    tags: analysisResult.value.tags
  })

  visible.value = false
}
</script>

<style lang="scss" scoped>
.ai-analysis-modal {
  min-height: 400px;

  &__config {
    font-size: 13px;
    line-height: 1.6;

    a {
      margin-left: 8px;
      color: var(--el-color-primary);
    }
  }

  .analyzing {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 0;

    .percentage-value {
      display: block;
      font-size: 28px;
      font-weight: bold;
      color: var(--el-color-primary);
    }

    .percentage-label {
      display: block;
      font-size: 14px;
      color: var(--el-text-color-secondary);
      margin-top: 4px;
    }

    .analyzing-text {
      margin-top: 24px;
      font-size: 16px;
      color: var(--el-text-color-regular);
    }
  }

  .analysis-result {
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: 24px;

    .image-preview {
      img {
        width: 100%;
        border-radius: 8px;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
      }
    }

    .analysis-details {
      .section {
        margin-bottom: 24px;

        h3 {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 12px;
          color: var(--el-text-color-primary);
        }
      }

      .filename-options {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 12px;
      }

      .custom-input {
        margin-top: 8px;
      }

      .category-suggestion {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;

        .confidence-tag {
          margin-left: auto;
        }
      }

      .manual-adjust {
        display: flex;
        gap: 12px;
      }

      .description {
        padding: 12px;
        background: var(--el-fill-color-light);
        border-radius: 6px;
        line-height: 1.6;
        color: var(--el-text-color-regular);
      }

      .tags {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
    }
  }

  .error-state {
    padding: 40px 0;
  }
}
</style>
