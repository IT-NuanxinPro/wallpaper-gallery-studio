<template>
  <section class="repository-picker" aria-label="选择 GitHub 仓库">
    <p class="repository-picker__hint">
      请选择保存壁纸和视频的数据仓库；工作台源码仓库无需选在这里。
    </p>
    <el-input
      v-model="search"
      :prefix-icon="Search"
      aria-label="搜索仓库"
      placeholder="搜索仓库名称或所有者"
      clearable
      class="repository-picker__search"
    />
    <Transition name="studio-feedback">
      <div v-if="error" class="repository-picker__error" role="alert">
        <span>{{ error }}</span
        ><el-button link :disabled="loading" @click="loadPage(nextPage)">重试</el-button>
      </div>
    </Transition>
    <div v-if="loading && !repositories.length" class="repository-picker__empty" role="status">
      <el-icon class="is-loading"><Loading /></el-icon><span>正在读取可访问的仓库…</span>
    </div>
    <div v-else-if="!filteredRepositories.length" class="repository-picker__empty">
      <el-icon><FolderOpened /></el-icon
      ><span>{{ search ? '已加载的仓库中没有匹配结果' : '当前账号暂未返回可访问的仓库' }}</span
      ><small>{{
        hasMore ? '可以继续加载更多仓库。' : '检查账号或 Token 的仓库访问范围后重试。'
      }}</small
      ><el-button v-if="!hasMore && !search" link :disabled="loading" @click="loadPage(1)"
        >重新加载</el-button
      >
    </div>
    <TransitionGroup
      v-else
      name="studio-list"
      tag="ul"
      class="repository-picker__list"
      data-scroll-region
      tabindex="0"
      aria-label="可访问的仓库列表"
    >
      <li v-for="repository in filteredRepositories" :key="repository.id">
        <button
          type="button"
          class="repository-picker__item"
          :class="{ 'is-selected': String(selectedId) === String(repository.id) }"
          :aria-pressed="String(selectedId) === String(repository.id)"
          @click="$emit('select', repository)"
        >
          <el-icon class="repository-picker__icon"><Folder /></el-icon>
          <span class="repository-picker__copy"
            ><strong>{{ repository.fullName }}</strong
            ><span
              >{{ repository.defaultBranch || 'main' }} · {{ permissionLabel(repository)
              }}<span v-if="repository.archived"> · 已归档</span></span
            ></span
          >
          <span class="repository-picker__visibility"
            ><el-icon v-if="repository.private"><Lock /></el-icon
            >{{ repository.private ? '私有' : '公开' }}</span
          >
          <el-icon
            v-if="String(selectedId) === String(repository.id)"
            class="repository-picker__check"
            ><Check
          /></el-icon>
        </button>
      </li>
    </TransitionGroup>
    <div class="repository-picker__footer">
      <span>已加载 {{ repositories.length }} 个仓库</span
      ><el-button v-if="hasMore" link :loading="loading" @click="loadPage(nextPage)"
        >加载更多</el-button
      >
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Check, Folder, FolderOpened, Loading, Lock, Search } from '@element-plus/icons-vue'
import { fetchRepositories } from '@/services/repository-discovery'

const props = defineProps({
  token: { type: String, required: true },
  selectedId: { type: [String, Number], default: '' }
})
defineEmits(['select'])
const repositories = ref([])
const search = ref('')
const loading = ref(false)
const error = ref('')
const hasMore = ref(false)
const nextPage = ref(1)
let controller
let requestId = 0
const filteredRepositories = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return repositories.value.filter(repository =>
    repository.fullName.toLocaleLowerCase().includes(query)
  )
})
function permissionLabel(repository) {
  if (repository.archived) return '只读'
  return { admin: '管理', write: '可写', read: '只读' }[repository.permission] || '只读'
}
async function loadPage(page) {
  if (!props.token) return
  const currentRequest = ++requestId
  controller?.abort()
  controller = new globalThis.AbortController()
  loading.value = true
  error.value = ''
  try {
    const result = await fetchRepositories({ token: props.token, page, signal: controller.signal })
    if (currentRequest !== requestId) return
    const combined =
      page === 1 ? result.repositories : [...repositories.value, ...result.repositories]
    repositories.value = [
      ...new Map(combined.map(repository => [repository.id, repository])).values()
    ]
    hasMore.value = result.hasMore
    nextPage.value = page + 1
  } catch (failure) {
    if (currentRequest === requestId && failure.name !== 'AbortError') {
      error.value = '无法读取仓库列表，请检查网络和 Token 的仓库访问范围。'
      nextPage.value = page
    }
  } finally {
    if (currentRequest === requestId) loading.value = false
  }
}
watch(
  () => props.token,
  () => {
    requestId++
    controller?.abort()
    repositories.value = []
    search.value = ''
    nextPage.value = 1
    hasMore.value = false
    loadPage(1)
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  requestId++
  controller?.abort()
  repositories.value = []
})
</script>

<style scoped lang="scss">
.repository-picker {
  &__hint {
    margin: 0 0 12px;
    font-size: 11px;
    color: #a8b6ca;
    line-height: 1.65;
  }
  &__search {
    margin-bottom: 12px;
  }
  &__search :deep(.el-input__wrapper) {
    min-height: 39px;
    border-radius: 999px;
    background: rgba(9, 14, 24, 0.27);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
  }
  &__search :deep(.el-input__inner) {
    color: #f4f6fb;
  }
  &__list {
    position: relative;
    list-style: none;
    padding: 0;
    margin: 0;
    max-height: 270px;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }
  &__list li + li {
    margin-top: 4px;
  }
  &__item {
    display: flex;
    align-items: center;
    gap: 11px;
    width: 100%;
    padding: 12px;
    border: 1px solid transparent;
    border-radius: 13px;
    background: transparent;
    text-align: left;
    color: #eef3fb;
    cursor: pointer;
  }
  &__item:hover {
    background: rgba(138, 162, 196, 0.09);
  }
  &__item.is-selected {
    background: rgba(125, 183, 255, 0.13);
    border-color: rgba(125, 183, 255, 0.25);
  }
  &__icon {
    color: #b1c9e7;
    font-size: 19px;
    flex: none;
  }
  &__copy {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  &__copy strong {
    font-size: 13px;
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  &__copy > span {
    font-size: 11px;
    color: #a8b6ca;
  }
  &__visibility {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: #b1bdcf;
    white-space: nowrap;
  }
  &__check {
    color: #a8ceff;
  }
  &__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 34px;
    margin-top: 7px;
    color: #9eacc1;
    font-size: 11px;
  }
  &__error {
    display: flex;
    align-items: center;
    gap: 12px;
    color: #ffb5b5;
    padding: 12px;
    margin-bottom: 10px;
    border-radius: 12px;
    background: rgba(162, 67, 67, 0.1);
    font-size: 12px;
    line-height: 1.6;
  }
  &__empty {
    min-height: 125px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 11px;
    padding: 20px;
    color: #b1b9c9;
    text-align: center;
    font-size: 12px;
  }
  &__empty .el-icon {
    font-size: 24px;
  }
  &__empty small {
    font-size: 11px;
    line-height: 1.6;
    color: #95a3b8;
  }
  button:focus-visible,
  &__list:focus-visible {
    outline: 2px solid #7db7ff;
    outline-offset: -2px;
  }
  @media (max-width: 520px) {
    &__list {
      max-height: 220px;
    }
    &__item {
      gap: 8px;
      padding: 11px 8px;
    }
  }
}
</style>
