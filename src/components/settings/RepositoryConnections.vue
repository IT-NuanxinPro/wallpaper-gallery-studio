<template>
  <section class="repository-connections" aria-label="关联工作流与网站">
    <div class="repository-connections__heading">
      <p>根据数据仓库识别发布工作流和网站，未能唯一识别时从列表选择。</p>
      <el-button size="small" :loading="loading" :disabled="!token || busy" @click="discover"
        >自动关联</el-button
      >
    </div>
    <p v-if="message" class="repository-connections__message" role="status">{{ message }}</p>
    <el-form-item v-for="role in roles" :key="role.key" :label="role.label">
      <el-select
        :model-value="value(role.key)"
        :aria-label="role.label"
        filterable
        clearable
        :loading="loading"
        :disabled="busy || !token"
        placeholder="从 GitHub 仓库中选择"
        @visible-change="openList"
        @update:model-value="select(role.key, $event)"
      >
        <el-option
          v-for="repo in options(role.key)"
          :key="repo.fullName"
          :value="repo.fullName"
          :label="repo.fullName"
        >
          <span>{{ repo.fullName }}</span
          ><small v-if="matches(role.key, repo)"> · 已识别关联</small>
        </el-option>
      </el-select>
    </el-form-item>
    <el-button v-if="hasMore" link :loading="loading" @click="loadMore">加载更多仓库</el-button>
    <p v-if="!token" class="repository-connections__message">登录 GitHub 后可自动读取关联仓库。</p>
  </section>
</template>
<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { discoverRepositoryConnections } from '@/services/repository-connections'
import { fetchRepositories } from '@/services/repository-discovery'
const props = defineProps({
  modelValue: { type: Object, required: true },
  token: { type: String, default: '' },
  busy: Boolean
})
const emit = defineEmits(['update:modelValue'])
const roles = [
  { key: 'workflow', label: '发布工作流仓库' },
  { key: 'frontend', label: '壁纸网站仓库' }
]
const repositories = ref([])
const candidates = ref({ workflow: [], frontend: [] })
const loading = ref(false)
const message = ref('')
const hasMore = ref(false)
let nextPage = 1
let sequence = 0
let controller
function value(role) {
  const owner = props.modelValue[role + 'Owner'],
    repo = props.modelValue[role + 'Repo']
  return owner && repo ? owner + '/' + repo : ''
}
function options(role) {
  const saved = value(role)
  const all = [...candidates.value[role], ...repositories.value]
  if (saved) all.push({ fullName: saved })
  return [...new Map(all.map(repo => [repo.fullName, repo])).values()]
}
function matches(role, repo) {
  return candidates.value[role].some(item => item.fullName === repo.fullName)
}
function select(role, fullName) {
  const [owner = '', repo = ''] = (fullName || '').split('/')
  emit('update:modelValue', { ...props.modelValue, [role + 'Owner']: owner, [role + 'Repo']: repo })
}
async function discover() {
  if (loading.value || !props.token || !props.modelValue.owner || !props.modelValue.repo) return
  const id = ++sequence
  controller?.abort()
  controller = new globalThis.AbortController()
  loading.value = true
  message.value = '正在读取仓库关联…'
  const original = { ...props.modelValue }
  try {
    const result = await discoverRepositoryConnections({
      config: original,
      token: props.token,
      signal: controller.signal
    })
    if (id !== sequence) return
    if (result.repositories.length) repositories.value = result.repositories
    candidates.value = result.candidates
    const next = { ...props.modelValue }
    for (const role of roles) {
      const fields = [role.key + 'Owner', role.key + 'Repo']
      if (fields.every(field => next[field] === original[field] && result.connections[field]))
        fields.forEach(field => {
          next[field] = result.connections[field]
        })
    }
    emit('update:modelValue', next)
    message.value = Object.keys(result.connections).length
      ? '已识别关联，保存后生效。'
      : original.workflowRepo && original.frontendRepo
        ? '已保留当前关联。需要更换时从下方列表选择。'
        : '暂未找到唯一关联，请从下方仓库列表选择，无需手填名称。'
    hasMore.value = !result.complete
    nextPage = Math.floor(repositories.value.length / 100) + 1
  } catch (error) {
    if (id === sequence && error.name !== 'AbortError') message.value = error.message
  } finally {
    if (id === sequence) loading.value = false
  }
}
async function loadMore() {
  if (loading.value || !props.token) return
  const id = ++sequence
  controller?.abort()
  controller = new globalThis.AbortController()
  loading.value = true
  try {
    const result = await fetchRepositories({
      token: props.token,
      page: nextPage,
      signal: controller.signal
    })
    if (id !== sequence) return
    repositories.value = [
      ...new Map(
        [...repositories.value, ...result.repositories].map(repo => [repo.fullName, repo])
      ).values()
    ]
    hasMore.value = result.hasMore
    nextPage++
  } catch (error) {
    if (id === sequence && error.name !== 'AbortError') message.value = error.message
  } finally {
    if (id === sequence) loading.value = false
  }
}
function openList(open) {
  if (open && !repositories.value.length) loadMore()
}
watch(
  [
    () => props.token,
    () => props.modelValue.owner,
    () => props.modelValue.repo,
    () => props.modelValue.branch
  ],
  () => {
    sequence++
    controller?.abort()
    loading.value = false
    repositories.value = []
    candidates.value = { workflow: [], frontend: [] }
    nextPage = 1
    hasMore.value = false
    message.value = ''
    if (
      props.token &&
      props.modelValue.owner &&
      props.modelValue.repo &&
      (!props.modelValue.workflowRepo || !props.modelValue.frontendRepo)
    )
      discover()
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  sequence++
  controller?.abort()
})
</script>
<style scoped lang="scss">
.repository-connections {
  &__heading {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }
  p {
    margin: 0;
    flex: 1;
    color: var(--studio-muted, #b1b9c9);
    font-size: 12px;
    line-height: 1.7;
  }
  &__message {
    margin-bottom: 14px !important;
  }
  .el-select {
    width: 100%;
  }
  small {
    color: var(--studio-muted);
  }
}
</style>
