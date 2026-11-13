<template>
  <el-select
    class="custom-select"
    :model-value="modelValue"
    :placeholder="placeholder"
    :aria-label="placeholder"
    :filterable="filterable || allowCreate"
    :allow-create="allowCreate"
    :default-first-option="allowCreate"
    :clearable="clearable"
    :value-on-clear="''"
    :teleported="true"
    @update:model-value="emit('update:modelValue', $event)"
    @change="emit('change', $event)"
  >
    <el-option v-for="option in options" :key="option" :label="option" :value="option" />
  </el-select>
</template>

<script setup>
import { ElOption, ElSelect } from 'element-plus'

defineProps({
  modelValue: { type: String, default: '' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: '请选择' },
  allowCreate: { type: Boolean, default: false },
  clearable: { type: Boolean, default: false },
  filterable: { type: Boolean, default: true }
})

const emit = defineEmits(['update:modelValue', 'change'])
</script>

<style scoped>
.custom-select {
  width: 100%;
}
</style>
