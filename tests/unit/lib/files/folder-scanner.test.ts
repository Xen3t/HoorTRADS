import { describe, it, expect } from 'vitest'
import { extractCampaignName, buildFolderTree } from '@/lib/files/folder-scanner'

describe('extractCampaignName', () => {
  it('extracts name from simple path', () => {
    expect(extractCampaignName('C:\\Users\\Campaign_Summer')).toBe('Campaign_Summer')
  })

  it('extracts name from UNC path', () => {
    expect(extractCampaignName('\\\\server\\share\\Soldes Ete 2026')).toBe('Soldes Ete 2026')
  })

  it('extracts name from forward slash path', () => {
    expect(extractCampaignName('/mnt/share/Black Friday Promo')).toBe('Black Friday Promo')
  })

  it('handles trailing slash', () => {
    expect(extractCampaignName('C:\\Campaigns\\Spring\\')).toBe('Spring')
  })

  it('handles single segment', () => {
    expect(extractCampaignName('MyCampaign')).toBe('MyCampaign')
  })
})

describe('buildFolderTree', () => {
  it('builds tree from flat file list with relative paths', () => {
    const files = [
      { relativePath: 'ad/image1.png', filename: 'image1.png' },
      { relativePath: 'ad/image2.jpg', filename: 'image2.jpg' },
      { relativePath: 'banniere/banner1.webp', filename: 'banner1.webp' },
    ]

    const tree = buildFolderTree('Campaign', '/root', files)

    expect(tree.name).toBe('Campaign')
    expect(tree.children.length).toBe(2)

    const adFolder = tree.children.find((c) => c.name === 'ad')
    expect(adFolder?.imageCount).toBe(2)

    const bannerFolder = tree.children.find((c) => c.name === 'banniere')
    expect(bannerFolder?.imageCount).toBe(1)
  })

  it('handles nested subfolders', () => {
    const files = [
      { relativePath: 'ad/1080x1080/img.png', filename: 'img.png' },
      { relativePath: 'ad/1080x1920/img.png', filename: 'img.png' },
    ]

    const tree = buildFolderTree('Campaign', '/root', files)
    const adFolder = tree.children.find((c) => c.name === 'ad')
    expect(adFolder?.children.length).toBe(2)
    expect(adFolder?.imageCount).toBe(2)
  })

  it('handles root-level images', () => {
    const files = [{ relativePath: 'logo.png', filename: 'logo.png' }]

    const tree = buildFolderTree('Campaign', '/root', files)
    expect(tree.imageCount).toBe(1)
    expect(tree.children.length).toBe(0)
  })

  it('returns empty tree for no files', () => {
    const tree = buildFolderTree('Campaign', '/root', [])
    expect(tree.imageCount).toBe(0)
    expect(tree.children.length).toBe(0)
  })
})
