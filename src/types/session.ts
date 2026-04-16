export type SessionStatus =
  | 'draft'
  | 'configuring'
  | 'generating'
  | 'reviewing'
  | 'exporting'
  | 'done'

export interface Session {
  id: string
  name: string
  created_at: string
  updated_at: string
  status: SessionStatus
  image_count: number
  market_count: number
  current_step: string
  source_path: string | null
  config: string | null
}

export interface CreateSessionInput {
  name: string
  image_count: number
  source_path?: string
  current_step?: string
  config?: string
}
