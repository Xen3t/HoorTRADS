/**
 * Gemini Batch API client
 * Docs: https://ai.google.dev/gemini-api/docs/batch-api
 *
 * Flow:
 * 1. Build JSONL (one line per task: key + GenerateContentRequest)
 * 2. Upload JSONL to Files API (supports up to 2GB)
 * 3. Submit batch job referencing the uploaded file
 * 4. Poll status until JOB_STATE_SUCCEEDED / FAILED / CANCELLED
 * 5. Download results JSONL and parse image data per key (= task ID)
 */

import fs from 'fs'
import path from 'path'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const OUTPUT_DIR = path.join(process.cwd(), 'data', 'generated')

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' })[ext] || 'image/jpeg'
}

export interface BatchTask {
  id: string
  sourceImagePath: string
  targetLanguage: string
  prompt: string
}

export interface BatchResult {
  taskId: string
  success: boolean
  outputPath?: string
  error?: string
}

/**
 * Upload a JSONL string to the Files API.
 * Returns the file name (e.g. "files/abc123") used to reference it in the batch job.
 */
async function uploadJsonlToFilesApi(jsonlContent: string, apiKey: string, displayName: string): Promise<string> {
  const buffer = Buffer.from(jsonlContent, 'utf-8')

  // Step 1: Initiate resumable upload
  const initRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(buffer.length),
        'X-Goog-Upload-Header-Content-Type': 'application/jsonl',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
    }
  )

  if (!initRes.ok) {
    throw new Error(`Files API init failed: ${initRes.status} ${await initRes.text()}`)
  }

  const uploadUrl = initRes.headers.get('x-goog-upload-url')
  if (!uploadUrl) throw new Error('No upload URL in Files API response')

  // Step 2: Upload content
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Command': 'upload, finalize',
      'X-Goog-Upload-Offset': '0',
      'Content-Type': 'application/jsonl',
    },
    body: buffer,
  })

  if (!uploadRes.ok) {
    throw new Error(`Files API upload failed: ${uploadRes.status} ${await uploadRes.text()}`)
  }

  const fileData = await uploadRes.json()
  const fileName = fileData.file?.name
  if (!fileName) throw new Error('No file name returned from Files API')

  return fileName
}

/**
 * Submit a batch generation job.
 * Returns the batch name (e.g. "batches/123456789").
 */
async function submitBatchJob(
  fileName: string,
  model: string,
  apiKey: string,
  displayName: string
): Promise<string> {
  const res = await fetch(
    `${GEMINI_BASE}/models/${model}:batchGenerateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batch: {
          display_name: displayName,
          input_config: { file_name: fileName },
        },
      }),
    }
  )

  if (!res.ok) {
    throw new Error(`Batch submit failed: ${res.status} ${await res.text()}`)
  }

  const data = await res.json()
  const batchName = data.name
  if (!batchName) throw new Error('No batch name in response')
  return batchName
}

/**
 * Poll batch status until terminal state.
 * Calls onProgress with each status update.
 * Returns final state.
 */
export async function pollBatchStatus(
  batchName: string,
  apiKey: string,
  intervalMs = 30_000,
  onProgress?: (state: string) => void
): Promise<{ state: string; batch: Record<string, unknown> }> {
  const terminalStates = new Set([
    'JOB_STATE_SUCCEEDED',
    'JOB_STATE_FAILED',
    'JOB_STATE_CANCELLED',
    'JOB_STATE_EXPIRED',
  ])

  while (true) {
    const res = await fetch(`${GEMINI_BASE}/${batchName}?key=${apiKey}`)
    if (!res.ok) throw new Error(`Batch status poll failed: ${res.status}`)

    const batch = await res.json()
    const state: string = batch.state || 'UNKNOWN'

    onProgress?.(state)

    if (terminalStates.has(state)) {
      return { state, batch }
    }

    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

/**
 * Download and parse the results JSONL file.
 * Returns a map of taskId → { success, imageData (base64) }.
 */
async function downloadResults(
  batch: Record<string, unknown>,
  apiKey: string
): Promise<Map<string, { success: boolean; imageData?: string; mimeType?: string; error?: string }>> {
  const results = new Map<string, { success: boolean; imageData?: string; mimeType?: string; error?: string }>()

  // Try inline responses first
  const dest = batch.dest as Record<string, unknown> | undefined
  if (dest?.inlined_responses) {
    const inlined = dest.inlined_responses as { metadata?: { key?: string }; response?: Record<string, unknown>; error?: Record<string, unknown> }[]
    for (const item of inlined) {
      const key = item.metadata?.key
      if (!key) continue

      if (item.error) {
        results.set(key, { success: false, error: JSON.stringify(item.error) })
        continue
      }

      const parts = (item.response as { candidates?: { content?: { parts?: unknown[] } }[] })
        ?.candidates?.[0]?.content?.parts as { inlineData?: { data: string; mimeType: string } }[] | undefined

      const imagePart = parts?.find((p) => p.inlineData)
      if (imagePart?.inlineData) {
        results.set(key, { success: true, imageData: imagePart.inlineData.data, mimeType: imagePart.inlineData.mimeType })
      } else {
        results.set(key, { success: false, error: 'No image in response' })
      }
    }
    return results
  }

  // File-based results
  if (dest?.file_name) {
    const fileName = dest.file_name as string
    const dlRes = await fetch(
      `https://generativelanguage.googleapis.com/download/v1beta/${fileName}:download?alt=media&key=${apiKey}`
    )
    if (!dlRes.ok) throw new Error(`Results download failed: ${dlRes.status}`)

    const text = await dlRes.text()
    for (const line of text.split('\n').filter(Boolean)) {
      try {
        const item = JSON.parse(line) as {
          key?: string
          response?: Record<string, unknown>
          error?: Record<string, unknown>
        }
        const key = item.key
        if (!key) continue

        if (item.error) {
          results.set(key, { success: false, error: JSON.stringify(item.error) })
          continue
        }

        const parts = (item.response as { candidates?: { content?: { parts?: unknown[] } }[] })
          ?.candidates?.[0]?.content?.parts as { inlineData?: { data: string; mimeType: string } }[] | undefined

        const imagePart = parts?.find((p) => p.inlineData)
        if (imagePart?.inlineData) {
          results.set(key, { success: true, imageData: imagePart.inlineData.data, mimeType: imagePart.inlineData.mimeType })
        } else {
          results.set(key, { success: false, error: 'No image in response' })
        }
      } catch {
        // Skip malformed lines
      }
    }
  }

  return results
}

/**
 * Main entry point: submit all tasks as a batch job and return results.
 * Blocks until the batch is complete (can take up to 24h).
 */
export async function processBatch(
  tasks: BatchTask[],
  apiKey: string,
  resolution: string = '1K',
  jobDisplayName: string = 'hoortrad-batch',
  onProgress?: (state: string, completed?: number, total?: number) => void
): Promise<BatchResult[]> {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  // Build JSONL content — one line per task
  const lines: string[] = []

  for (const task of tasks) {
    if (!fs.existsSync(task.sourceImagePath)) {
      // Skip missing source images — will be marked as failed later
      continue
    }

    const imageBuffer = fs.readFileSync(task.sourceImagePath)
    const base64Image = imageBuffer.toString('base64')
    const mimeType = getMimeType(task.sourceImagePath)

    const request = {
      contents: [{
        role: 'user',
        parts: [
          { text: task.prompt },
          { inlineData: { mimeType, data: base64Image } },
        ],
      }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { imageSize: resolution },
      },
    }

    lines.push(JSON.stringify({ key: task.id, request }))
  }

  if (lines.length === 0) {
    return tasks.map((t) => ({ taskId: t.id, success: false, error: 'Source image not found' }))
  }

  const jsonlContent = lines.join('\n')
  onProgress?.('UPLOADING_FILE')

  // Upload JSONL to Files API
  const fileName = await uploadJsonlToFilesApi(jsonlContent, apiKey, `${jobDisplayName}-input`)
  onProgress?.('SUBMITTING_BATCH')

  // Submit batch job
  const batchName = await submitBatchJob(fileName, 'gemini-3.1-flash-image-preview', apiKey, jobDisplayName)
  onProgress?.('JOB_STATE_PENDING')

  // Poll until done
  const { state, batch } = await pollBatchStatus(batchName, apiKey, 30_000, (s) => {
    onProgress?.(s)
  })

  if (state !== 'JOB_STATE_SUCCEEDED') {
    return tasks.map((t) => ({ taskId: t.id, success: false, error: `Batch ended with state: ${state}` }))
  }

  // Download and parse results
  const resultMap = await downloadResults(batch, apiKey)

  // Save images and build final results
  const results: BatchResult[] = []

  for (const task of tasks) {
    const result = resultMap.get(task.id)

    if (!result?.success || !result.imageData) {
      results.push({ taskId: task.id, success: false, error: result?.error || 'No result for task' })
      continue
    }

    try {
      const sourceName = path.basename(task.sourceImagePath, path.extname(task.sourceImagePath))
      const outputFilename = `${sourceName}_${task.targetLanguage}_${Date.now()}.jpg`
      const outputPath = path.join(OUTPUT_DIR, outputFilename)
      fs.writeFileSync(outputPath, Buffer.from(result.imageData, 'base64'))
      results.push({ taskId: task.id, success: true, outputPath })
    } catch (e) {
      results.push({ taskId: task.id, success: false, error: e instanceof Error ? e.message : 'Failed to save image' })
    }
  }

  return results
}
