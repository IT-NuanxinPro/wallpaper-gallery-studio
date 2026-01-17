<template>
  <div class="prompt-template-selector">
    <el-card shadow="hover">
      <template #header>
        <div class="card-header">
          <span>📝 提示词模板</span>
          <el-tag v-if="modelValue" type="primary" size="small">
            {{ currentTemplateName }}
          </el-tag>
        </div>
      </template>

      <!-- 模板选择 -->
      <el-form label-width="100px">
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

        <!-- 自定义提示词编辑器 -->
        <el-form-item v-if="modelValue === 'custom'" label="自定义提示词">
          <el-input
            :model-value="customPrompt"
            type="textarea"
            :rows="12"
            placeholder="输入自定义提示词..."
            @update:model-value="handleCustomPromptChange"
          />
          <div class="form-tip">提示词长度：{{ customPrompt.length }} 字符</div>
        </el-form-item>

        <!-- 实时预览 -->
        <el-form-item v-if="showPreview" label="预览">
          <el-button size="small" @click="togglePreview">
            {{ previewExpanded ? '收起预览' : '展开预览' }}
          </el-button>
        </el-form-item>

        <el-collapse-transition>
          <div v-if="previewExpanded && preview.success" class="preview-box">
            <div class="preview-header">
              <el-text type="info"> {{ preview.lines }} 行 / {{ preview.length }} 字符 </el-text>
              <div class="preview-actions">
                <el-tag :type="preview.isValid ? 'success' : 'warning'" size="small">
                  {{ preview.isValid ? '有效' : '无效' }}
                </el-tag>
                <span class="copy-btn" @click="copyPrompt">复制</span>
              </div>
            </div>
            <pre class="preview-content">{{ preview.prompt }}</pre>
          </div>
        </el-collapse-transition>

        <el-alert
          v-if="previewExpanded && !preview.success"
          type="error"
          :title="preview.error"
          :closable="false"
        />
      </el-form>
    </el-card>
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
  }
})

const emit = defineEmits(['update:modelValue', 'update:customPrompt'])

// State
const previewExpanded = ref(false)
const templateList = ref(getTemplateList())

// Computed
const currentTemplateName = computed(() => {
  const template = templateList.value.find(t => t.id === props.modelValue)
  return template?.name || '未选择'
})

const preview = computed(() => {
  return previewPrompt(props.modelValue, props.primaryCategory, props.customPrompt)
})

// Methods
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

// Watch
watch(
  () => props.primaryCategory,
  () => {
    // 主分类变化时，如果预览已展开，保持展开状态
    // 这样用户可以看到变量替换的效果
  }
)
</script>

<style lang="scss" scoped>
.prompt-template-selector {
  flex-shrink: 0;

  :deep(.el-card) {
    background: rgba(30, 30, 50, 0.95);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
  }

  :deep(.el-card__header) {
    padding: 16px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  :deep(.el-card__body) {
    padding: 16px;
  }

  // 修复表单标签颜色为白色
  :deep(.el-form-item__label) {
    color: rgba(255, 255, 255, 0.9) !important;
  }

  // 修复输入框文字颜色为白色
  :deep(.el-select) {
    .el-input__wrapper {
      background: rgba(255, 255, 255, 0.1);
      box-shadow: none;
      border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .el-input__inner,
    .el-select__input,
    .el-select__placeholder {
      color: #ffffff !important;
    }

    .el-input__suffix {
      color: rgba(255, 255, 255, 0.7);
    }
  }

  :deep(.el-textarea__inner) {
    color: #ffffff !important;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);

    &::placeholder {
      color: rgba(255, 255, 255, 0.5);
    }
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 16px;
    font-weight: 600;
    color: #ffffff;
  }

  .template-option {
    display: flex;
    flex-direction: column;
    gap: 4px;

    .template-name {
      font-size: 14px;
      font-weight: 500;
    }

    .template-desc {
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }
  }

  .form-tip {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin-top: 4px;
  }

  .preview-box {
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.1);

    .preview-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px;
      background: rgba(255, 255, 255, 0.1);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);

      :deep(.el-text) {
        color: rgba(255, 255, 255, 0.7);
      }

      .preview-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .copy-btn {
        color: #fff;
        font-size: 12px;
        cursor: pointer;
        padding: 4px 10px;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.15);
        transition: all 0.2s;

        &:hover {
          background: rgba(255, 255, 255, 0.25);
        }
      }
    }

    .preview-content {
      padding: 16px;
      margin: 0;
      background: rgba(0, 0, 0, 0.2);
      font-size: 12px;
      line-height: 1.6;
      max-height: 400px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
      color: rgba(255, 255, 255, 0.9);
    }
  }
}
</style>
