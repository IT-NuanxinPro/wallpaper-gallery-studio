import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ResultCard from './ResultCard.vue'

let panel
const writeText = vi.fn().mockResolvedValue()
beforeEach(() => {
  writeText.mockClear()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
})
afterEach(() => panel?.unmount())

describe('固定模型结构化结果', () => {
  it.each(['desktop', 'mobile', 'avatar'])(
    '%s 保留分类与复制功能，不展示已退役的空原始响应入口',
    async primary => {
      panel = mount(ResultCard, {
        props: {
          result: {
            id: 'current-result',
            primary,
            secondary: '风景',
            third: '山川',
            filenameSuggestions: ['山川.jpg'],
            imageName: '山川.jpg',
            imageUrl: '',
            imageSize: 1024,
            description: '山川与云海',
            keywords: ['山川'],
            confidence: 0.9,
            timestamp: 1,
            model: 'sub2api-gpt-6.1-sol',
            displayTitle: '远山云海',
            reasoning: '以山川景观为主体',
            is_perfect_match: false,
            new_category_proposal: { suggested_third: '云海', reason: '具有云海特征' }
          }
        },
        global: { plugins: [ElementPlus] }
      })
      expect(panel.text()).toContain('远山云海')
      expect(panel.text()).toContain('以山川景观为主体')
      expect(panel.text()).toContain('具有云海特征')
      expect(panel.text()).not.toMatch(/Markdown|原始数据|原始 AI 响应/)
      await panel
        .findAll('button')
        .find(button => button.text().includes('复制全部'))
        .trigger('click')
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('分类逻辑: 以山川景观为主体'))
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('新分类建议: 风景/云海'))
    }
  )
})
