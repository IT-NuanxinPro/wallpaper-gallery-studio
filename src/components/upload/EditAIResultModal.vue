<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" @click.self="$emit('close')">
        <div class="modal">
          <div class="modal__header">
            <h3>🤖 编辑 AI 分析结果</h3>
            <button class="modal__close" @click="$emit('close')">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M1 1L13 13M1 13L13 1"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </div>

          <div class="modal__body">
            <!-- 文件信息 -->
            <div class="modal__info">
              <div class="modal__info-icon">🖼️</div>
              <div class="modal__info-content">
                <span class="modal__info-label">文件名</span>
                <span class="modal__info-value">{{ file?.name }}</span>
              </div>
            </div>

            <!-- 分类设置 -->
            <div class="modal__section">
              <h4 class="modal__section-title">📁 分类设置</h4>

              <div class="modal__form-row">
                <div class="modal__form-group">
                  <label>系列</label>
                  <CustomSelect
                    v-model="form.series"
                    :options="seriesOptions"
                    placeholder="选择系列"
                  />
                </div>

                <div class="modal__form-group">
                  <label>二级分类</label>
                  <CustomSelect
                    v-model="form.secondary"
                    :options="secondaryCategories"
                    placeholder="如：人像、动漫、风景"
                    filterable
                    allow-create
                  />
                </div>
              </div>

              <div class="modal__form-group">
                <label>三级分类 <span class="modal__label-optional">(可选)</span></label>
                <CustomSelect
                  v-model="form.third"
                  :options="thirdCategories"
                  placeholder="如：清新、国风、场景"
                  filterable
                  allow-create
                  clearable
                />
              </div>
            </div>

            <!-- 文件名建议 -->
            <div class="modal__section">
              <h4 class="modal__section-title">📝 文件名建议</h4>

              <div class="modal__filename-list">
                <div
                  v-for="(filename, index) in form.filenames"
                  :key="index"
                  class="modal__filename-item"
                >
                  <input
                    v-model="form.filenames[index]"
                    type="text"
                    class="modal__input modal__input--small"
                    :placeholder="`文件名 ${index + 1}`"
                  />
                  <button
                    v-if="form.filenames.length > 1"
                    class="modal__filename-remove"
                    @click="removeFilename(index)"
                  >
                    ×
                  </button>
                </div>
              </div>

              <button v-if="form.filenames.length < 3" class="modal__add-btn" @click="addFilename">
                + 添加文件名
              </button>
            </div>

            <!-- 其他信息 -->
            <div class="modal__section">
              <h4 class="modal__section-title">✨ 其他信息</h4>

              <div class="modal__form-group">
                <label>诗意标题 <span class="modal__label-optional">(可选)</span></label>
                <input
                  v-model="form.displayTitle"
                  type="text"
                  class="modal__input"
                  placeholder="8-15字的诗意标题"
                />
              </div>

              <div class="modal__form-group">
                <label>关键词</label>
                <div class="modal__tags">
                  <div v-for="(keyword, index) in form.keywords" :key="index" class="modal__tag">
                    <input
                      v-model="form.keywords[index]"
                      type="text"
                      class="modal__tag-input"
                      :placeholder="`关键词 ${index + 1}`"
                    />
                    <button
                      v-if="form.keywords.length > 1"
                      class="modal__tag-remove"
                      @click="removeKeyword(index)"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <button
                  v-if="form.keywords.length < 5"
                  class="modal__add-btn modal__add-btn--small"
                  @click="addKeyword"
                >
                  + 添加关键词
                </button>
              </div>

              <div class="modal__form-group">
                <label>描述</label>
                <textarea
                  v-model="form.description"
                  class="modal__textarea"
                  placeholder="20-40字的优美描述"
                  rows="3"
                ></textarea>
              </div>
            </div>
          </div>

          <div class="modal__footer">
            <button class="modal__btn modal__btn--cancel" @click="$emit('close')">取消</button>
            <button
              class="modal__btn modal__btn--confirm"
              :disabled="saving || !isFormValid"
              @click="handleSave"
            >
              <span v-if="saving" class="modal__btn-loading"></span>
              {{ saving ? '保存中...' : '保存修改' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { reactive, computed, watch, ref, onMounted } from 'vue'
import CustomSelect from '@/components/common/CustomSelect.vue'
import { githubService } from '@/services/github'
import { useConfigStore } from '@/stores/config'

const configStore = useConfigStore()

const props = defineProps({
  visible: { type: Boolean, default: false },
  file: { type: Object, default: null },
  saving: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'save'])

// 系列选项
const seriesOptions = ['🖥️ 桌面壁纸', '📱 手机壁纸', '👤 头像图片']

// 系列值映射
const seriesValueMap = {
  '🖥️ 桌面壁纸': 'desktop',
  '📱 手机壁纸': 'mobile',
  '👤 头像图片': 'avatar'
}

const seriesLabelMap = {
  desktop: '🖥️ 桌面壁纸',
  mobile: '📱 手机壁纸',
  avatar: '👤 头像图片'
}

// 动态分类数据
const categoryData = ref({
  desktop: { secondary: [], third: {} },
  mobile: { secondary: [], third: {} },
  avatar: { secondary: [], third: {} }
})

const loadingCategories = ref(false)

// 从 GitHub 获取分类数据
async function loadCategoriesFromGitHub() {
  if (loadingCategories.value) return

  loadingCategories.value = true
  try {
    const { owner, repo, branch } = configStore.config

    // 获取所有系列的分类
    for (const seriesKey of ['desktop', 'mobile', 'avatar']) {
      try {
        // 获取一级分类（二级分类）
        const l1Contents = await githubService.getContents(
          owner,
          repo,
          `wallpaper/${seriesKey}`,
          branch
        )
        const l1Categories = l1Contents.filter(item => item.type === 'dir').map(item => item.name)

        categoryData.value[seriesKey].secondary = l1Categories

        // 获取二级分类下的三级分类
        const thirdCategories = {}
        for (const l1Category of l1Categories) {
          try {
            const l2Contents = await githubService.getContents(
              owner,
              repo,
              `wallpaper/${seriesKey}/${l1Category}`,
              branch
            )
            const l2Categories = l2Contents
              .filter(item => item.type === 'dir')
              .map(item => item.name)

            if (l2Categories.length > 0) {
              thirdCategories[l1Category] = l2Categories
            }
          } catch (error) {
            // 如果没有三级分类，忽略错误
            console.log(`No third-level categories for ${seriesKey}/${l1Category}`)
          }
        }

        categoryData.value[seriesKey].third = thirdCategories
      } catch (error) {
        console.error(`Failed to load categories for ${seriesKey}:`, error)
      }
    }
  } catch (error) {
    console.error('Failed to load categories from GitHub:', error)
  } finally {
    loadingCategories.value = false
  }
}

const form = reactive({
  series: '🖥️ 桌面壁纸',
  secondary: '',
  third: '',
  filenames: [''],
  displayTitle: '',
  keywords: [''],
  description: ''
})

// 根据当前系列获取二级分类选项
const secondaryCategories = computed(() => {
  const seriesKey = seriesValueMap[form.series] || 'desktop'
  return categoryData.value[seriesKey]?.secondary || []
})

// 根据当前系列和二级分类获取三级分类选项
const thirdCategories = computed(() => {
  if (!form.secondary) return []
  const seriesKey = seriesValueMap[form.series] || 'desktop'
  return categoryData.value[seriesKey]?.third?.[form.secondary] || []
})

// 表单验证
const isFormValid = computed(() => {
  return (
    form.series &&
    form.secondary?.trim() &&
    form.filenames.some(f => f?.trim()) &&
    form.keywords.some(k => k?.trim())
  )
})

// 监听文件变化，初始化表单
watch(
  () => [props.visible, props.file],
  ([visible, file]) => {
    if (visible) {
      // 弹窗打开时加载分类数据
      loadCategoriesFromGitHub()

      if (file?.aiMetadata) {
        const metadata = file.aiMetadata

        // 初始化表单数据
        const seriesKey = metadata.series || metadata.primary || 'desktop'
        form.series = seriesLabelMap[seriesKey] || '🖥️ 桌面壁纸'
        form.secondary = metadata.secondary || metadata.category || ''
        form.third = metadata.third || metadata.subcategory || ''

        // 文件名建议
        const filenames = metadata.filenameSuggestions || metadata.filenames || []
        form.filenames = filenames.length > 0 ? [...filenames] : ['']

        // 其他信息
        form.displayTitle = metadata.displayTitle || ''
        form.keywords = metadata.keywords?.length > 0 ? [...metadata.keywords] : ['']
        form.description = metadata.description || ''
      }
    }
  },
  { immediate: true }
)

// 组件挂载时预加载分类数据
onMounted(() => {
  loadCategoriesFromGitHub()
})

// 监听系列变化，清空不匹配的分类
watch(
  () => form.series,
  newSeries => {
    const seriesKey = seriesValueMap[newSeries] || 'desktop'
    const secondaryOptions = categoryData.value[seriesKey]?.secondary || []
    const thirdOptions = categoryData.value[seriesKey]?.third?.[form.secondary] || []

    // 如果当前二级分类在新系列中不存在，清空
    if (form.secondary && !secondaryOptions.includes(form.secondary)) {
      form.secondary = ''
      form.third = ''
    }
    // 如果当前三级分类在新的二级分类下不存在，清空
    else if (form.third && !thirdOptions.includes(form.third)) {
      form.third = ''
    }
  }
)

// 监听二级分类变化，清空不匹配的三级分类
watch(
  () => form.secondary,
  newSecondary => {
    const seriesKey = seriesValueMap[form.series] || 'desktop'
    const thirdOptions = categoryData.value[seriesKey]?.third?.[newSecondary] || []

    // 如果当前三级分类在新的二级分类下不存在，清空
    if (form.third && !thirdOptions.includes(form.third)) {
      form.third = ''
    }
  }
)

// 添加文件名
function addFilename() {
  if (form.filenames.length < 3) {
    form.filenames.push('')
  }
}

// 移除文件名
function removeFilename(index) {
  if (form.filenames.length > 1) {
    form.filenames.splice(index, 1)
  }
}

// 添加关键词
function addKeyword() {
  if (form.keywords.length < 5) {
    form.keywords.push('')
  }
}

// 移除关键词
function removeKeyword(index) {
  if (form.keywords.length > 1) {
    form.keywords.splice(index, 1)
  }
}

// 保存修改
function handleSave() {
  if (!isFormValid.value) return

  const seriesKey = seriesValueMap[form.series] || 'desktop'

  // 清理空值
  const cleanedData = {
    series: seriesKey,
    primary: seriesKey,
    secondary: form.secondary.trim(),
    category: form.secondary.trim(),
    third: form.third.trim() || '',
    subcategory: form.third.trim() || '',
    filenameSuggestions: form.filenames.filter(f => f?.trim()),
    filenames: form.filenames.filter(f => f?.trim()),
    displayTitle: form.displayTitle.trim() || null,
    keywords: form.keywords.filter(k => k?.trim()),
    description: form.description.trim() || '',
    // 保留原有的其他字段
    confidence: props.file?.aiMetadata?.confidence || 0.9,
    reasoning: props.file?.aiMetadata?.reasoning || null,
    is_perfect_match: props.file?.aiMetadata?.is_perfect_match,
    new_category_proposal: props.file?.aiMetadata?.new_category_proposal
  }

  emit('save', {
    fileId: props.file.id,
    aiMetadata: cleanedData
  })
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: $spacing-4;
}

.modal {
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  background: linear-gradient(145deg, rgba(31, 41, 55, 0.98), rgba(17, 24, 39, 0.98));
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: $radius-xl;
  box-shadow:
    0 25px 50px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: $spacing-5 $spacing-6;
    background: rgba(255, 255, 255, 0.02);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    flex-shrink: 0;

    h3 {
      color: $white;
      font-size: $font-size-lg;
      font-weight: 600;
      margin: 0;
    }
  }

  &__close {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: $radius-lg;
    color: $gray-400;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(239, 68, 68, 0.1);
      border-color: rgba(239, 68, 68, 0.3);
      color: #ef4444;
      transform: rotate(90deg);
    }
  }

  &__body {
    flex: 1;
    overflow-y: auto;
    padding: $spacing-6;
  }

  &__info {
    display: flex;
    align-items: center;
    gap: $spacing-4;
    padding: $spacing-4;
    background: rgba($primary-start, 0.08);
    border: 1px solid rgba($primary-start, 0.2);
    border-radius: $radius-lg;
    margin-bottom: $spacing-6;

    &-icon {
      font-size: 24px;
    }

    &-content {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    &-label {
      font-size: $font-size-xs;
      color: $gray-400;
    }

    &-value {
      font-size: $font-size-base;
      color: $white;
      font-weight: 500;
      word-break: break-all;
    }
  }

  &__section {
    margin-bottom: $spacing-6;

    &:last-child {
      margin-bottom: 0;
    }

    &-title {
      color: $white;
      font-size: $font-size-base;
      font-weight: 600;
      margin: 0 0 $spacing-4 0;
      display: flex;
      align-items: center;
      gap: $spacing-2;
    }
  }

  &__form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: $spacing-4;
    margin-bottom: $spacing-4;
  }

  &__form-group {
    margin-bottom: $spacing-4;

    label {
      display: block;
      color: $gray-300;
      font-size: $font-size-sm;
      font-weight: 500;
      margin-bottom: $spacing-2;
    }
  }

  &__label-optional {
    color: $gray-500;
    font-weight: 400;
  }

  &__input,
  &__textarea {
    width: 100%;
    padding: $spacing-3 $spacing-4;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: $radius-lg;
    color: $white;
    font-size: $font-size-base;
    transition: all 0.2s ease;

    &::placeholder {
      color: $gray-500;
    }

    &:hover {
      border-color: rgba(255, 255, 255, 0.2);
    }

    &:focus {
      outline: none;
      border-color: $primary-start;
      box-shadow: 0 0 0 3px rgba($primary-start, 0.15);
      background: rgba(0, 0, 0, 0.4);
    }

    &--small {
      padding: $spacing-2 $spacing-3;
      font-size: $font-size-sm;
    }
  }

  // Element Plus Select 样式覆盖
  :deep(.el-select) {
    width: 100%;

    .el-input__wrapper {
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: $radius-lg;
      box-shadow: none;
      transition: all 0.2s ease;

      &:hover {
        border-color: rgba(255, 255, 255, 0.2);
      }

      &.is-focus {
        border-color: $primary-start;
        box-shadow: 0 0 0 3px rgba($primary-start, 0.15);
      }
    }

    .el-input__inner {
      color: $white;
      background: transparent;

      &::placeholder {
        color: $gray-500;
      }
    }

    .el-input__suffix {
      .el-input__suffix-inner {
        .el-select__caret {
          color: $gray-400;
        }
      }
    }

    .el-input__clear {
      color: $gray-400;

      &:hover {
        color: $white;
      }
    }
  }

  &__textarea {
    resize: vertical;
    min-height: 80px;
    font-family: inherit;
  }

  &__filename-list {
    display: flex;
    flex-direction: column;
    gap: $spacing-3;
    margin-bottom: $spacing-3;
  }

  &__filename-item {
    display: flex;
    align-items: center;
    gap: $spacing-2;
  }

  &__filename-remove {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: $radius-md;
    color: #ef4444;
    cursor: pointer;
    font-size: 16px;
    font-weight: bold;
    transition: all 0.2s ease;
    flex-shrink: 0;

    &:hover {
      background: rgba(239, 68, 68, 0.2);
      transform: scale(1.1);
    }
  }

  &__tags {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-2;
    margin-bottom: $spacing-3;
  }

  &__tag {
    display: flex;
    align-items: center;
    gap: $spacing-2;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: $radius-lg;
    padding: $spacing-1;

    &-input {
      background: transparent;
      border: none;
      color: $white;
      font-size: $font-size-sm;
      padding: $spacing-1 $spacing-2;
      min-width: 80px;

      &::placeholder {
        color: $gray-500;
      }

      &:focus {
        outline: none;
      }
    }

    &-remove {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 50%;
      color: #ef4444;
      cursor: pointer;
      font-size: 12px;
      font-weight: bold;
      transition: all 0.2s ease;
      flex-shrink: 0;

      &:hover {
        background: rgba(239, 68, 68, 0.2);
        transform: scale(1.1);
      }
    }
  }

  &__add-btn {
    display: inline-flex;
    align-items: center;
    gap: $spacing-2;
    padding: $spacing-2 $spacing-4;
    background: rgba(255, 255, 255, 0.05);
    border: 1px dashed rgba(255, 255, 255, 0.2);
    border-radius: $radius-lg;
    color: $gray-400;
    font-size: $font-size-sm;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: rgba($primary-start, 0.1);
      border-color: rgba($primary-start, 0.3);
      color: $primary-start;
    }

    &--small {
      padding: $spacing-1 $spacing-3;
      font-size: $font-size-xs;
    }
  }

  &__footer {
    display: flex;
    justify-content: flex-end;
    gap: $spacing-3;
    padding: $spacing-4 $spacing-6;
    background: rgba(0, 0, 0, 0.2);
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    flex-shrink: 0;
  }

  &__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: $spacing-2;
    padding: $spacing-3 $spacing-5;
    border: none;
    border-radius: $radius-lg;
    font-size: $font-size-sm;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;

    &--cancel {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: $gray-400;

      &:hover {
        background: rgba(255, 255, 255, 0.1);
        color: $white;
      }
    }

    &--confirm {
      background: $primary-gradient;
      color: $white;
      min-width: 120px;

      &:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 4px 20px rgba($primary-start, 0.4);
      }

      &:active:not(:disabled) {
        transform: translateY(0);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }
    }

    &-loading {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

// 动画
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;

  .modal {
    transform: scale(0.95) translateY(10px);
  }
}

.modal-enter-active .modal,
.modal-leave-active .modal {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

// 响应式
@media (max-width: 768px) {
  .modal {
    max-width: 95vw;
    margin: $spacing-4;

    &__form-row {
      grid-template-columns: 1fr;
    }

    &__tags {
      flex-direction: column;
    }
  }
}
</style>
