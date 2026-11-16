<template>
  <div class="collection-batches">
    <div v-if="!batches.length" class="collection-empty">
      <el-icon :size="34"><FolderOpened /></el-icon>
      <h3>{{ history ? '还没有历史批次' : '待上传批次会出现在这里' }}</h3>
      <p>
        {{
          history
            ? '完成本地清理的批次仍可在此追溯。'
            : '开始采集并自动分批，或从本地图库整理已有素材。'
        }}
      </p>
    </div>
    <TransitionGroup v-else name="studio-list" tag="div" class="collection-batches__list">
      <article
        v-for="batch in batches"
        :key="batch.id"
        class="collection-batch"
        :data-batch-id="batch.id"
      >
        <button
          type="button"
          class="collection-batch__cover"
          :disabled="disabled || history"
          :aria-label="'查看 ' + (batch.name || batch.id) + ' 的图片'"
          @click="emit('preview', batch)"
        >
          <img
            v-if="!history && batch.items?.length"
            :src="thumbnailUrl({ batchId: batch.id, itemId: batch.items[0].sourceItemId })"
            alt=""
            loading="lazy"
            @error="hideImage"
          />
          <el-icon v-else :size="28"><Folder /></el-icon>
          <span>{{ batch.count ?? batch.items?.length ?? 0 }} 张</span>
        </button>
        <div class="collection-batch__body">
          <div class="collection-batch__heading">
            <h3 :title="batch.name || batch.id">{{ batch.name || batch.id }}</h3>
            <el-tag :type="statusType(batch)" size="small" effect="plain">{{
              statusText(batch)
            }}</el-tag>
          </div>
          <p class="collection-batch__meta">
            {{ devices[batch.series] || batch.series }} · {{ batch.platform }} /
            {{ batch.source }} · 计划 {{ batch.plannedDate || '未设置' }}
          </p>
          <div class="collection-batch__verification">
            <span>本地现有 {{ batch.count ?? batch.items?.length ?? 0 }} 张</span>
            <span v-if="batch.studio?.repository" class="collection-batch__repository">
              {{ batch.studio.repository.owner }}/{{ batch.studio.repository.repo }}
            </span>
          </div>
          <div v-if="!history" class="collection-batch__actions">
            <el-button
              size="small"
              :disabled="disabled || Boolean(busy)"
              @click="emit('preview', batch)"
              >查看图片</el-button
            >
            <el-button
              type="primary"
              size="small"
              :icon="Upload"
              :disabled="disabled || Boolean(busy)"
              @click="emit('import', batch)"
              >送到图片上传</el-button
            >
            <el-button
              size="small"
              :disabled="disabled || Boolean(busy)"
              :loading="busy === `clean:${batch.id}`"
              @click="emit('clean', batch)"
              >清理本地</el-button
            >
            <span class="collection-batch__policy">{{
              batch.studio?.importedAt ? '保留的图片上传成功后自动清理本批' : '可手动清理本批'
            }}</span>
          </div>
          <p v-else class="collection-batch__archived">
            {{ batch.completedAt || batch.createdAt || '' }}
          </p>
        </div>
      </article>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { Folder, FolderOpened, Upload } from '@element-plus/icons-vue'

defineProps({
  batches: { type: Array, default: () => [] },
  history: Boolean,
  disabled: Boolean,
  busy: { type: String, default: '' },
  thumbnailUrl: { type: Function, required: true }
})
const emit = defineEmits(['import', 'clean', 'preview'])
const devices = { desktop: '电脑壁纸', mobile: '手机壁纸', avatar: '头像' }
function statusText(batch) {
  if (batch.status === 'completed') return '本地已清理'
  if (batch.status === 'canceled' || batch.status === 'cancelled') return '已取消'
  if (batch.status === 'cleanup_failed') return '清理未完成'
  if (batch.studio?.importedAt) return '已送入上传页'
  return '待处理'
}
function statusType(batch) {
  if (batch.status === 'cleanup_failed') return 'danger'
  return batch.studio?.readyToClean || batch.status === 'completed' ? 'success' : 'info'
}
function hideImage(event) {
  event.target.style.visibility = 'hidden'
}
</script>
