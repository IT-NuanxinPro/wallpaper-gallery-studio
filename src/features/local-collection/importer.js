import { sha256Hex } from '@/utils/file-hash'
import { createCollectorApi } from './api'

export async function importCollectorBatch(
  batchId,
  {
    api = createCollectorApi(),
    upload,
    hash = async file => sha256Hex(await file.arrayBuffer()),
    signal,
    repository,
    assertCurrent = () => {},
    onProgress = () => {}
  }
) {
  const check = () => {
    if (signal?.aborted)
      throw new globalThis.DOMException('导入已取消，本地素材仍保留', 'AbortError')
    assertCurrent()
  }
  check()
  const [{ collectorId }, { batch }] = await Promise.all([
    api.health(),
    api.reserveImport({ batchId, repository })
  ])
  check()
  if (!['ready', 'cleanup_failed', 'uploaded_cleanup_pending'].includes(batch.status))
    throw new Error('该批次已结束，请返回素材采集查看历史')
  if (
    batch.studio?.repository &&
    (!repository ||
      ['owner', 'repo', 'branch'].some(key => repository[key] !== batch.studio.repository[key]))
  )
    throw new Error('该批次已关联其他仓库，请切回原仓库再导入')
  upload.setSeries(batch.series)
  let added = 0
  let skipped = 0
  for (const item of batch.items) {
    check()
    const localSource = {
      collectorId,
      batchId,
      sourceItemId: item.sourceItemId,
      sha256: item.sha256
    }
    if (
      batch.studio?.receipts?.[item.sourceItemId] ||
      batch.studio?.discardedIds?.includes(item.sourceItemId) ||
      upload.files.some(
        file =>
          file.localSource?.collectorId === collectorId &&
          file.localSource?.batchId === batchId &&
          file.localSource?.sourceItemId === item.sourceItemId
      )
    ) {
      skipped++
      continue
    }
    onProgress({ current: added + skipped + 1, total: batch.items.length, filename: item.filename })
    const blob = await api.image({ batchId, itemId: item.sourceItemId }, signal)
    check()
    const file = new globalThis.File([blob], item.filename, { type: blob.type })
    const validation = upload.validateFile(file)
    if (!validation.valid) throw new Error(item.filename + '：' + validation.error)
    if ((await hash(file)) !== item.sha256)
      throw new Error(item.filename + ' 内容已变化，请刷新批次')
    check()
    file.localSource = localSource
    await upload.addFiles([file], { assertCurrent: check })
    added++
  }
  return { added, skipped }
}
