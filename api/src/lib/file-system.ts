import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export const ensureDirectory = async (directoryPath: string): Promise<void> => {
  await fs.mkdir(directoryPath, { recursive: true })
}

export const ensureJsonArrayFile = async (filePath: string): Promise<void> => {
  await ensureDirectory(path.dirname(filePath))

  try {
    await fs.access(filePath)
  } catch {
    await fs.writeFile(filePath, '[]\n', 'utf8')
  }
}

export const sanitizeFileName = (input: string): string =>
  input
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()

export const createStoredFileName = (originalName: string): string => {
  const extension = path.extname(originalName) || '.bin'
  const baseName = path.basename(originalName, extension)
  const safeBaseName = sanitizeFileName(baseName) || 'file'

  return `${Date.now()}-${safeBaseName}-${randomUUID().slice(0, 8)}${extension}`
}
