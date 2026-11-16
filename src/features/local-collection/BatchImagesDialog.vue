<template>
  <el-dialog
    :model-value="modelValue"
    class="batch-images-dialog"
    width="min(960px, calc(100vw - 32px))"
    top="7vh"
    destroy-on-close
    :close-on-click-modal="!deleting"
    :close-on-press-escape="!deleting"
    :show-close="!deleting"
    append-to-body
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <template #header>
      <div class="batch-images-dialog__heading">
        <h2>{{ current.name || batch.name || '批次图片' }}</h2>
        <p :title="current.directory">{{ current.directory || batch.directory }}</p>
      </div>
    </template>
    <div class="batch-images-dialog__toolbar">
      <el-checkbox
        :model-value="allSelected"
        :indeterminate="selected.length > 0 && !allSelected"
        :disabled="deleting || !items.length"
        @update:model-value="toggleAll"
        >全选当前批次</el-checkbox
      >
      <span role="status">本地 {{ items.length }} 张 · 已选 {{ selected.length }} 张</span>
      <el-button
        :icon="Refresh"
        circle
        :loading="loading"
        :disabled="deleting"
        aria-label="刷新批次图片"
        @click="refresh"
      />
    </div>
    <p v-if="error" class="batch-images-dialog__error" role="alert">{{ error }}</p>
    <div
      class="batch-images-dialog__scroll"
      data-scroll-region
      tabindex="0"
      aria-label="批次图片，可独立滚动"
      :aria-busy="loading"
    >
      <div v-if="!items.length && !loading" class="collection-empty">
        <el-icon :size="34"><Picture /></el-icon>
        <h3>这个批次已没有本地图片</h3>
        <p>删除后的图片不会继续留在列表里。</p>
      </div>
      <div v-else class="batch-images-dialog__grid">
        <article
          v-for="(item, index) in items"
          :key="item.sourceItemId"
          :data-item-id="item.sourceItemId"
          class="batch-image"
          :class="{ 'is-selected': selected.includes(item.sourceItemId) }"
        >
          <el-image
            :src="api.thumbnailUrl({ batchId: batch.id, itemId: item.sourceItemId })"
            :preview-src-list="previewUrls"
            :initial-index="index"
            preview-teleported
            fit="cover"
            loading="lazy"
            :alt="item.filename"
          >
            <template #error><span class="batch-image__missing">预览暂不可用</span></template>
          </el-image>
          <el-checkbox
            :model-value="selected.includes(item.sourceItemId)"
            :aria-label="'选择 ' + item.filename"
            :disabled="deleting"
            @update:model-value="toggle(item.sourceItemId, $event)"
          />
          <div class="batch-image__caption">
            <span :title="item.filename">{{ item.filename }}</span>
            <el-button
              text
              circle
              :icon="Delete"
              :disabled="deleting"
              :aria-label="'删除 ' + item.filename"
              @click="remove([item.sourceItemId])"
            />
          </div>
        </article>
      </div>
    </div>
    <template #footer>
      <div class="batch-images-dialog__footer">
        <span>删除会同时移除本地原图与批次文件。</span>
        <el-button :disabled="deleting" @click="$emit('update:modelValue', false)">关闭</el-button>
        <el-button
          type="danger"
          :disabled="!selected.length || deleting || loading"
          :loading="deleting"
          data-testid="delete-selected"
          @click="remove(selected)"
          >删除所选{{ selected.length ? ' ' + selected.length + ' 张' : '' }}</el-button
        >
      </div>
    </template>
  </el-dialog>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Picture, Refresh } from '@element-plus/icons-vue'
import { createCollectorApi } from './api'

const props = defineProps({
  modelValue: Boolean,
  batch: { type: Object, required: true },
  collectorId: { type: String, required: true }
})
const emit = defineEmits(['update:modelValue', 'updated'])
const api = createCollectorApi()
const current = ref(props.batch)
const selected = ref([])
const loading = ref(false)
const deleting = ref(false)
const error = ref('')
let sequence = 0
let disposed = false
const items = computed(() => current.value.items || [])
const allSelected = computed(
  () => items.value.length > 0 && selected.value.length === items.value.length
)
const previewUrls = computed(() =>
  items.value.map(item => api.imageUrl({ batchId: props.batch.id, itemId: item.sourceItemId }))
)
function accept(batch) {
  current.value = batch
  const live = new Set((batch.items || []).map(item => item.sourceItemId))
  selected.value = selected.value.filter(id => live.has(id))
}
function toggle(id, checked) {
  selected.value = checked
    ? [...new Set([...selected.value, id])]
    : selected.value.filter(value => value !== id)
}
function toggleAll(checked) {
  selected.value = checked ? items.value.map(item => item.sourceItemId) : []
}
async function refresh() {
  if (!props.modelValue || deleting.value) return
  const request = ++sequence
  loading.value = true
  error.value = ''
  try {
    const { batch } = await api.batch(props.batch.id)
    if (!disposed && request === sequence) accept(batch)
  } catch (cause) {
    if (!disposed && request === sequence) error.value = cause.message
  } finally {
    if (request === sequence) loading.value = false
  }
}
async function remove(ids) {
  if (deleting.value || !ids.length) return
  const batchId = props.batch.id
  const requested = [...ids]
  deleting.value = true
  sequence++
  loading.value = false
  error.value = ''
  try {
    await ElMessageBox.confirm(
      `永久删除所选 ${requested.length} 张图片的本地原图和批次硬链接？删除后不会保留在批次列表中，也无法从本工作台撤销。`,
      '确认删除本地图片？',
      {
        confirmButtonText: '确认永久删除',
        cancelButtonText: '保留图片',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
        closeOnClickModal: false
      }
    )
    if (disposed || !props.modelValue || props.batch.id !== batchId) return
    const result = await api.deleteItems({
      batchId,
      collectorId: props.collectorId,
      items: requested,
      confirmed: true
    })
    if (disposed || props.batch.id !== batchId) return
    accept(result.batch)
    emit('updated', result.batch)
    ElMessage.success('所选图片已从本地移除')
  } catch (cause) {
    if (!disposed && cause !== 'cancel' && cause !== 'close')
      error.value = cause.message || '删除未完成，请刷新确认本地文件'
  } finally {
    deleting.value = false
  }
}
watch(
  [() => props.modelValue, () => props.batch.id],
  ([visible]) => {
    sequence++
    selected.value = []
    accept(props.batch)
    if (visible) refresh()
  },
  { immediate: true }
)
watch(
  () => props.batch,
  batch => {
    if (props.modelValue && !deleting.value) accept(batch)
  }
)
onBeforeUnmount(() => {
  disposed = true
  sequence++
})
</script>
