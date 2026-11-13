import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import VideoJobQueue from './VideoJobQueue.vue'

const jobs = [
  {
    id: 'review',
    filename: '待审核.mp4',
    status: 'awaiting_review',
    review: {
      selectedFrameId: 'f1',
      usage: 'desktop',
      topic: '风景',
      filename: '待审核.mp4',
      displayTitle: '暮色',
      description: '暮色中的远山',
      keywords: ['远山']
    },
    result: { frames: [{ id: 'f1', thumbnailUrl: 'https://frames.test/1.jpg' }] }
  },
  { id: 'published', filename: '已完成.mp4', status: 'published' },
  { id: 'failed', filename: '失败.mp4', status: 'failed' }
]

describe('视频任务分区', () => {
  it('空待办退出期间，已发布列表始终留在独立且持久的内容槽', async () => {
    vi.useFakeTimers()
    const queue = mount(VideoJobQueue, {
      props: { jobs: [jobs[1]], tab: 'pending', canWrite: true },
      global: { plugins: [ElementPlus], stubs: { transition: false, 'transition-group': false } }
    })
    try {
      const viewport = queue.get('.video-job-queue__viewport').element
      const list = queue.get('.video-job-queue__list').element
      const toolbar = queue.get('.video-job-queue__toolbar').element
      await queue.setProps({ tab: 'published' })
      const leavingEmpty = queue.get('.video-job-queue__empty')
      expect(leavingEmpty.classes()).toContain('studio-feedback-leave-active')
      expect(leavingEmpty.element.parentElement).toBe(viewport)
      expect(queue.get('.video-job-queue__list').element).toBe(list)
      expect(queue.get('.video-job-queue__toolbar').element).toBe(toolbar)
      expect(queue.get('.video-job-queue__list').attributes('aria-hidden')).toBe('false')
      await queue.setProps({ tab: 'pending' })
      await queue.setProps({ tab: 'published' })
      await vi.runAllTimersAsync()
      expect(queue.find('.video-job-queue__empty').exists()).toBe(false)
      expect(queue.findAll('.video-job-queue__item')).toHaveLength(1)
      expect(queue.get('.video-job-queue__list').element).toBe(list)
    } finally {
      queue.unmount()
      vi.useRealTimers()
    }
  })
  it('默认待办排除已发布；历史无勾选框和批量发布，切回待办可审核', async () => {
    const queue = mount(VideoJobQueue, {
      props: { jobs, canWrite: true },
      global: { plugins: [ElementPlus] }
    })
    expect(queue.text()).toContain('待审核.mp4')
    expect(queue.text()).not.toContain('已完成.mp4')
    expect(queue.find('select').exists()).toBe(false)
    expect(queue.find('input[type="checkbox"]').exists()).toBe(true)
    expect(queue.get('img').attributes('crossorigin')).toBe('anonymous')
    await queue.setProps({ tab: 'published' })
    expect(queue.text()).toContain('已完成.mp4')
    expect(queue.text()).not.toContain('待审核.mp4')
    expect(queue.find('input[type="checkbox"]').exists()).toBe(false)
    expect(queue.text()).not.toContain('批量发布')
    await queue.setProps({ tab: 'pending' })
    await queue.find('.video-job-queue__select').trigger('click')
    expect(queue.emitted('select')[0]).toEqual(['review'])
    queue.unmount()
  })

  it('发布完成后自动退出当前待办和批量操作，历史保留记录', async () => {
    const queue = mount(VideoJobQueue, {
      props: { jobs, canWrite: true, selectedIds: ['review'] },
      global: { plugins: [ElementPlus] }
    })
    expect(queue.text()).toContain('发布所选')
    await queue.setProps({
      jobs: jobs.map(job => (job.id === 'review' ? { ...job, status: 'published' } : job))
    })
    expect(queue.text()).not.toContain('待审核.mp4')
    expect(queue.text()).not.toContain('发布所选')
    await queue.setProps({ tab: 'published' })
    expect(queue.text()).toContain('待审核.mp4')
    expect(queue.find('input[type="checkbox"]').exists()).toBe(false)
    queue.unmount()
  })

  it('状态分段筛选限定待办，失败记录可发起重试', async () => {
    const queue = mount(VideoJobQueue, {
      props: { jobs, canWrite: true },
      global: { plugins: [ElementPlus] }
    })
    queue.getComponent('.video-job-queue__filters').vm.$emit('update:modelValue', 'failed')
    await queue.vm.$nextTick()
    expect(queue.text()).toContain('失败.mp4')
    expect(queue.text()).not.toContain('待审核.mp4')
    await queue
      .findAll('button')
      .find(button => button.text() === '重试处理')
      .trigger('click')
    expect(queue.emitted('retry')[0][0].id).toBe('failed')
    queue.unmount()
  })
})
