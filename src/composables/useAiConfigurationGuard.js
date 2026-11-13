import { h } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useCredentialsStore } from '@/stores/credentials'

let configurationNotice

export function useAiConfigurationGuard() {
  const credentials = useCredentialsStore()
  const router = useRouter()

  function requireAiConfiguration() {
    credentials.loadCredentials()
    if (credentials.hasModelReady) return true
    if (configurationNotice) return false
    configurationNotice = ElMessage({
      type: 'warning',
      customClass: 'studio-action-notice',
      duration: 5000,
      showClose: true,
      message: h('span', { class: 'studio-action-notice__content' }, [
        h(
          'span',
          credentials.hasCredentials ? '请先获取模型列表并选择模型' : '请先配置 API Key，再继续操作'
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'studio-action-notice__action',
            onClick: () => {
              configurationNotice?.close()
              configurationNotice = null
              router.push('/settings#ai-config')
            }
          },
          '去配置'
        )
      ]),
      onClose: () => {
        configurationNotice = null
      }
    })
    return false
  }

  return { requireAiConfiguration }
}
