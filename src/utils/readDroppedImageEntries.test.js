import { describe, expect, it } from 'vitest'
import { readDroppedImageEntries } from './readDroppedImageEntries'

function createFileEntry(index) {
  return {
    isFile: true,
    isDirectory: false,
    file(resolve) {
      resolve(new globalThis.File([String(index)], `${index}.jpg`, { type: 'image/jpeg' }))
    }
  }
}

describe('readDroppedImageEntries', () => {
  it('持续读取目录批次，支持超过 100 个文件', async () => {
    const batches = [
      Array.from({ length: 100 }, (_, index) => createFileEntry(index)),
      Array.from({ length: 51 }, (_, index) => createFileEntry(index + 100)),
      []
    ]
    const directory = {
      isFile: false,
      isDirectory: true,
      createReader() {
        return {
          readEntries(resolve) {
            resolve(batches.shift())
          }
        }
      }
    }

    const files = await readDroppedImageEntries(directory)

    expect(files).toHaveLength(151)
    expect(files.at(-1).name).toBe('150.jpg')
  })
})
