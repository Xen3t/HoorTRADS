import { VALID_IMAGE_EXTENSIONS } from '@/types/images'

export function isValidImageFormat(filename: string): boolean {
  if (!filename) return false
  const ext = filename.split('.').pop()?.toLowerCase()
  if (!ext) return false
  return (VALID_IMAGE_EXTENSIONS as readonly string[]).includes(ext)
}

export function filterValidFilenames(filenames: string[]): string[] {
  return filenames.filter(isValidImageFormat)
}
