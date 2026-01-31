<template>
  <div class="result-card" :class="layoutClass">
    <!-- Desktop: 上下结构 -->
    <template v-if="result.primary === 'desktop'">
      <div class="desktop-layout">
        <div class="image-section">
          <img :src="result.imageUrl" :alt="result.imageName" />
          <div class="image-overlay">
            <el-tag :type="confidenceType" size="small" effect="dark">
              {{ (result.confidence * 100).toFixed(0) }}%
            </el-tag>
          </div>
        </div>
        <div class="info-section">
          <!-- Cloudflare Markdown 渲染模式 -->
          <template v-if="isMarkdownResponse">
            <div class="markdown-result-section">
              <div class="markdown-header">
                <el-tag type="success" size="small">
                  <span class="tag-icon">🤖</span>
                  {{ modelName }} - Markdown 分析结果
                </el-tag>
              </div>
              <div class="markdown-content-inline" v-html="renderedMarkdown"></div>
            </div>
          </template>

          <!-- 标准结构化显示模式 -->
          <template v-else>
            <div v-if="result.promptTemplate !== 'filenameOnly'" class="category-row">
              <el-tag type="primary" effect="dark">{{ result.primary }}</el-tag>
              <span class="arrow">›</span>
              <el-tag type="success" effect="dark">{{ result.secondary }}</el-tag>
              <span class="arrow">›</span>
              <el-tag type="warning" effect="dark">{{ result.third }}</el-tag>
            </div>
            <div class="filename-section">
              <div class="section-label">文件名建议</div>
              <div class="filename-chips">
                <div
                  v-for="(name, index) in result.filenameSuggestions"
                  :key="index"
                  class="filename-chip"
                  :class="{ active: selectedFilename === name }"
                  @click="selectFilename(name)"
                >
                  <span class="filename-text">{{ name }}</span>
                  <el-icon class="copy-icon" @click.stop="copyFilename(name)"
                    ><CopyDocument
                  /></el-icon>
                </div>
              </div>
            </div>

            <!-- 格式化文件名 (仅电脑壁纸) -->
            <div v-if="result.primary === 'desktop'" class="formatted-filename-section">
              <div class="section-label">格式化文件名</div>
              <div class="filename-chips">
                <div
                  v-for="(name, index) in formattedFilenames"
                  :key="`formatted-${index}`"
                  class="filename-chip formatted"
                >
                  <span class="filename-text">{{ name }}</span>
                  <el-icon class="copy-icon" @click.stop="copyFilename(name)"
                    ><CopyDocument
                  /></el-icon>
                </div>
              </div>
            </div>

            <!-- 诗意标题 -->
            <div v-if="result.displayTitle" class="title-section">
              <div class="section-label">诗意标题</div>
              <div class="display-title">{{ result.displayTitle }}</div>
            </div>

            <div class="detail-row">
              <div class="description">
                <span class="label">描述</span>
                <span class="value">{{ result.description }}</span>
              </div>
              <div v-if="result.keywords.length" class="keywords">
                <el-tag v-for="kw in result.keywords" :key="kw" size="small" effect="plain">{{
                  kw
                }}</el-tag>
              </div>
            </div>

            <!-- 分类匹配度 -->
            <div v-if="result.is_perfect_match !== undefined" class="match-section">
              <el-tag :type="result.is_perfect_match ? 'success' : 'warning'" size="small">
                {{ result.is_perfect_match ? '✓ 完美匹配' : '⚠ 近似匹配' }}
              </el-tag>
            </div>

            <!-- 新分类提案 -->
            <div
              v-if="result.new_category_proposal && result.new_category_proposal.suggested_third"
              class="proposal-section"
            >
              <div class="section-label">💡 新分类建议</div>
              <div class="proposal-content">
                <div class="proposal-path">
                  <el-tag type="info" size="small">{{
                    result.new_category_proposal.suggested_secondary || result.secondary
                  }}</el-tag>
                  <span class="arrow">›</span>
                  <el-tag type="info" size="small">{{
                    result.new_category_proposal.suggested_third
                  }}</el-tag>
                </div>
                <div class="proposal-reason">{{ result.new_category_proposal.reason }}</div>
              </div>
            </div>

            <!-- 分类逻辑 -->
            <div v-if="result.reasoning" class="reasoning-section">
              <div class="section-label">🧠 分类逻辑</div>
              <div class="reasoning-content">{{ result.reasoning }}</div>
            </div>

            <div class="footer-section">
              <div class="meta-row">
                <div class="meta-item">
                  <span class="meta-icon">🤖</span>
                  <span class="meta-value model-name">{{ modelName }}</span>
                </div>
                <div class="meta-item">
                  <span class="meta-icon">⏱️</span>
                  <span class="meta-value">{{ formatTime(result.timestamp) }}</span>
                </div>
                <div class="meta-item">
                  <span class="meta-icon">📊</span>
                  <el-tag :type="confidenceType" size="small" effect="dark"
                    >{{ (result.confidence * 100).toFixed(0) }}%</el-tag
                  >
                </div>
                <div class="meta-item">
                  <span class="meta-icon">📁</span>
                  <span class="meta-value">{{ formatSize(result.imageSize) }}</span>
                </div>
                <div class="meta-item">
                  <span class="meta-icon">🏷️</span>
                  <span class="meta-value">{{ result.keywords?.length || 0 }} 标签</span>
                </div>
                <div class="meta-item">
                  <span class="meta-icon">📝</span>
                  <span class="meta-value">{{ result.filenameSuggestions?.length || 0 }} 建议</span>
                </div>
              </div>
              <div class="action-row">
                <el-button size="small" type="primary" @click="copyPath">
                  <el-icon><CopyDocument /></el-icon> 复制路径
                </el-button>
                <el-button size="small" @click="copyFullInfo">
                  <el-icon><Document /></el-icon> 复制全部
                </el-button>
                <el-button
                  v-if="isMarkdownResponse"
                  size="small"
                  type="success"
                  @click="showMarkdown = true"
                >
                  📝 查看 Markdown
                </el-button>
                <el-button size="small" text @click="showRaw = true"> 原始数据 </el-button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </template>

    <!-- Mobile: 左右结构 -->
    <template v-else-if="result.primary === 'mobile'">
      <div class="mobile-layout">
        <div class="image-section">
          <img :src="result.imageUrl" :alt="result.imageName" />
          <el-tag :type="confidenceType" size="small" effect="dark" class="confidence-badge">
            {{ (result.confidence * 100).toFixed(0) }}%
          </el-tag>
        </div>
        <div class="info-section">
          <!-- Cloudflare Markdown 渲染模式 -->
          <template v-if="isMarkdownResponse">
            <div class="markdown-result-section">
              <div class="markdown-header">
                <el-tag type="success" size="small">
                  <span class="tag-icon">🤖</span>
                  {{ modelName }} - Markdown 分析结果
                </el-tag>
              </div>
              <div class="markdown-content-inline" v-html="renderedMarkdown"></div>
            </div>
          </template>

          <!-- 标准结构化显示模式 -->
          <template v-else>
            <div v-if="result.promptTemplate !== 'filenameOnly'" class="category-row">
              <el-tag type="primary" size="small" effect="dark">{{ result.primary }}</el-tag>
              <span class="arrow">›</span>
              <el-tag type="success" size="small" effect="dark">{{ result.secondary }}</el-tag>
              <span class="arrow">›</span>
              <el-tag type="warning" size="small" effect="dark">{{ result.third }}</el-tag>
            </div>
            <div class="filename-section">
              <div class="section-label">文件名</div>
              <div class="filename-chips">
                <div
                  v-for="(name, index) in result.filenameSuggestions"
                  :key="index"
                  class="filename-chip"
                  :class="{ active: selectedFilename === name }"
                  @click="selectFilename(name)"
                >
                  <span class="filename-text">{{ name }}</span>
                  <el-icon class="copy-icon" @click.stop="copyFilename(name)"
                    ><CopyDocument
                  /></el-icon>
                </div>
              </div>
            </div>

            <!-- 诗意标题 -->
            <div v-if="result.displayTitle" class="title-section">
              <div class="section-label">诗意标题</div>
              <div class="display-title">{{ result.displayTitle }}</div>
            </div>

            <div class="description-row">
              <span class="label">描述：</span>
              <span class="value">{{ result.description }}</span>
            </div>
            <div v-if="result.keywords.length" class="keywords-row">
              <span class="label">关键词：</span>
              <div class="keywords-list">
                <el-tag v-for="kw in result.keywords" :key="kw" size="small" effect="plain">{{
                  kw
                }}</el-tag>
              </div>
            </div>

            <!-- 分类匹配度 -->
            <div v-if="result.is_perfect_match !== undefined" class="match-section">
              <el-tag :type="result.is_perfect_match ? 'success' : 'warning'" size="small">
                {{ result.is_perfect_match ? '✓ 完美匹配' : '⚠ 近似匹配' }}
              </el-tag>
            </div>

            <!-- 新分类提案 -->
            <div
              v-if="result.new_category_proposal && result.new_category_proposal.suggested_third"
              class="proposal-section"
            >
              <div class="section-label">💡 新分类建议</div>
              <div class="proposal-content">
                <div class="proposal-path">
                  <el-tag type="info" size="small">{{
                    result.new_category_proposal.suggested_secondary || result.secondary
                  }}</el-tag>
                  <span class="arrow">›</span>
                  <el-tag type="info" size="small">{{
                    result.new_category_proposal.suggested_third
                  }}</el-tag>
                </div>
                <div class="proposal-reason">{{ result.new_category_proposal.reason }}</div>
              </div>
            </div>

            <!-- 分类逻辑 -->
            <div v-if="result.reasoning" class="reasoning-section">
              <div class="section-label">🧠 分类逻辑</div>
              <div class="reasoning-content">{{ result.reasoning }}</div>
            </div>

            <div class="footer-section">
              <div class="meta-row">
                <div class="meta-item">
                  <span class="meta-icon">🤖</span>
                  <span class="meta-value model-name">{{ modelName }}</span>
                </div>
                <div class="meta-item">
                  <span class="meta-icon">⏱️</span>
                  <span class="meta-value">{{ formatTime(result.timestamp) }}</span>
                </div>
                <div class="meta-item">
                  <span class="meta-icon">📁</span>
                  <span class="meta-value">{{ formatSize(result.imageSize) }}</span>
                </div>
              </div>
              <div class="action-row">
                <el-button size="small" type="primary" @click="copyPath">复制路径</el-button>
                <el-button size="small" @click="copyFullInfo">复制全部</el-button>
                <el-button
                  v-if="isMarkdownResponse"
                  size="small"
                  type="success"
                  @click="showMarkdown = true"
                >
                  📝 Markdown
                </el-button>
                <el-button size="small" text @click="showRaw = true">详情</el-button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </template>

    <!-- Avatar: 居中结构 -->
    <template v-else>
      <div class="avatar-layout">
        <div class="image-section">
          <img :src="result.imageUrl" :alt="result.imageName" />
          <el-tag :type="confidenceType" size="small" effect="dark" class="confidence-badge">
            {{ (result.confidence * 100).toFixed(0) }}%
          </el-tag>
        </div>
        <div class="info-section">
          <!-- Cloudflare Markdown 渲染模式 -->
          <template v-if="isMarkdownResponse">
            <div class="markdown-result-section">
              <div class="markdown-header">
                <el-tag type="success" size="small">
                  <span class="tag-icon">🤖</span>
                  {{ modelName }} - Markdown 分析结果
                </el-tag>
              </div>
              <div class="markdown-content-inline" v-html="renderedMarkdown"></div>
            </div>
          </template>

          <!-- 标准结构化显示模式 -->
          <template v-else>
            <div v-if="result.promptTemplate !== 'filenameOnly'" class="category-row">
              <el-tag type="primary" size="small" effect="dark">{{ result.primary }}</el-tag>
              <span class="arrow">›</span>
              <el-tag type="success" size="small" effect="dark">{{ result.secondary }}</el-tag>
              <span class="arrow">›</span>
              <el-tag type="warning" size="small" effect="dark">{{ result.third }}</el-tag>
            </div>
            <div class="filename-section">
              <div class="section-label centered">文件名</div>
              <div class="filename-chips centered">
                <div
                  v-for="(name, index) in result.filenameSuggestions"
                  :key="index"
                  class="filename-chip"
                  :class="{ active: selectedFilename === name }"
                  @click="selectFilename(name)"
                >
                  <span class="filename-text">{{ name }}</span>
                  <el-icon class="copy-icon" @click.stop="copyFilename(name)"
                    ><CopyDocument
                  /></el-icon>
                </div>
              </div>
            </div>

            <!-- 诗意标题 -->
            <div v-if="result.displayTitle" class="title-section centered">
              <div class="section-label">诗意标题</div>
              <div class="display-title">{{ result.displayTitle }}</div>
            </div>

            <div class="description-row centered">
              <span class="label">描述：</span>
              <span class="value">{{ result.description }}</span>
            </div>
            <div v-if="result.keywords.length" class="keywords-row centered">
              <span class="label">关键词：</span>
              <div class="keywords-list">
                <el-tag v-for="kw in result.keywords" :key="kw" size="small" effect="plain">{{
                  kw
                }}</el-tag>
              </div>
            </div>

            <!-- 分类匹配度 -->
            <div v-if="result.is_perfect_match !== undefined" class="match-section centered">
              <el-tag :type="result.is_perfect_match ? 'success' : 'warning'" size="small">
                {{ result.is_perfect_match ? '✓ 完美匹配' : '⚠ 近似匹配' }}
              </el-tag>
            </div>

            <!-- 新分类提案 -->
            <div
              v-if="result.new_category_proposal && result.new_category_proposal.suggested_third"
              class="proposal-section centered"
            >
              <div class="section-label">💡 新分类建议</div>
              <div class="proposal-content">
                <div class="proposal-path">
                  <el-tag type="info" size="small">{{
                    result.new_category_proposal.suggested_secondary || result.secondary
                  }}</el-tag>
                  <span class="arrow">›</span>
                  <el-tag type="info" size="small">{{
                    result.new_category_proposal.suggested_third
                  }}</el-tag>
                </div>
                <div class="proposal-reason">{{ result.new_category_proposal.reason }}</div>
              </div>
            </div>

            <!-- 分类逻辑 -->
            <div v-if="result.reasoning" class="reasoning-section centered">
              <div class="section-label">🧠 分类逻辑</div>
              <div class="reasoning-content">{{ result.reasoning }}</div>
            </div>

            <div class="footer-section centered">
              <div class="meta-row">
                <div class="meta-item">
                  <span class="meta-icon">🤖</span>
                  <span class="meta-value model-name">{{ modelName }}</span>
                </div>
                <div class="meta-item">
                  <span class="meta-icon">⏱️</span>
                  <span class="meta-value">{{ formatTime(result.timestamp) }}</span>
                </div>
                <div class="meta-item">
                  <span class="meta-icon">📁</span>
                  <span class="meta-value">{{ formatSize(result.imageSize) }}</span>
                </div>
              </div>
              <div class="action-row">
                <el-button size="small" type="primary" @click="copyPath">复制路径</el-button>
                <el-button size="small" @click="copyFullInfo">复制全部</el-button>
                <el-button
                  v-if="isMarkdownResponse"
                  size="small"
                  type="success"
                  @click="showMarkdown = true"
                >
                  📝 Markdown
                </el-button>
                <el-button size="small" text @click="showRaw = true">原始数据</el-button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </template>

    <el-dialog v-model="showRaw" title="原始 AI 响应" width="70%" top="5vh">
      <pre class="raw-data">{{ JSON.stringify(result.raw, null, 2) }}</pre>
    </el-dialog>

    <!-- Markdown 渲染对话框 (Cloudflare) -->
    <el-dialog v-model="showMarkdown" title="🤖 AI 分析结果 (Markdown)" width="70%" top="5vh">
      <div class="markdown-content" v-html="renderedMarkdown"></div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { CopyDocument, Document } from '@element-plus/icons-vue'
import { getModelByKey } from '@/services/ai/classifier'
import { marked } from 'marked'

const props = defineProps({
  result: { type: Object, required: true }
})

const selectedFilename = ref(props.result.selectedFilename || props.result.filenameSuggestions[0])
const showRaw = ref(false)
const showMarkdown = ref(false)

const layoutClass = computed(() => `layout-${props.result.primary}`)
const confidenceType = computed(() => {
  const c = props.result.confidence
  if (c >= 0.8) return 'success'
  if (c >= 0.6) return 'warning'
  return 'danger'
})

const modelName = computed(() => {
  const modelConfig = getModelByKey(props.result.model)
  return modelConfig?.name || props.result.model || '未知模型'
})

// 检测是否是 Cloudflare 返回的 Markdown 格式
const isMarkdownResponse = computed(() => {
  // 直接检测是否使用 Cloudflare provider
  console.log('🔍 Provider Detection:', {
    provider: props.result.provider,
    isCloudflare: props.result.provider === 'cloudflare',
    result: props.result
  })
  return props.result.provider === 'cloudflare'
})

// 渲染 Markdown
const renderedMarkdown = computed(() => {
  if (!isMarkdownResponse.value) return ''
  const rawResponse = props.result.raw?.result?.response || ''
  console.log('📝 Markdown Rendering:', {
    hasRaw: !!props.result.raw,
    hasResult: !!props.result.raw?.result,
    hasResponse: !!props.result.raw?.result?.response,
    responseLength: rawResponse.length,
    responsePreview: rawResponse.substring(0, 100)
  })
  return marked(rawResponse)
})

// 格式化文件名 (仅电脑壁纸)
const formattedFilenames = computed(() => {
  if (props.result.primary !== 'desktop') return []
  
  return props.result.filenameSuggestions?.map(filename => {
    // 获取文件名和扩展名
    const lastDotIndex = filename.lastIndexOf('.')
    const nameWithoutExt = lastDotIndex > 0 ? filename.substring(0, lastDotIndex) : filename
    
    // 格式: {secondary}-{third}-{originalName}.png
    const formattedName = `${props.result.secondary}-${props.result.third}-${nameWithoutExt}.png`
    return formattedName
  }) || []
})

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('zh-CN')
}

function formatSize(bytes) {
  if (!bytes) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function selectFilename(name) {
  selectedFilename.value = name
}

function copyFilename(name) {
  navigator.clipboard.writeText(name)
  ElMessage.success(`已复制: ${name}`)
}

function copyPath() {
  const path = `${props.result.primary}/${props.result.secondary}/${props.result.third}/${selectedFilename.value}`
  navigator.clipboard.writeText(path)
  ElMessage.success('路径已复制')
}

function copyFullInfo() {
  let info = `分类: ${props.result.primary}/${props.result.secondary}/${props.result.third}
文件名: ${selectedFilename.value}
描述: ${props.result.description}
关键词: ${props.result.keywords.join(', ')}
置信度: ${(props.result.confidence * 100).toFixed(0)}%`

  if (props.result.displayTitle) {
    info += `\n诗意标题: ${props.result.displayTitle}`
  }

  if (props.result.is_perfect_match !== undefined) {
    info += `\n匹配度: ${props.result.is_perfect_match ? '完美匹配' : '近似匹配'}`
  }

  if (props.result.new_category_proposal?.suggested_third) {
    info += `\n新分类建议: ${props.result.new_category_proposal.suggested_secondary || props.result.secondary}/${props.result.new_category_proposal.suggested_third}`
    info += `\n建议理由: ${props.result.new_category_proposal.reason}`
  }

  if (props.result.reasoning) {
    info += `\n分类逻辑: ${props.result.reasoning}`
  }

  navigator.clipboard.writeText(info)
  ElMessage.success('全部信息已复制')
}
</script>

<style lang="scss" scoped>
.result-card {
  background: rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  overflow: visible;
}

.category-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  .arrow {
    color: rgba(255, 255, 255, 0.4);
    font-size: 14px;
  }
}

.section-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 8px;

  &.centered {
    text-align: center;
  }
}

.filename-section {
  .filename-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    &.centered {
      justify-content: center;
    }
  }
  .filename-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    &:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(102, 126, 234, 0.5);
    }
    &.active {
      background: linear-gradient(135deg, rgba(102, 126, 234, 0.3), rgba(118, 75, 162, 0.3));
      border-color: #667eea;
    }
    &.formatted {
      background: rgba(52, 211, 153, 0.08);
      border-color: rgba(52, 211, 153, 0.2);
      &:hover {
        background: rgba(52, 211, 153, 0.12);
        border-color: rgba(52, 211, 153, 0.4);
      }
    }
    .filename-text {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.9);
      font-family: 'Monaco', 'Consolas', monospace;
    }
    .copy-icon {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.5);
      &:hover {
        color: #667eea;
      }
    }
  }
}

.formatted-filename-section {
  .filename-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    &.centered {
      justify-content: center;
    }
  }
  .filename-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: rgba(52, 211, 153, 0.08);
    border: 1px solid rgba(52, 211, 153, 0.2);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    &:hover {
      background: rgba(52, 211, 153, 0.12);
      border-color: rgba(52, 211, 153, 0.4);
    }
    .filename-text {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.9);
      font-family: 'Monaco', 'Consolas', monospace;
    }
    .copy-icon {
      font-size: 14px;
      color: rgba(52, 211, 153, 0.6);
      &:hover {
        color: rgba(52, 211, 153, 0.8);
      }
    }
  }
}

.description-row,
.detail-row .description {
  .label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    margin-right: 6px;
    flex-shrink: 0;
  }
  .value {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.8);
    line-height: 1.5;
  }
  &.centered {
    text-align: center;
  }
}

.keywords-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: flex-start;

  .label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    margin-right: 6px;
    flex-shrink: 0;
    line-height: 22px;
  }

  .keywords-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    flex: 1;
  }

  &.centered {
    justify-content: center;
  }
  .el-tag {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.7);
  }
}

.spacer {
  flex: 1;
  min-height: 8px;
}

.action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  &.centered {
    justify-content: center;
    gap: 12px;
  }
  .meta {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
  }
  .actions {
    display: flex;
    gap: 8px;
  }
}

.footer-section {
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;

  &.centered {
    align-items: center;
  }

  .meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 16px;
    align-items: center;
  }

  .meta-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    transition: background 0.2s;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .meta-icon {
      font-size: 12px;
    }

    .meta-label {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.4);
    }

    .meta-value {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.8);

      &.model-name {
        font-weight: 500;
        color: #667eea;
      }
    }
  }

  .action-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
}

// Desktop: 上下结构
.desktop-layout {
  .image-section {
    position: relative;
    width: 100%;
    max-height: 200px;
    overflow: hidden;
    img {
      width: 100%;
      height: auto;
      max-height: 200px;
      object-fit: cover;
      display: block;
    }
    .image-overlay {
      position: absolute;
      top: 12px;
      right: 12px;
    }
  }
  .info-section {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    .description {
      flex: 1;
    }
    .keywords {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      max-width: 40%;
    }
  }
}

// Mobile: 左右结构
.mobile-layout {
  display: flex;
  gap: 16px;
  padding: 16px;

  .image-section {
    position: relative;
    flex-shrink: 0;
    width: 140px;
    height: 280px;
    border-radius: 12px;
    overflow: hidden;
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .confidence-badge {
      position: absolute;
      top: 8px;
      right: 8px;
    }
  }
  .info-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }
}

// Avatar: 居中结构
.avatar-layout {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  gap: 16px;
  .image-section {
    position: relative;
    width: 160px;
    height: 160px;
    border-radius: 50%;
    overflow: hidden;
    border: 3px solid rgba(255, 255, 255, 0.15);
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .confidence-badge {
      position: absolute;
      bottom: 8px;
      left: 50%;
      transform: translateX(-50%);
    }
  }
  .info-section {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  .category-row {
    justify-content: center;
  }
}

.raw-data {
  padding: 16px;
  background: #1a1a2e;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.6;
  overflow-x: auto;
  max-height: 500px;
  margin: 0;
  color: #e0e0e0;
}

.title-section {
  .display-title {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.9);
    font-weight: 500;
    line-height: 1.5;
  }
  &.centered {
    text-align: center;
  }
}

.match-section {
  display: flex;
  align-items: center;
  &.centered {
    justify-content: center;
  }
}

.proposal-section {
  padding: 10px;
  background: rgba(102, 126, 234, 0.1);
  border: 1px solid rgba(102, 126, 234, 0.3);
  border-radius: 8px;

  .proposal-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .proposal-path {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    .arrow {
      color: rgba(255, 255, 255, 0.4);
      font-size: 14px;
    }
  }

  .proposal-reason {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
    line-height: 1.5;
  }

  &.centered {
    .proposal-content {
      align-items: center;
    }
  }
}

.reasoning-section {
  padding: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;

  .reasoning-content {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
    line-height: 1.6;
  }

  &.centered {
    text-align: center;
  }
}

.markdown-content {
  padding: 20px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  color: #333;
  line-height: 1.8;
  font-size: 14px;

  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4) {
    margin-top: 1.5em;
    margin-bottom: 0.5em;
    font-weight: 600;
    color: #667eea;
  }

  :deep(h1) {
    font-size: 1.8em;
    border-bottom: 2px solid #667eea;
    padding-bottom: 0.3em;
  }

  :deep(h2) {
    font-size: 1.5em;
    border-bottom: 1px solid rgba(102, 126, 234, 0.3);
    padding-bottom: 0.3em;
  }

  :deep(h3) {
    font-size: 1.3em;
  }

  :deep(p) {
    margin: 0.8em 0;
  }

  :deep(ul),
  :deep(ol) {
    margin: 0.8em 0;
    padding-left: 2em;
  }

  :deep(li) {
    margin: 0.4em 0;
  }

  :deep(strong) {
    font-weight: 600;
    color: #667eea;
  }

  :deep(code) {
    background: rgba(102, 126, 234, 0.1);
    padding: 0.2em 0.4em;
    border-radius: 4px;
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 0.9em;
    color: #764ba2;
  }

  :deep(pre) {
    background: #1a1a2e;
    padding: 1em;
    border-radius: 8px;
    overflow-x: auto;
    margin: 1em 0;

    code {
      background: none;
      padding: 0;
      color: #e0e0e0;
    }
  }

  :deep(blockquote) {
    border-left: 4px solid #667eea;
    padding-left: 1em;
    margin: 1em 0;
    color: #666;
    font-style: italic;
  }

  :deep(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;

    th,
    td {
      border: 1px solid rgba(0, 0, 0, 0.1);
      padding: 0.5em 1em;
      text-align: left;
    }

    th {
      background: rgba(102, 126, 234, 0.1);
      font-weight: 600;
    }
  }

  :deep(hr) {
    border: none;
    border-top: 1px solid rgba(102, 126, 234, 0.2);
    margin: 1.5em 0;
  }
}

// Markdown 内联显示样式
.markdown-result-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.markdown-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);

  .tag-icon {
    margin-right: 4px;
  }
}

.markdown-content-inline {
  padding: 20px;
  background: rgba(30, 30, 50, 0.6);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.8;
  font-size: 14px;
  max-height: 600px;
  overflow-y: auto;

  // 自定义滚动条
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.05);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(102, 126, 234, 0.3);
    border-radius: 3px;

    &:hover {
      background: rgba(102, 126, 234, 0.5);
    }
  }

  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4) {
    margin-top: 1.2em;
    margin-bottom: 0.5em;
    font-weight: 600;
    color: #a8b5ff;

    &:first-child {
      margin-top: 0;
    }
  }

  :deep(h1) {
    font-size: 1.6em;
    border-bottom: 2px solid rgba(168, 181, 255, 0.4);
    padding-bottom: 0.4em;
    color: #c5d0ff;
  }

  :deep(h2) {
    font-size: 1.4em;
    border-bottom: 1px solid rgba(168, 181, 255, 0.25);
    padding-bottom: 0.3em;
    color: #b8c5ff;
  }

  :deep(h3) {
    font-size: 1.2em;
    color: #a8b5ff;
  }

  :deep(h4) {
    font-size: 1.05em;
    color: #9aa8ff;
  }

  :deep(p) {
    margin: 0.7em 0;
    line-height: 1.7;
    color: rgba(255, 255, 255, 0.85);
  }

  :deep(ul),
  :deep(ol) {
    margin: 0.7em 0;
    padding-left: 2em;
    color: rgba(255, 255, 255, 0.85);
  }

  :deep(li) {
    margin: 0.4em 0;
    line-height: 1.6;
  }

  :deep(strong) {
    font-weight: 600;
    color: #c5d0ff;
  }

  :deep(em) {
    font-style: italic;
    color: #d4a5ff;
  }

  :deep(code) {
    background: rgba(168, 181, 255, 0.15);
    padding: 0.2em 0.5em;
    border-radius: 4px;
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 0.9em;
    color: #d4a5ff;
    border: 1px solid rgba(168, 181, 255, 0.2);
  }

  :deep(pre) {
    background: rgba(10, 10, 20, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 1em;
    border-radius: 8px;
    overflow-x: auto;
    margin: 1em 0;

    code {
      background: none;
      padding: 0;
      border: none;
      color: #e0e0e0;
      font-size: 0.9em;
    }
  }

  :deep(blockquote) {
    border-left: 3px solid #a8b5ff;
    padding-left: 1em;
    margin: 1em 0;
    color: rgba(255, 255, 255, 0.7);
    font-style: italic;
    background: rgba(168, 181, 255, 0.05);
    padding: 0.8em 1em;
    border-radius: 4px;
  }

  :deep(hr) {
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    margin: 1.5em 0;
  }

  :deep(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
    font-size: 0.9em;
    border: 1px solid rgba(255, 255, 255, 0.15);

    th,
    td {
      border: 1px solid rgba(255, 255, 255, 0.15);
      padding: 0.6em 1em;
      text-align: left;
    }

    th {
      background: rgba(168, 181, 255, 0.15);
      font-weight: 600;
      color: #c5d0ff;
    }

    td {
      color: rgba(255, 255, 255, 0.85);
    }

    tr:hover {
      background: rgba(168, 181, 255, 0.08);
    }
  }

  :deep(a) {
    color: #a8b5ff;
    text-decoration: underline;

    &:hover {
      color: #c5d0ff;
    }
  }
}
</style>
