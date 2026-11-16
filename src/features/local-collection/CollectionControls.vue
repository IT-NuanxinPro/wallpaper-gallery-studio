<template>
  <section class="collection-controls" aria-label="采集设置">
    <div class="collection-section-heading">
      <h2>采集设置</h2>
      <span>仅在本机运行</span>
    </div>
    <el-form label-position="top" :disabled="disabled || running" @submit.prevent="emit('start')">
      <el-form-item label="平台">
        <el-select
          :model-value="form.platform"
          aria-label="平台"
          @change="emit('platform', $event)"
        >
          <el-option
            v-for="item in platforms"
            :key="item.id"
            :label="item.label"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="图源">
        <el-select
          :model-value="form.source"
          filterable
          aria-label="图源"
          :loading="sourcesLoading"
          @change="update('source', $event)"
        >
          <el-option v-for="item in sources" :key="item.id" :label="item.label" :value="item.id" />
        </el-select>
      </el-form-item>
      <div class="collection-controls__pair">
        <el-form-item label="起始页">
          <el-input-number
            :model-value="form.startPage"
            :min="1"
            :max="100000"
            :precision="0"
            controls-position="right"
            aria-label="起始页"
            @update:model-value="update('startPage', $event)"
          />
        </el-form-item>
        <el-form-item label="抓取页数">
          <el-input-number
            :model-value="form.pages"
            :min="1"
            :max="10000"
            :precision="0"
            controls-position="right"
            aria-label="抓取页数"
            @update:model-value="update('pages', $event)"
          />
        </el-form-item>
      </div>
      <el-form-item label="新增上限 · 0 为不限">
        <el-input-number
          :model-value="form.limit"
          :min="0"
          :max="1000000"
          :precision="0"
          controls-position="right"
          aria-label="新增图片上限"
          @update:model-value="update('limit', $event)"
        />
      </el-form-item>
      <el-form-item label="设备类型">
        <el-select
          :model-value="form.series"
          multiple
          aria-label="设备类型"
          @update:model-value="update('series', $event)"
        >
          <el-option v-for="item in devices" :key="item.id" :label="item.label" :value="item.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="清晰度">
        <el-select
          :model-value="form.resolutions"
          multiple
          collapse-tags
          :max-collapse-tags="2"
          collapse-tags-tooltip
          aria-label="清晰度"
          @update:model-value="update('resolutions', $event)"
        >
          <el-option v-for="item in resolutions" :key="item" :label="item" :value="item" />
        </el-select>
      </el-form-item>
      <div class="collection-controls__switch">
        <div>
          <strong>采集完成后自动分批</strong>
          <p>按设备整理为待上传批次</p>
        </div>
        <el-switch
          :model-value="form.autoBatch"
          aria-label="采集完成后自动分批"
          @update:model-value="update('autoBatch', $event)"
        />
      </div>
      <el-collapse-transition>
        <div v-show="form.autoBatch" class="collection-controls__batch-options">
          <el-form-item label="每批数量">
            <el-segmented
              :model-value="form.batchSize"
              :options="[10, 20, 30]"
              aria-label="每批数量"
              @update:model-value="update('batchSize', $event)"
            />
          </el-form-item>
          <el-form-item label="首批计划日期">
            <el-date-picker
              :model-value="form.startDate"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="选择日期"
              aria-label="首批计划日期"
              :clearable="false"
              @update:model-value="update('startDate', $event)"
            />
          </el-form-item>
        </div>
      </el-collapse-transition>
      <el-button
        native-type="submit"
        type="primary"
        class="collection-controls__start"
        :icon="Download"
        :loading="busy === 'start'"
        :disabled="!form.source"
        >开始采集</el-button
      >
    </el-form>
    <el-button
      v-if="running"
      :icon="VideoPause"
      :loading="busy === 'stop'"
      :disabled="stopRequested"
      @click="emit('stop')"
      >{{ stopRequested ? '正在停止…' : '停止采集' }}</el-button
    >
    <p class="collection-controls__footnote">素材保存在本机，分批后可直接送到图片上传。</p>
  </section>
</template>

<script setup>
import { Download, VideoPause } from '@element-plus/icons-vue'

defineProps({
  form: { type: Object, required: true },
  platforms: { type: Array, default: () => [] },
  sources: { type: Array, default: () => [] },
  sourcesLoading: Boolean,
  disabled: Boolean,
  running: Boolean,
  stopRequested: Boolean,
  busy: { type: String, default: '' }
})
const emit = defineEmits(['update', 'platform', 'start', 'stop'])
const devices = [
  { id: 'desktop', label: '电脑壁纸' },
  { id: 'mobile', label: '手机壁纸' },
  { id: 'avatar', label: '头像' }
]
const resolutions = ['8K', '5K+', '4K', '2K', '1080P', '低于1080P']
const update = (key, value) => emit('update', { key, value })
</script>
