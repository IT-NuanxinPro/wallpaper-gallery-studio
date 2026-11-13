export function changesRepository(current, next) {
  return ['owner', 'repo', 'branch'].some(key => current[key] !== next[key])
}

export function hasPendingRepositoryWrites(session) {
  return (
    session.uploading ||
    session.metadataStatus === 'uploading' ||
    session.metadataRetryFileIds.length > 0 ||
    session.files.some(file => file.status !== 'success' || file.metadataPending)
  )
}
