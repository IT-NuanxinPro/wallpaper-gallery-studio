<script setup>
import { onBeforeUnmount, watch } from 'vue'
import { useCredentialsStore } from '@/stores/credentials'
import { resumeAiTaskQueue } from '@/services/ai/task-runner'

// 在首次路由渲染前确定标签页会话，复制或新建标签页不会继承AI密钥。
const credentials = useCredentialsStore()
credentials.loadCredentials()
watch(
  () => credentials.sessionRevision,
  () => {
    if (credentials.hasModelReady) resumeAiTaskQueue()
  }
)
// 浏览器从页面快照恢复时不重新执行setup，主动丢弃旧页面中的AI会话。
const handlePageRestore = event => {
  if (event.persisted) credentials.clearCredentials()
}
window.addEventListener('pageshow', handlePageRestore)
onBeforeUnmount(() => window.removeEventListener('pageshow', handlePageRestore))
</script>

<template>
  <router-view />
</template>

<style scoped></style>
