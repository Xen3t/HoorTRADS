import { z } from 'zod/v4'

export interface ImportedImage {
  id: string
  filename: string
  path: string
  thumbnailUrl: string
  format: 'png' | 'jpg' | 'jpeg' | 'webp'
  sizeBytes: number
}

export type ImportSource = 'drag-drop' | 'folder'

export interface ImportResult {
  images: ImportedImage[]
  source: ImportSource
  folderPath?: string
}

export const VALID_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const

export const scanFolderRequestSchema = z.object({
  folderPath: z.string().min(1, 'Folder path is required'),
})

export const importedImageSchema = z.object({
  id: z.string(),
  filename: z.string(),
  path: z.string(),
  thumbnailUrl: z.string(),
  format: z.enum(['png', 'jpg', 'jpeg', 'webp']),
  sizeBytes: z.number(),
})
