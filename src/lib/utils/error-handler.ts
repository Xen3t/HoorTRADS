export interface AppError {
  message: string
  cause: string
  action: string
}

const ERROR_MAP: Record<string, AppError> = {
  GEMINI_UNAVAILABLE: {
    message: 'Gemini API is temporarily unavailable',
    cause: 'The AI service is not responding',
    action: 'Your session is saved. Please try again later.',
  },
  RATE_LIMIT: {
    message: 'Rate limit reached',
    cause: 'Too many requests sent to the API',
    action: 'The system will retry automatically with backoff.',
  },
  NETWORK_SHARE_INACCESSIBLE: {
    message: 'Cannot access destination folder',
    cause: 'The network share is unreachable',
    action: 'Please check network connectivity and folder permissions.',
  },
  DRIVE_AUTH_EXPIRED: {
    message: 'Google Drive authorization expired',
    cause: 'The OAuth token is no longer valid',
    action: 'Please re-authenticate with Google Drive.',
  },
  COMPRESSION_FAILED: {
    message: 'Image compression failed',
    cause: 'The source image may be corrupted',
    action: 'This image was skipped. Export continues for remaining images.',
  },
  JSON_EXTRACTION_FAILED: {
    message: 'Text extraction failed',
    cause: 'Could not read text from the generated image',
    action: 'The JSON was generated without this language.',
  },
  VERIFICATION_UNAVAILABLE: {
    message: 'Translation verification unavailable',
    cause: 'The verification LLM is not responding',
    action: 'You can still proceed with export.',
  },
  UNSUPPORTED_FORMAT: {
    message: 'Unsupported file format',
    cause: 'Only PNG, JPG, JPEG, and WebP files are supported',
    action: 'Please use supported image formats.',
  },
}

export function getErrorInfo(errorCode: string): AppError {
  return ERROR_MAP[errorCode] || {
    message: 'An unexpected error occurred',
    cause: errorCode,
    action: 'Your session data is safe. Please try again.',
  }
}

export function formatError(error: unknown, context: string): string {
  if (error instanceof Error) {
    return `[${context}] ${error.message}`
  }
  return `[${context}] Unknown error`
}
