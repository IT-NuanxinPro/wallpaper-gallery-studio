function readFileEntry(entry) {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

function readEntryBatch(reader) {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject))
}

export async function readDroppedImageEntries(entry) {
  if (entry.isFile) {
    const file = await readFileEntry(entry)
    return file.type.startsWith('image/') ? [file] : []
  }

  if (!entry.isDirectory) return []

  const files = []
  const reader = entry.createReader()
  // Chromium 每次最多返回约 100 项，必须持续读取直到空批次。
  while (true) {
    const entries = await readEntryBatch(reader)
    if (entries.length === 0) break

    for (const childEntry of entries) {
      files.push(...(await readDroppedImageEntries(childEntry)))
    }
  }

  return files
}
