<template>
  <div class="upload-header">
    <div class="upload-header__top">
      <span class="upload-header__label">AI 图片上传</span>
      <div class="upload-header__actions">
        <Transition name="studio-feedback">
          <div v-if="filesCount > 0" class="upload-header__stats">
            <span class="upload-header__count"
              ><el-icon><Picture /></el-icon>{{ filesCount }}</span
            >
            <button
              v-if="errorCount > 0"
              type="button"
              class="upload-header__error"
              :disabled="uploading"
              @click="requestAction('retry')"
            >
              {{ errorCount }} 失败
            </button>
            <button
              v-if="!uploading"
              class="upload-header__btn-clear"
              aria-label="清空上传列表"
              @click="$emit('clear')"
            >
              <el-icon><Delete /></el-icon>
            </button>
          </div>
        </Transition>
        <button
          v-if="metadataStatus === 'error'"
          class="upload-header__btn-metadata"
          :disabled="uploading"
          @click="requestAction('retry-metadata')"
        >
          重试元数据
        </button>
        <button
          v-if="canUpload"
          class="upload-header__btn-upload"
          :disabled="uploading"
          @click="requestAction('upload')"
        >
          <el-icon v-if="uploading" class="is-loading"><Loading /></el-icon>
          <el-icon v-else><Upload /></el-icon>
          <span>{{ uploading ? `${progress}%` : '上传' }}</span>
        </button>
      </div>
    </div>
    <div class="upload-header__context-shell">
      <div class="upload-header__context-panel">
        <div class="upload-header__context-head">
          <span class="upload-header__series-label">系列</span>
          <p class="upload-header__hint">先选类型，再让 AI 推荐分类。</p>
        </div>
        <div class="upload-header__series-btns">
          <button
            v-for="s in seriesOptions"
            :key="s.value"
            class="upload-header__series-btn"
            :class="{ 'upload-header__series-btn--active': currentSeries === s.value }"
            :aria-pressed="currentSeries === s.value"
            :disabled="uploading"
            @click="$emit('series-change', s.value)"
          >
            <el-icon><component :is="s.icon" /></el-icon><span>{{ s.label }}</span>
          </button>
        </div>
      </div>
      <div class="upload-header__context-panel">
        <div class="upload-header__context-head">
          <span class="upload-header__series-label">模型</span>
          <p class="upload-header__hint">与视频分析、AI 工坊共用配置</p>
        </div>
        <div class="upload-header__ai-btn">
          <span class="upload-header__ai-btn-copy"
            ><span class="upload-header__ai-btn-text">GPT-6.1 Sol</span
            ><span class="upload-header__ai-btn-provider">{{
              credentialsStore.hasCredentials ? '当前标签页已配置' : '未配置 API Key'
            }}</span></span
          >
          <span v-if="aiAnalyzing" class="upload-header__ai-btn-badge">{{ aiAnalyzingCount }}</span>
          <router-link to="/settings#ai-config" class="upload-header__ai-settings">{{
            credentialsStore.hasCredentials ? 'AI 配置' : '去设置'
          }}</router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Monitor, Iphone, User, Picture, Delete, Upload, Loading } from '@element-plus/icons-vue'
import { useCredentialsStore } from '@/stores/credentials'
import { useAiConfigurationGuard } from '@/composables/useAiConfigurationGuard'

const credentialsStore = useCredentialsStore()
const { requireAiConfiguration } = useAiConfigurationGuard()
const props = defineProps({
  currentSeries: { type: String, default: 'desktop' },
  aiAnalyzing: { type: Boolean, default: false },
  aiAnalyzingCount: { type: Number, default: 0 },
  filesCount: { type: Number, default: 0 },
  errorCount: { type: Number, default: 0 },
  uploading: { type: Boolean, default: false },
  progress: { type: Number, default: 0 },
  canUpload: { type: Boolean, default: true },
  metadataStatus: { type: String, default: 'idle' }
})
const emit = defineEmits(['series-change', 'retry-metadata', 'retry', 'clear', 'upload'])
const seriesOptions = [
  { value: 'desktop', label: '电脑', icon: Monitor },
  { value: 'mobile', label: '手机', icon: Iphone },
  { value: 'avatar', label: '头像', icon: User }
]
function requestAction(action) {
  if (props.uploading || !props.canUpload || !requireAiConfiguration()) return
  emit(action)
}
</script>

<style scoped lang="scss">
.upload-header__label {
  color: var(--studio-text);
  font-size: 13px;
  font-weight: 600;
}
.upload-header {
  display: grid;
  gap: 20px;
  padding-bottom: 20px;
  margin-bottom: 18px;
  border-bottom: 1px solid var(--studio-border, #30343b);
  flex-shrink: 0;
  min-height: 0;
}
.upload-header__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.upload-header__context-shell {
  display: grid;
  grid-template-columns: minmax(190px, 0.8fr) minmax(230px, 1.2fr);
  gap: 24px;
}
.upload-header__context-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.upload-header__context-head {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.upload-header__series-label {
  color: var(--studio-text, #f3f4f6);
  font-size: 12px;
  font-weight: 500;
}
.upload-header__hint {
  margin: 0;
  color: var(--studio-muted, #a1a6b0);
  font-size: 11px;
  line-height: 1.5;
}
.upload-header__series-btns {
  display: flex;
  gap: 6px;
}
.upload-header__series-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 36px;
  padding: 0 12px;
  color: var(--studio-muted, #a1a6b0);
  background: transparent;
  border: 1px solid var(--studio-border, #30343b);
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
  transition:
    color 0.16s,
    border-color 0.16s,
    background-color 0.16s;
}
.upload-header__series-btn .el-icon {
  font-size: 15px;
}
.upload-header__series-btn:hover {
  color: var(--studio-text, #f3f4f6);
  border-color: var(--studio-muted, #a1a6b0);
}
.upload-header__series-btn--active {
  color: var(--studio-accent, #a8c7fa);
  border-color: var(--studio-accent, #a8c7fa);
  background: var(--studio-raised, #22252a);
}
.upload-header__ai-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  width: 100%;
  min-height: 36px;
}
.upload-header__ai-btn-copy {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 7px 10px;
}
.upload-header__ai-btn-text {
  color: var(--studio-text, #f3f4f6);
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}
.upload-header__ai-btn-provider {
  color: var(--studio-muted, #a1a6b0);
  font-size: 11px;
}
.upload-header__ai-btn-badge {
  min-width: 20px;
  padding: 3px 6px;
  border-radius: 5px;
  color: var(--el-color-warning, #e6a23c);
  background: var(--studio-raised, #22252a);
  font-size: 11px;
  text-align: center;
}
.upload-header__ai-settings {
  flex-shrink: 0;
  color: var(--studio-accent, #a8c7fa);
  font-size: 12px;
  text-decoration: none;
}
.upload-header__ai-settings:hover {
  text-decoration: underline;
}
.upload-header__actions,
.upload-header__stats {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.upload-header__count {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 6px;
  font-size: 12px;
  color: var(--studio-muted, #a1a6b0);
  font-variant-numeric: tabular-nums;
}
.upload-header__btn-clear,
.upload-header__btn-metadata,
.upload-header__error {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid var(--studio-border, #30343b);
  border-radius: 999px;
  background: transparent;
  color: var(--studio-muted, #a1a6b0);
  cursor: pointer;
  font-size: 12px;
}
.upload-header__btn-clear:hover {
  color: var(--el-color-danger, #f56c6c);
}
.upload-header__error {
  color: var(--el-color-danger, #f56c6c);
}
.upload-header__btn-metadata {
  color: var(--el-color-warning, #e6a23c);
}
.upload-header__btn-upload {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: var(--studio-accent, #a8c7fa);
  color: #111214;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.upload-header__btn-upload:hover:not(:disabled) {
  filter: brightness(1.08);
}
.upload-header__btn-upload:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.upload-header button:focus-visible,
.upload-header a:focus-visible {
  outline: 2px solid var(--studio-accent, #a8c7fa);
  outline-offset: 3px;
}
.is-loading {
  animation: spin 1s linear infinite;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 1450px) {
  .upload-header__context-shell {
    grid-template-columns: 1fr;
    gap: 18px;
  }
}
@media (max-width: 640px) {
  .upload-header__actions {
    justify-content: flex-end;
  }
  .upload-header__series-btn {
    flex: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .upload-header *,
  .fade-enter-active,
  .fade-leave-active {
    transition: none;
  }
  .is-loading {
    animation-duration: 2s;
  }
}
</style>
