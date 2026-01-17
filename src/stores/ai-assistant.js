/**
 * AI 助手 Store
 * 管理 AI 助手页面的状态
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useCredentialsStore } from './credentials'
import { sendMessage, ASSISTANT_CONFIG, getModelByKey } from '@/services/ai/assistant'

export const useAIAssistantStore = defineStore('ai-assistant', () => {
  // 状态
  const processing = ref(false)
  const currentModel = ref(ASSISTANT_CONFIG.defaultModel)
  const currentProvider = ref(ASSISTANT_CONFIG.defaultProvider)
  const systemPromptType = ref('default')
  const messages = ref([])
  const error = ref(null)

  // 计算属性
  const hasMessages = computed(() => messages.value.length > 0)
  const currentModelConfig = computed(() => getModelByKey(currentModel.value))

  /**
   * 发送消息
   * @param {Object} params - 参数
   * @param {string} params.text - 消息文本
   * @param {File} params.image - 图片文件（可选）
   * @returns {Promise<Object>} AI 响应
   */
  async function send({ text, image }) {
    processing.value = true
    error.value = null

    try {
      const credentialsStore = useCredentialsStore()

      if (!credentialsStore.hasCredentials) {
        throw new Error('请先配置 API 凭证')
      }

      const credentials = credentialsStore.getCredentialsByProvider(currentProvider.value)
      if (!credentials) {
        throw new Error(`未配置 ${currentProvider.value} 的凭证`)
      }

      // 添加用户消息
      const userMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
        image: image ? URL.createObjectURL(image) : null,
        timestamp: Date.now()
      }
      messages.value.push(userMessage)

      // 调用 AI
      const response = await sendMessage({
        message: text,
        image,
        providerType: currentProvider.value,
        credentials,
        modelKey: currentModel.value,
        systemPromptType: systemPromptType.value
      })

      // 添加 AI 响应
      const aiMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: response.message,
        raw: response.raw,
        timestamp: Date.now()
      }
      messages.value.push(aiMessage)

      // 限制历史消息数量
      if (messages.value.length > ASSISTANT_CONFIG.conversation.maxHistory * 2) {
        messages.value = messages.value.slice(-ASSISTANT_CONFIG.conversation.maxHistory * 2)
      }

      return aiMessage
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      processing.value = false
    }
  }

  /**
   * 设置模型
   */
  function setModel(modelKey) {
    currentModel.value = modelKey
  }

  /**
   * 设置 Provider
   */
  function setProvider(providerKey) {
    currentProvider.value = providerKey
  }

  /**
   * 设置系统提示词类型
   */
  function setSystemPromptType(type) {
    systemPromptType.value = type
  }

  /**
   * 清空对话
   */
  function clearMessages() {
    messages.value = []
    error.value = null
  }

  return {
    // 状态
    processing,
    currentModel,
    currentProvider,
    systemPromptType,
    messages,
    error,

    // 计算属性
    hasMessages,
    currentModelConfig,

    // 方法
    send,
    setModel,
    setProvider,
    setSystemPromptType,
    clearMessages
  }
})
