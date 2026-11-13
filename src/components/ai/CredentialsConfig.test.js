import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import ElementPlus from 'element-plus'
import CredentialsConfig from './CredentialsConfig.vue'

const state = vi.hoisted(() => ({ store: null, fetchRemoteModels: vi.fn() }))
vi.mock('@/stores/credentials', () => ({ useCredentialsStore: () => state.store }))
vi.mock('@/services/ai/remote-models', () => ({ fetchRemoteModels: state.fetchRemoteModels }))
let panel
beforeEach(() => {
  state.fetchRemoteModels.mockReset()
  state.store = reactive({
    apiKey: '',
    baseUrl: 'https://api.example.test/v1',
    selectedModel: '',
    models: [],
    hasCredentials: false,
    hasModelReady: false,
    sessionRevision: 0,
    storageWarning: '',
    loadCredentials: vi.fn().mockResolvedValue(),
    saveCredentials: vi.fn(async ({ apiKey, baseUrl, model, models }) => {
      Object.assign(state.store, {
        apiKey,
        baseUrl,
        selectedModel: model,
        models,
        hasCredentials: true,
        hasModelReady: true
      })
    }),
    clearCredentials: vi.fn(() => {
      Object.assign(state.store, {
        apiKey: '',
        selectedModel: '',
        models: [],
        hasCredentials: false,
        hasModelReady: false
      })
    })
  })
})
afterEach(() => panel?.unmount())
async function setup() {
  panel = mount(CredentialsConfig, { global: { plugins: [ElementPlus] } })
  await flushPromises()
  return panel
}
async function fetchModels() {
  await panel.get('[data-testid="fetch-ai-models"]').trigger('click')
  await flushPromises()
}

describe('远程模型会话配置', () => {
  it('不自动请求或预设模型，密码输入不泄漏Key，并保留共享范围说明', async () => {
    await setup()
    expect(panel.get('input[aria-label="API 地址"]').element.value).toBe(state.store.baseUrl)
    expect(panel.get('input[aria-label="API Key"]').attributes('type')).toBe('password')
    expect(panel.text()).not.toContain('GPT-6.1 Sol')
    expect(panel.text()).toContain('图片上传、视频分析和 AI 工坊共用')
    expect(panel.text()).toContain('刷新后保留')
    expect(panel.text()).toContain('新标签页')
    expect(panel.text()).toContain('模型列表不保证图片能力')
    expect(state.fetchRemoteModels).not.toHaveBeenCalled()
    await panel.get('input[aria-label="API Key"]').setValue('draft-secret')
    expect(panel.text()).not.toContain('draft-secret')
    expect(state.store.saveCredentials).not.toHaveBeenCalled()
  })

  it('单模型自动选中后原子保存URL、Key、模型和远程列表，清除同时清空所有草稿', async () => {
    state.fetchRemoteModels.mockResolvedValue([{ id: 'vision-one' }])
    await setup()
    await panel.get('input[aria-label="API Key"]').setValue('session-key')
    await fetchModels()
    expect(panel.getComponent({ name: 'ElSelect' }).props('modelValue')).toBe('vision-one')
    expect(state.store.saveCredentials).not.toHaveBeenCalled()
    await panel.get('form').trigger('submit')
    await flushPromises()
    expect(state.store.saveCredentials).toHaveBeenCalledWith({
      apiKey: 'session-key',
      baseUrl: 'https://api.example.test/v1',
      model: 'vision-one',
      models: [{ id: 'vision-one' }]
    })
    await panel.get('[data-testid="clear-ai-credentials"]').trigger('click')
    expect(panel.get('input[aria-label="API Key"]').element.value).toBe('')
    expect(panel.getComponent({ name: 'ElSelect' }).props('modelValue')).toBe('')
    expect(state.store.clearCredentials).toHaveBeenCalledOnce()
  })

  it('多模型必须明确选择；选择新模型后才可保存', async () => {
    state.fetchRemoteModels.mockResolvedValue([{ id: 'model-a' }, { id: 'model-b' }])
    await setup()
    await panel.get('input[aria-label="API Key"]').setValue('session-key')
    await fetchModels()
    const select = panel.getComponent({ name: 'ElSelect' })
    expect(select.props('filterable')).toBe(true)
    expect(select.props('modelValue')).toBe('')
    await panel.get('form').trigger('submit')
    expect(state.store.saveCredentials).not.toHaveBeenCalled()
    select.vm.$emit('update:modelValue', 'model-b')
    await flushPromises()
    await panel.get('form').trigger('submit')
    await flushPromises()
    expect(state.store.saveCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'model-b' })
    )
  })

  it.each(['API Key', 'API 地址'])(
    '修改%s立即中止旧获取请求，迟到回包不会恢复旧列表或保存',
    async field => {
      let resolveOld
      state.fetchRemoteModels.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveOld = resolve
          })
      )
      await setup()
      await panel.get('input[aria-label="API Key"]').setValue('old-key')
      await fetchModels()
      const signal = state.fetchRemoteModels.mock.calls[0][0].signal
      await panel
        .get(`input[aria-label="${field}"]`)
        .setValue(field === 'API Key' ? 'new-key' : 'https://new.example.test/v1')
      expect(signal.aborted).toBe(true)
      resolveOld([{ id: 'old-model' }])
      await flushPromises()
      expect(panel.getComponent({ name: 'ElSelect' }).props('modelValue')).toBe('')
      expect(panel.text()).not.toContain('old-model')
      await panel.get('form').trigger('submit')
      expect(state.store.saveCredentials).not.toHaveBeenCalled()
    }
  )

  it('刷新时保留仍在列表中的模型，模型消失则清空；失败不覆盖已保存会话', async () => {
    Object.assign(state.store, {
      apiKey: 'saved-key',
      selectedModel: 'model-b',
      models: [{ id: 'model-a' }, { id: 'model-b' }],
      hasCredentials: true,
      hasModelReady: true
    })
    await setup()
    expect(panel.getComponent({ name: 'ElSelect' }).props('modelValue')).toBe('model-b')
    state.fetchRemoteModels.mockResolvedValueOnce([{ id: 'model-b' }, { id: 'model-c' }])
    await fetchModels()
    expect(panel.getComponent({ name: 'ElSelect' }).props('modelValue')).toBe('model-b')
    state.fetchRemoteModels.mockResolvedValueOnce([{ id: 'model-c' }, { id: 'model-d' }])
    await fetchModels()
    expect(panel.getComponent({ name: 'ElSelect' }).props('modelValue')).toBe('')
    state.fetchRemoteModels.mockRejectedValueOnce(new Error('模型列表获取失败，请重试'))
    await fetchModels()
    expect(panel.text()).toContain('模型列表获取失败，请重试')
    expect(state.store.selectedModel).toBe('model-b')
    expect(state.store.apiKey).toBe('saved-key')
    expect(state.store.saveCredentials).not.toHaveBeenCalled()
  })

  it('空列表不能保存，外部会话清除同步表单且不自动重新获取', async () => {
    state.fetchRemoteModels.mockResolvedValue([])
    await setup()
    await panel.get('input[aria-label="API Key"]').setValue('session-key')
    await fetchModels()
    expect(panel.text()).toContain('没有返回可用模型')
    await panel.get('form').trigger('submit')
    expect(state.store.saveCredentials).not.toHaveBeenCalled()
    Object.assign(state.store, { apiKey: '', models: [], selectedModel: '', sessionRevision: 1 })
    await flushPromises()
    expect(panel.get('input[aria-label="API Key"]').element.value).toBe('')
    expect(state.fetchRemoteModels).toHaveBeenCalledOnce()
  })
})
