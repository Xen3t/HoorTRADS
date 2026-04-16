import { randomUUID } from 'crypto'
import { readdir } from 'fs/promises'
import path from 'path'
import { isValidImageFormat } from './image-validator'
import type { ImportedImage } from '@/types/images'
import type { FolderNode, ScanResult, SubfolderEntry } from '@/types/folder'

export function extractCampaignName(folderPath: string): string {
  const normalized = folderPath.replace(/\\/g, '/').replace(/\/+$/, '')
  const segments = normalized.split('/')
  return segments[segments.length - 1] || folderPath
}

interface FileEntry {
  relativePath: string
  filename: string
}

export function buildFolderTree(
  rootName: string,
  rootPath: string,
  files: FileEntry[]
): FolderNode {
  const root: FolderNode = {
    name: rootName,
    path: rootPath,
    relativePath: '',
    imageCount: 0,
    children: [],
  }

  for (const file of files) {
    const parts = file.relativePath.split('/')
    if (parts.length === 1) {
      root.imageCount++
      continue
    }

    let current = root
    for (let i = 0; i < parts.length - 1; i++) {
      const folderName = parts[i]
      let child = current.children.find((c) => c.name === folderName)
      if (!child) {
        child = {
          name: folderName,
          path: path.join(current.path, folderName),
          relativePath: parts.slice(0, i + 1).join('/'),
          imageCount: 0,
          children: [],
        }
        current.children.push(child)
      }
      current = child
    }
    current.imageCount++
  }

  // Propagate counts up
  function countTotal(node: FolderNode): number {
    let total = node.imageCount
    for (const child of node.children) {
      total += countTotal(child)
    }
    node.imageCount = total
    return total
  }
  countTotal(root)

  return root
}

const ADS_STRUCTURE_FOLDERS = ['LINK', 'PROJECT', 'RENDU'] as const
const ADS_RENDER_FOLDER = 'RENDU'
const ALWAYS_SELECTED_KEYWORDS = ['GENERIQUE', 'BANNIERE'] as const
const EXCLUDE_KEYWORDS = ['VIDEO'] as const

export function isSelectedByDefault(folderName: string): boolean {
  const upper = folderName.toUpperCase()
  if (EXCLUDE_KEYWORDS.some((kw) => upper.includes(kw))) return false
  return ALWAYS_SELECTED_KEYWORDS.some((kw) => upper.includes(kw))
}

async function detectAdsStructure(dirPath: string): Promise<boolean> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    const folderNames = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name.toUpperCase())
    return ADS_STRUCTURE_FOLDERS.every((f) => folderNames.includes(f))
  } catch {
    return false
  }
}

export async function scanFolderTree(rootPath: string): Promise<ScanResult> {
  const rootName = extractCampaignName(rootPath)
  const images: ImportedImage[] = []
  const fileEntries: FileEntry[] = []

  async function scan(dirPath: string, relativeTo: string) {
    // Check if THIS directory has the ADS structure (LINK/PROJECT/RENDU)
    const isAds = await detectAdsStructure(dirPath)

    if (isAds) {
      // Only scan the RENDU subfolder, skip LINK and PROJECT entirely
      const renduPath = path.join(dirPath, ADS_RENDER_FOLDER)
      await scanFiles(renduPath, relativeTo)
      return
    }

    const entries = await readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)

      if (entry.isDirectory()) {
        await scan(fullPath, relativeTo)
      } else if (entry.isFile() && isValidImageFormat(entry.name)) {
        addImage(fullPath, relativeTo)
      }
    }
  }

  async function scanFiles(dirPath: string, relativeTo: string) {
    const entries = await readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)

      if (entry.isDirectory()) {
        await scanFiles(fullPath, relativeTo)
      } else if (entry.isFile() && isValidImageFormat(entry.name)) {
        addImage(fullPath, relativeTo)
      }
    }
  }

  function addImage(fullPath: string, relativeTo: string) {
    const relPath = path.relative(relativeTo, fullPath).replace(/\\/g, '/')
    const filename = path.basename(fullPath)
    const ext = filename.split('.').pop()?.toLowerCase() as ImportedImage['format']

    fileEntries.push({ relativePath: relPath, filename })
    images.push({
      id: randomUUID(),
      filename,
      path: fullPath,
      thumbnailUrl: `/api/serve-image?path=${encodeURIComponent(fullPath)}`,
      format: ext,
      sizeBytes: 0, // Will be populated if needed
    })
  }

  // Detect top-level subfolders and their image counts
  const topEntries = await readdir(rootPath, { withFileTypes: true })
  const topDirs = topEntries.filter((e) => e.isDirectory())
  const subfolders: SubfolderEntry[] = []

  // If root itself is ADS structure, don't show subfolders — RENDU is handled by scan()
  const rootIsAds = await detectAdsStructure(rootPath)

  // If we have multiple subfolders and root is NOT ADS, scan per-subfolder for selection UI
  if (topDirs.length > 1 && !rootIsAds) {
    for (const dir of topDirs) {
      const dirImages: ImportedImage[] = []
      const dirFullPath = path.join(rootPath, dir.name)

      // Temp scan to count images per subfolder
      async function countScan(dp: string) {
        const isAds = await detectAdsStructure(dp)
        if (isAds) {
          const renduPath = path.join(dp, ADS_RENDER_FOLDER)
          await countScanFiles(renduPath)
          return
        }
        const entries = await readdir(dp, { withFileTypes: true })
        for (const entry of entries) {
          const fp = path.join(dp, entry.name)
          if (entry.isDirectory()) await countScan(fp)
          else if (entry.isFile() && isValidImageFormat(entry.name)) {
            dirImages.push({ id: '', filename: entry.name, path: fp, thumbnailUrl: '', format: 'jpg', sizeBytes: 0 })
          }
        }
      }
      async function countScanFiles(dp: string) {
        const entries = await readdir(dp, { withFileTypes: true })
        for (const entry of entries) {
          const fp = path.join(dp, entry.name)
          if (entry.isDirectory()) await countScanFiles(fp)
          else if (entry.isFile() && isValidImageFormat(entry.name)) {
            dirImages.push({ id: '', filename: entry.name, path: fp, thumbnailUrl: '', format: 'jpg', sizeBytes: 0 })
          }
        }
      }

      await countScan(dirFullPath)

      subfolders.push({
        name: dir.name,
        path: dirFullPath,
        imageCount: dirImages.length,
        selectedByDefault: isSelectedByDefault(dir.name),
      })
    }
  }

  await scan(rootPath, rootPath)

  const tree = buildFolderTree(rootName, rootPath, fileEntries)

  return {
    rootName,
    rootPath,
    tree,
    totalImages: images.length,
    images,
    subfolders,
  }
}
