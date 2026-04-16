import { describe, it, expect } from 'vitest'
import { isValidImageFormat, filterValidFilenames } from '@/lib/files/image-validator'

describe('isValidImageFormat', () => {
  it('accepts PNG files', () => {
    expect(isValidImageFormat('photo.png')).toBe(true)
  })

  it('accepts JPG files', () => {
    expect(isValidImageFormat('photo.jpg')).toBe(true)
  })

  it('accepts JPEG files', () => {
    expect(isValidImageFormat('photo.jpeg')).toBe(true)
  })

  it('accepts WebP files', () => {
    expect(isValidImageFormat('photo.webp')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isValidImageFormat('photo.PNG')).toBe(true)
    expect(isValidImageFormat('photo.JPG')).toBe(true)
    expect(isValidImageFormat('photo.WEBP')).toBe(true)
  })

  it('rejects PDF files', () => {
    expect(isValidImageFormat('document.pdf')).toBe(false)
  })

  it('rejects DOC files', () => {
    expect(isValidImageFormat('file.doc')).toBe(false)
  })

  it('rejects TXT files', () => {
    expect(isValidImageFormat('notes.txt')).toBe(false)
  })

  it('rejects files without extension', () => {
    expect(isValidImageFormat('noextension')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isValidImageFormat('')).toBe(false)
  })
})

describe('filterValidFilenames', () => {
  it('returns only valid image filenames', () => {
    const files = ['photo.png', 'doc.pdf', 'banner.jpg', 'notes.txt', 'ad.webp']
    expect(filterValidFilenames(files)).toEqual(['photo.png', 'banner.jpg', 'ad.webp'])
  })

  it('returns empty array when no valid images', () => {
    expect(filterValidFilenames(['doc.pdf', 'file.txt'])).toEqual([])
  })

  it('returns all when all are valid', () => {
    const files = ['a.png', 'b.jpg', 'c.jpeg', 'd.webp']
    expect(filterValidFilenames(files)).toEqual(files)
  })
})
