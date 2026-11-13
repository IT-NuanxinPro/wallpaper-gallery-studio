<template>
  <div class="prompt-template-selector">
    <section class="template-section">
      <header>
        <div class="card-header">
          <h2>提示词模板</h2>
          <el-tag v-if="modelValue" type="primary" size="small">
            {{ currentTemplateName }}
          </el-tag>
        </div>
      </header>

      <el-form label-position="top">
        <el-form-item label="选择模板">
          <el-select
            :model-value="modelValue"
            placeholder="请选择提示词模板"
            style="width: 100%"
            @update:model-value="handleTemplateChange"
          >
            <el-option
              v-for="template in templateList"
              :key="template.id"
              :label="template.name"
              :value="template.id"
            >
              <div class="template-option">
                <span class="template-name">{{ template.name }}</span>
                <span class="template-desc">{{ template.description }}</span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>

        <el-collapse-transition>
          <el-form-item v-if="modelValue === 'custom'" label="自定义提示词">
            <el-input
              :model-value="customPrompt"
              type="textarea"
              :rows="12"
              placeholder="输入自定义提示词..."
              @update:model-value="handleCustomPromptChange"
            />
            <div class="form-tip">提示词长度：{{ customPrompt.length }} 字符</div>
            <div
              class="form-tip"
              v-text="
                '动态变量：{{primaryCategory}} 主分类、{{secondaryList}} 最新二级分类、{{thirdHints}} 最新三级分类。'
              "
            />
          </el-form-item>
        </el-collapse-transition>

        <el-form-item v-if="showPreview" label="预览">
          <el-button size="small" @click="togglePreview">
            {{ previewExpanded ? '收起预览' : '展开预览' }}
          </el-button>
          <el-button
            v-if="previewExpanded"
            size="small"
            :loading="previewLoading"
            @click="loadPreview(true)"
          >
            刷新分类与预览
          </el-button>
        </el-form-item>

        <el-collapse-transition>
          <div v-if="previewExpanded && !previewLoading && preview.success" class="preview-box">
            <div class="preview-header">
              <el-text type="info"> {{ preview.lines }} 行 / {{ preview.length }} 字符 </el-text>
              <div class="preview-actions">
                <el-tag :type="preview.isValid ? 'success' : 'warning'" size="small">
                  {{ preview.isValid ? '有效' : '无效' }}
                </el-tag>
                <button type="button" class="copy-btn" @click="copyPrompt">复制</button>
              </div>
            </div>
            <pre class="preview-content">{{ preview.prompt }}</pre>
          </div>
        </el-collapse-transition>

        <Transition name="studio-feedback">
          <el-alert
            v-if="previewExpanded && !previewLoading && !preview.success"
            type="error"
            :title="preview.error"
            :closable="false"
          />
        </Transition>
      </el-form>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getTemplateList } from '@/services/ai/classifier'
import { previewPrompt } from '@/services/ai/classifier/prompts'

const props = defineProps({
  modelValue: {
    type: String,
    default: 'default'
  },
  customPrompt: {
    type: String,
    default: ''
  },
  primaryCategory: {
    type: String,
    default: 'desktop'
  },
  showPreview: {
    type: Boolean,
    default: true
  },
  provider: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['update:modelValue', 'update:customPrompt'])

const previewExpanded = ref(false)
const templateList = ref(getTemplateList())

const currentTemplateName = computed(() => {
  const template = templateList.value.find(t => t.id === props.modelValue)
  return template?.name || '未选择'
})

const preview = ref({ success: false, error: '' })
const previewLoading = ref(false)
let previewRequest = 0

async function loadPreview(force = false) {
  const request = ++previewRequest
  previewLoading.value = true
  const result = await previewPrompt(
    props.modelValue,
    props.primaryCategory,
    props.customPrompt,
    props.provider,
    { force }
  )
  if (request !== previewRequest) return
  preview.value = result
  previewLoading.value = false
}

function handleTemplateChange(templateId) {
  emit('update:modelValue', templateId)
}

function handleCustomPromptChange(value) {
  emit('update:customPrompt', value)
}

function togglePreview() {
  previewExpanded.value = !previewExpanded.value
}

async function copyPrompt() {
  if (preview.value.success && preview.value.prompt) {
    try {
      await navigator.clipboard.writeText(preview.value.prompt)
      ElMessage.success('提示词已复制')
    } catch {
      ElMessage.error('复制失败')
    }
  }
}

watch(
  () => [
    previewExpanded.value,
    props.modelValue,
    props.primaryCategory,
    props.customPrompt,
    props.provider
  ],
  () => {
    if (previewExpanded.value) loadPreview()
    else previewRequest++
  }
)
</script>

<style lang="scss" scoped>
.prompt-template-selector {
  min-width: 0;
}
.card-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 16px;
}
.card-header h2 {
  margin: 0;
  color: var(--studio-text, #f3f4f6);
  font-size: 14px;
  font-weight: 600;
}
.template-section :deep(.el-form-item) {
  margin-bottom: 16px;
}
.template-section :deep(.el-form-item__label) {
  color: var(--studio-muted, #a1a6b0);
  font-size: 12px;
  padding: 0 0 8px;
  line-height: 1.5;
}
.template-section :deep(.el-form-item__content) {
  gap: 8px;
}
.template-section :deep(.el-button + .el-button) {
  margin-left: 0;
}
.template-option {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
}
.template-name {
  font-size: 13px;
}
.template-desc {
  font-size: 12px;
  color: var(--studio-muted, #a1a6b0);
}
.form-tip {
  width: 100%;
  color: var(--studio-muted, #a1a6b0);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.preview-box {
  overflow: hidden;
  border: 1px solid var(--studio-border, #30343b);
  border-radius: 8px;
  background: var(--studio-bg, #111214);
}
.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--studio-border, #30343b);
}
.preview-header :deep(.el-text) {
  font-size: 11px;
}
.preview-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.copy-btn {
  background: none;
  border: 0;
  padding: 4px;
  color: var(--studio-accent, #a8c7fa);
  font-size: 12px;
  cursor: pointer;
}
.copy-btn:focus-visible {
  outline: 2px solid var(--studio-accent, #a8c7fa);
  outline-offset: 2px;
  border-radius: 3px;
}
.preview-content {
  padding: 12px;
  margin: 0;
  max-height: 340px;
  overflow-y: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--studio-muted, #a1a6b0);
  font-size: 12px;
  line-height: 1.7;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>
