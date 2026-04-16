import type { ImportedImage } from './images'

export interface FolderNode {
  name: string
  path: string
  relativePath: string
  imageCount: number
  children: FolderNode[]
}

export interface SubfolderEntry {
  name: string
  path: string
  imageCount: number
  selectedByDefault: boolean
}

export interface ScanResult {
  rootName: string
  rootPath: string
  tree: FolderNode
  totalImages: number
  images: ImportedImage[]
  subfolders: SubfolderEntry[]
}
