const activeRuns = new Map()

function settleWait(state, value) {
  if (!state.waitResolve) return
  const resolve = state.waitResolve
  state.waitResolve = null
  if (state.waitTimer) clearTimeout(state.waitTimer)
  state.waitTimer = null
  resolve(value)
}

export function beginAiTaskRun(taskId) {
  cancelAiTaskRun(taskId)

  const token = Symbol(taskId)
  activeRuns.set(taskId, {
    token,
    cancelled: false,
    waitTimer: null,
    waitResolve: null
  })
  return token
}

export function isAiTaskRunCurrent(taskId, token) {
  const state = activeRuns.get(taskId)
  return Boolean(state && state.token === token && !state.cancelled)
}

export function waitForAiTaskRetry(taskId, token, delayMs) {
  const state = activeRuns.get(taskId)
  if (!state || state.token !== token || state.cancelled) return Promise.resolve(false)
  if (delayMs <= 0) return Promise.resolve(true)

  settleWait(state, false)
  return new Promise(resolve => {
    state.waitResolve = resolve
    state.waitTimer = setTimeout(() => {
      state.waitTimer = null
      state.waitResolve = null
      resolve(isAiTaskRunCurrent(taskId, token))
    }, delayMs)
  })
}

export function cancelAiTaskRun(taskId) {
  const state = activeRuns.get(taskId)
  if (!state) return false

  state.cancelled = true
  settleWait(state, false)
  activeRuns.delete(taskId)
  return true
}

export function cancelAiTaskRuns(taskIds) {
  taskIds.forEach(cancelAiTaskRun)
}

export function finishAiTaskRun(taskId, token) {
  const state = activeRuns.get(taskId)
  if (!state || state.token !== token) return
  settleWait(state, false)
  activeRuns.delete(taskId)
}

export function hasActiveAiTaskRun(taskId) {
  return activeRuns.has(taskId)
}
