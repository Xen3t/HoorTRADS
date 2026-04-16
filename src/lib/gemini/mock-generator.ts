import type { ImageGenerator, GeneratedImage } from '@/types/generation'

export class MockGenerator implements ImageGenerator {
  private failRate: number

  constructor(failRate = 0.05) {
    this.failRate = failRate
  }

  async generateImage(
    sourceImagePath: string,
    targetLanguage: string
  ): Promise<GeneratedImage> {
    // Simulate API delay (500-1500ms per image, closer to real API timing)
    const delay = 500 + Math.random() * 1000
    await new Promise((resolve) => setTimeout(resolve, delay))

    // Simulate occasional failures
    if (Math.random() < this.failRate) {
      return {
        success: false,
        outputPath: '',
        error: `Mock generation failed for ${targetLanguage} (simulated error)`,
      }
    }

    // Return a placeholder result
    const timestamp = Date.now()
    const sourceName = sourceImagePath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || 'image'
    const outputPath = `mock_${sourceName}_${targetLanguage}_${timestamp}.jpg`

    return {
      success: true,
      outputPath,
    }
  }
}
