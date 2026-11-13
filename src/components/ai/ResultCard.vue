<template>
  <div class="result-card" :class="layoutClass">
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

          <div v-if="result.is_perfect_match !== undefined" class="match-section">
            <el-tag :type="result.is_perfect_match ? 'success' : 'warning'" size="small">
              {{ result.is_perfect_match ? '匹配分类' : '近似分类' }}
            </el-tag>
          </div>

          <div
            v-if="result.new_category_proposal && result.new_category_proposal.suggested_third"
            class="proposal-section"
          >
            <div class="section-label">新分类建议</div>
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

          <div v-if="result.reasoning" class="reasoning-section">
            <div class="section-label">分类逻辑</div>
            <div class="reasoning-content">{{ result.reasoning }}</div>
          </div>

          <div class="footer-section">
            <div class="meta-row">
              <div class="meta-item">
                <span class="meta-value model-name">{{ modelName }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-value">{{ formatTime(result.timestamp) }}</span>
              </div>
              <div class="meta-item">
                <el-tag :type="confidenceType" size="small" effect="dark"
                  >{{ (result.confidence * 100).toFixed(0) }}%</el-tag
                >
              </div>
              <div class="meta-item">
                <span class="meta-value">{{ formatSize(result.imageSize) }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-value">{{ result.keywords?.length || 0 }} 标签</span>
              </div>
              <div class="meta-item">
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
            </div>
          </div>
        </div>
      </div>
    </template>

    <template v-else-if="result.primary === 'mobile'">
      <div class="mobile-layout">
        <div class="image-section">
          <img :src="result.imageUrl" :alt="result.imageName" />
          <el-tag :type="confidenceType" size="small" effect="dark" class="confidence-badge">
            {{ (result.confidence * 100).toFixed(0) }}%
          </el-tag>
        </div>
        <div class="info-section">
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

          <div v-if="result.is_perfect_match !== undefined" class="match-section">
            <el-tag :type="result.is_perfect_match ? 'success' : 'warning'" size="small">
              {{ result.is_perfect_match ? '匹配分类' : '近似分类' }}
            </el-tag>
          </div>

          <div
            v-if="result.new_category_proposal && result.new_category_proposal.suggested_third"
            class="proposal-section"
          >
            <div class="section-label">新分类建议</div>
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

          <div v-if="result.reasoning" class="reasoning-section">
            <div class="section-label">分类逻辑</div>
            <div class="reasoning-content">{{ result.reasoning }}</div>
          </div>

          <div class="footer-section">
            <div class="meta-row">
              <div class="meta-item">
                <span class="meta-value model-name">{{ modelName }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-value">{{ formatTime(result.timestamp) }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-value">{{ formatSize(result.imageSize) }}</span>
              </div>
            </div>
            <div class="action-row">
              <el-button size="small" type="primary" @click="copyPath">复制路径</el-button>
              <el-button size="small" @click="copyFullInfo">复制全部</el-button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="avatar-layout">
        <div class="image-section">
          <img :src="result.imageUrl" :alt="result.imageName" />
          <el-tag :type="confidenceType" size="small" effect="dark" class="confidence-badge">
            {{ (result.confidence * 100).toFixed(0) }}%
          </el-tag>
        </div>
        <div class="info-section">
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

          <div v-if="result.is_perfect_match !== undefined" class="match-section centered">
            <el-tag :type="result.is_perfect_match ? 'success' : 'warning'" size="small">
              {{ result.is_perfect_match ? '匹配分类' : '近似分类' }}
            </el-tag>
          </div>

          <div
            v-if="result.new_category_proposal && result.new_category_proposal.suggested_third"
            class="proposal-section centered"
          >
            <div class="section-label">新分类建议</div>
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

          <div v-if="result.reasoning" class="reasoning-section centered">
            <div class="section-label">分类逻辑</div>
            <div class="reasoning-content">{{ result.reasoning }}</div>
          </div>

          <div class="footer-section centered">
            <div class="meta-row">
              <div class="meta-item">
                <span class="meta-value model-name">{{ modelName }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-value">{{ formatTime(result.timestamp) }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-value">{{ formatSize(result.imageSize) }}</span>
              </div>
            </div>
            <div class="action-row">
              <el-button size="small" type="primary" @click="copyPath">复制路径</el-button>
              <el-button size="small" @click="copyFullInfo">复制全部</el-button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { CopyDocument, Document } from '@element-plus/icons-vue'
import { getModelByKey } from '@/services/ai/classifier'

const props = defineProps({
  result: { type: Object, required: true }
})

const selectedFilename = ref(props.result.selectedFilename || props.result.filenameSuggestions[0])

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

const formattedFilenames = computed(() => {
  if (props.result.primary !== 'desktop') return []

  return (
    props.result.filenameSuggestions?.map(filename => {
      const lastDotIndex = filename.lastIndexOf('.')
      const nameWithoutExt = lastDotIndex > 0 ? filename.substring(0, lastDotIndex) : filename

      const formattedName = `${props.result.secondary}--${props.result.third}_${nameWithoutExt}.png`
      return formattedName
    }) || []
  )
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
  container-type: inline-size;
  background: transparent;
  border: 1px solid var(--studio-border, #30343b);
  border-radius: 14px;
  overflow: hidden;
  color: var(--studio-text, #f3f4f6);
}
.category-row,
.keywords-row,
.keywords-list,
.keywords {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.category-row .arrow,
.proposal-path .arrow {
  color: var(--studio-muted, #a1a6b0);
  font-size: 14px;
}
.category-row :deep(.el-tag),
.keywords :deep(.el-tag),
.keywords-row :deep(.el-tag) {
  background: var(--studio-raised, #22252a);
  border-color: var(--studio-border, #30343b);
  color: var(--studio-muted, #a1a6b0);
}
.section-label,
.label {
  font-size: 11px;
  color: var(--studio-muted, #a1a6b0);
  margin-bottom: 8px;
}
.filename-chips {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}
.filename-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  background: var(--studio-bg, #111214);
  border: 1px solid var(--studio-border, #30343b);
  border-radius: 6px;
  min-width: 0;
  cursor: pointer;
  transition: border-color 0.16s;
}
.filename-chip:hover,
.filename-chip.active {
  border-color: var(--studio-accent, #a8c7fa);
}
.filename-text {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: var(--studio-text, #f3f4f6);
  overflow-wrap: anywhere;
  min-width: 0;
  flex: 1;
}
.copy-icon {
  flex-shrink: 0;
  font-size: 14px;
  color: var(--studio-muted, #a1a6b0);
  cursor: pointer;
}
.copy-icon:hover {
  color: var(--studio-accent, #a8c7fa);
}
.description-row,
.detail-row .description {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.description-row .value,
.detail-row .value {
  color: var(--studio-muted, #a1a6b0);
  font-size: 12px;
  line-height: 1.7;
}
.detail-row {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.keywords-row .label {
  margin-bottom: 0;
}
.spacer {
  flex: 1;
}
.footer-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  border-top: 1px solid var(--studio-border, #30343b);
  padding-top: 14px;
}
.meta-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
}
.meta-item,
.meta {
  color: var(--studio-muted, #a1a6b0);
  font-size: 11px;
}
.meta-value.model-name {
  color: var(--studio-muted, #a1a6b0);
}
.action-row,
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.action-row :deep(.el-button + .el-button) {
  margin-left: 0;
}
.action-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--studio-border, #30343b);
}
.image-section {
  position: relative;
  overflow: hidden;
  background: var(--studio-bg, #111214);
}
.image-section img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.image-overlay,
.confidence-badge {
  position: absolute;
  top: 10px;
  right: 10px;
}
.info-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.desktop-layout .image-section {
  width: 100%;
  height: 240px;
}
.desktop-layout .info-section {
  padding: 16px;
}
.mobile-layout {
  display: flex;
  align-items: flex-start;
  padding: 16px;
  gap: 16px;
}
.mobile-layout .image-section {
  flex-shrink: 0;
  width: 112px;
  height: 224px;
  border-radius: 7px;
}
.mobile-layout .info-section {
  flex: 1;
}
.avatar-layout {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 18px;
  gap: 20px;
}
.avatar-layout .image-section {
  width: 120px;
  height: 120px;
  border-radius: 50%;
}
.avatar-layout .info-section {
  width: 100%;
}
.avatar-layout .confidence-badge {
  top: auto;
  bottom: 8px;
  right: auto;
  left: 50%;
  transform: translateX(-50%);
}
.display-title {
  color: var(--studio-text, #f3f4f6);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.6;
}
.proposal-section,
.reasoning-section {
  padding-top: 14px;
  border-top: 1px solid var(--studio-border, #30343b);
}
.proposal-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.proposal-path {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.proposal-reason,
.reasoning-content {
  color: var(--studio-muted, #a1a6b0);
  font-size: 12px;
  line-height: 1.7;
}
@container (max-width: 440px) {
  .mobile-layout {
    flex-direction: column;
  }
  .mobile-layout .image-section {
    align-self: center;
  }
  .mobile-layout .info-section {
    width: 100%;
  }
}
@media (prefers-reduced-motion: reduce) {
  .filename-chip {
    transition: none;
  }
}
</style>
