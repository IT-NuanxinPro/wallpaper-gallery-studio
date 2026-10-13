import { ref, watch } from 'vue'
import { useZIndex } from 'element-plus'

// 与 Element Plus 共用层级，保证后打开的弹窗及其遮罩始终位于上方。
export function useModalZIndex(visible) {
  const { nextZIndex } = useZIndex()
  const zIndex = ref(0)

  watch(
    visible,
    isVisible => {
      if (isVisible) zIndex.value = nextZIndex()
    },
    { immediate: true, flush: 'sync' }
  )

  return zIndex
}
