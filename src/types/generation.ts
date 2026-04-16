export type JobStatus = 'pending' | 'running' | 'done' | 'failed'
export type TaskStatus = 'pending' | 'running' | 'done' | 'failed'

export interface GenerationJob {
  id: string
  session_id: string
  status: JobStatus
  total_tasks: number
  completed_tasks: number
  failed_tasks: number
  config: string
  created_at: string
  updated_at: string
}

export interface GenerationTask {
  id: string
  job_id: string
  source_image_path: string
  source_image_name: string
  target_language: string
  country_code: string
  status: TaskStatus
  output_path: string | null
  error_message: string | null
  created_at: string
  verification_status: string | null  // score 0-100 stored as string
  verification_notes: string | null   // JSON: { score, issues, summary, extractedText }
  prompt_sent: string | null          // full prompt sent to Gemini (for debugging)
}

export interface GenerationProgress {
  jobId: string
  status: JobStatus
  totalTasks: number
  completedTasks: number
  failedTasks: number
  completedCountries: string[]
  pendingCountries: string[]
}

export interface GeneratedImage {
  success: boolean
  outputPath: string
  error?: string
}

export interface ImageGenerator {
  generateImage(
    sourceImagePath: string,
    targetLanguage: string,
    prompt: string,
    resolution?: string
  ): Promise<GeneratedImage>
}
