import fs from 'fs'
import path from 'path'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com'

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' })[ext] || 'image/jpeg'
}

export interface GeminiFile {
  uri: string
  name: string // e.g. "files/abc123" — used for deletion
}

// Upload a local image to Gemini Files API, returns URI + name.
// The file stays available for 48h and must be deleted after use.
export async function uploadFileToGemini(filePath: string, apiKey: string): Promise<GeminiFile> {
  const fileBuffer = fs.readFileSync(filePath)
  const mimeType = getMimeType(filePath)
  const displayName = path.basename(filePath)

  const boundary = `boundary${Date.now()}${Math.random().toString(36).slice(2)}`
  const metaJson = JSON.stringify({ file: { display_name: displayName } })
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${metaJson}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ])

  const res = await fetch(
    `${GEMINI_BASE}/upload/v1beta/files?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(body.length),
      },
      body,
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini Files upload failed (${res.status}): ${err.slice(0, 200)}`)
  }

  const data = await res.json()
  return { uri: data.file.uri, name: data.file.name }
}

export async function deleteFileFromGemini(name: string, apiKey: string): Promise<void> {
  try {
    await fetch(`${GEMINI_BASE}/v1beta/${name}?key=${apiKey}`, { method: 'DELETE' })
  } catch {
    // best-effort — file auto-expires after 48h anyway
  }
}

// Upload all unique source images in parallel, returns a map filePath → GeminiFile.
// On individual failure, the entry is omitted — caller falls back to base64 for that image.
export async function uploadJobImages(
  imagePaths: string[],
  apiKey: string
): Promise<Map<string, GeminiFile>> {
  const unique = [...new Set(imagePaths)]
  const results = await Promise.allSettled(
    unique.map(async (p) => ({ path: p, file: await uploadFileToGemini(p, apiKey) }))
  )
  const map = new Map<string, GeminiFile>()
  for (const r of results) {
    if (r.status === 'fulfilled') map.set(r.value.path, r.value.file)
    else console.warn('[files-client] upload failed, will use base64 fallback:', r.reason)
  }
  console.log(`[files-client] uploaded ${map.size}/${unique.length} images to Gemini Files API`)
  return map
}

export async function deleteJobImages(files: GeminiFile[], apiKey: string): Promise<void> {
  await Promise.allSettled(files.map((f) => deleteFileFromGemini(f.name, apiKey)))
  console.log(`[files-client] deleted ${files.length} files from Gemini Files API`)
}
