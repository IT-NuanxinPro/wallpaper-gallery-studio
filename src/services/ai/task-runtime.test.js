import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  beginAiTaskRun,
  cancelAiTaskRun,
  finishAiTaskRun,
  hasActiveAiTaskRun,
  isAiTaskRunCurrent,
  waitForAiTaskRetry
} from './task-runtime'

afterEach(() => {
  vi.useRealTimers()
})

describe('AI task runtime', () => {
  it('删除任务时立即唤醒并终止重试等待', async () => {
    vi.useFakeTimers()
    const token = beginAiTaskRun('task-cancel')
    const waiting = waitForAiTaskRetry('task-cancel', token, 30_000)

    expect(cancelAiTaskRun('task-cancel')).toBe(true)
    await expect(waiting).resolves.toBe(false)
    expect(isAiTaskRunCurrent('task-cancel', token)).toBe(false)
    expect(hasActiveAiTaskRun('task-cancel')).toBe(false)
  })

  it('只允许最新运行令牌写回结果', () => {
    const firstToken = beginAiTaskRun('task-replaced')
    const secondToken = beginAiTaskRun('task-replaced')

    expect(isAiTaskRunCurrent('task-replaced', firstToken)).toBe(false)
    expect(isAiTaskRunCurrent('task-replaced', secondToken)).toBe(true)

    finishAiTaskRun('task-replaced', secondToken)
    expect(hasActiveAiTaskRun('task-replaced')).toBe(false)
  })

  it('重试倒计时结束后允许当前任务继续', async () => {
    vi.useFakeTimers()
    const token = beginAiTaskRun('task-retry')
    const waiting = waitForAiTaskRetry('task-retry', token, 2_000)

    await vi.advanceTimersByTimeAsync(2_000)
    await expect(waiting).resolves.toBe(true)

    finishAiTaskRun('task-retry', token)
  })
})
