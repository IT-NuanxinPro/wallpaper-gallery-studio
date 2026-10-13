import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import EditAIResultModal from './EditAIResultModal.vue'

vi.mock('@/services/upload/category-directory', () => ({
  getFallbackUploadCategoryTree: () => ({
    desktop: { secondary: ['风景'], third: { 风景: ['城市'] } },
    mobile: { secondary: ['风景'], third: {} },
    avatar: { secondary: ['人像'], third: {} }
  }),
  getUploadCategoryTree: vi.fn().mockResolvedValue({})
}))

const wrappers = []

function editDescription() {
  return new DOMWrapper(document.querySelector('textarea')).setValue('已修改的描述')
}

function createModal(metadata = {}) {
  const wrapper = mount(EditAIResultModal, {
    attachTo: document.body,
    props: {
      visible: false,
      file: {
        id: 'test-file',
        name: 'test.png',
        aiMetadata: {
          series: 'desktop',
          secondary: '风景',
          filenameSuggestions: ['test'],
          keywords: ['风景'],
          ...metadata
        }
      }
    },
    global: { plugins: [ElementPlus] }
  })
  wrappers.push(wrapper)
  return wrapper
}

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
})

describe('编辑 AI 结果弹窗关闭', () => {
  it.each(['.modal__close', '.modal__btn--cancel'])('未修改时通过 %s 直接关闭', async selector => {
    const wrapper = createModal()
    await wrapper.setProps({ visible: true })
    document.querySelector(selector).click()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(document.querySelector('.confirm-dialog__overlay')).toBeNull()
  })

  it.each(['.modal__close', '.modal__btn--cancel'])(
    '修改后通过 %s 打开的确认框位于编辑弹窗上方',
    async selector => {
      const wrapper = createModal()
      await wrapper.setProps({ visible: true })
      await editDescription()
      document.querySelector(selector).click()
      await wrapper.vm.$nextTick()

      const editor = document.querySelector('.modal-overlay')
      const confirmation = document.querySelector('.confirm-dialog__overlay')
      expect(confirmation).not.toBeNull()
      expect(Number(confirmation.style.zIndex)).toBeGreaterThan(Number(editor.style.zIndex))

      document.querySelector(selector).click()
      await wrapper.vm.$nextTick()
      expect(document.querySelectorAll('.confirm-dialog__overlay')).toHaveLength(1)
      expect(wrapper.emitted('close')).toBeUndefined()
    }
  )

  it('继续编辑后可以再次关闭，放弃修改只关闭一次', async () => {
    const wrapper = createModal()
    await wrapper.setProps({ visible: true })
    await editDescription()
    document.querySelector('.modal__close').click()
    await wrapper.vm.$nextTick()
    document.querySelector('.confirm-dialog__footer button').click()
    await wrapper.vm.$nextTick()

    expect(document.querySelector('.modal__close').disabled).toBe(false)
    expect(document.querySelector('textarea').value).toBe('已修改的描述')
    document.querySelector('.modal__btn--cancel').click()
    await wrapper.vm.$nextTick()
    document.querySelector('.confirm-dialog__footer button:last-child').click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('父页面关闭编辑弹窗时清理确认框，再次打开不遗留遮罩', async () => {
    const wrapper = createModal()
    await wrapper.setProps({ visible: true })
    await editDescription()
    document.querySelector('.modal__close').click()
    await wrapper.vm.$nextTick()

    await wrapper.setProps({ visible: false })
    expect(document.querySelector('.confirm-dialog__overlay')).toBeNull()
    await wrapper.setProps({ visible: true })
    expect(document.querySelector('.confirm-dialog__overlay')).toBeNull()
    expect(document.querySelector('.modal__close').disabled).toBe(false)
  })

  it('初始化其他系列的自定义分类时保留原值，不误判为未保存修改', async () => {
    const wrapper = createModal({
      series: 'mobile',
      secondary: '自定义分类',
      third: '自定义子分类'
    })
    await wrapper.setProps({ visible: true })
    document.querySelector('.modal__close').click()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(document.querySelector('.confirm-dialog__overlay')).toBeNull()
  })
})
