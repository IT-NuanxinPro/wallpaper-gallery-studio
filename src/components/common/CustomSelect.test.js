import { afterEach, describe, expect, it } from 'vitest'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import CustomSelect from './CustomSelect.vue'

const wrappers = []

function createSelect(props = {}) {
  const wrapper = mount(CustomSelect, {
    attachTo: document.body,
    props: {
      modelValue: '',
      options: ['风景', '动漫'],
      ...props,
      'onUpdate:modelValue': value => wrapper.setProps({ modelValue: value })
    },
    global: { plugins: [ElementPlus] }
  })
  wrappers.push(wrapper)
  return wrapper
}

async function openSelect(wrapper) {
  const input = wrapper.get('input')
  input.element.focus()
  await input.trigger('click')
  await flushPromises()
  return input
}

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
})

describe('分类选择器', () => {
  it('选项浮层脱离滚动容器，选择只提交一次对应事件', async () => {
    const wrapper = createSelect()
    await openSelect(wrapper)
    const listbox = document.querySelector('[role="listbox"]')
    expect(listbox).not.toBeNull()
    expect(wrapper.element.contains(listbox)).toBe(false)

    const option = [...listbox.querySelectorAll('[role="option"]')].find(
      item => item.textContent.trim() === '动漫'
    )
    await new DOMWrapper(option).trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['动漫']])
    expect(wrapper.emitted('change')).toEqual([['动漫']])
  })

  it('新分类输入不提前提交，Enter确认后提交一次', async () => {
    const wrapper = createSelect({ allowCreate: true, filterable: false })
    const input = await openSelect(wrapper)
    await input.setValue('自定义分类')
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('change')).toBeUndefined()

    await input.trigger('keydown', { key: 'Enter', code: 'Enter' })
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toEqual([['自定义分类']])
    expect(wrapper.emitted('change')).toEqual([['自定义分类']])
  })

  it('清空保持空字符串契约，不因clear事件重复提交', async () => {
    const wrapper = createSelect({ modelValue: '风景', clearable: true })
    await wrapper.trigger('mouseenter')
    await flushPromises()
    await wrapper.get('.el-select__clear').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['']])
    expect(wrapper.emitted('change')).toEqual([['']])
  })

  it('Escape关闭选项并保留键盘焦点，不修改当前值', async () => {
    const wrapper = createSelect({ modelValue: '风景' })
    const input = await openSelect(wrapper)
    await input.trigger('keydown', { key: 'Escape', code: 'Escape' })
    await flushPromises()
    expect(document.activeElement).toBe(input.element)
    expect(input.attributes('aria-expanded')).toBe('false')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('change')).toBeUndefined()
  })
})
