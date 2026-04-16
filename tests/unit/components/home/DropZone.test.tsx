import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DropZone from '@/components/home/DropZone'

describe('DropZone', () => {
  it('renders empty state with instruction text', () => {
    render(<DropZone onImagesImported={() => {}} />)
    expect(screen.getByText('Glissez vos images ici')).toBeDefined()
  })

  it('shows supported formats', () => {
    render(<DropZone onImagesImported={() => {}} />)
    expect(screen.getByText('PNG, JPG, WebP')).toBeDefined()
  })

  it('has accessible role and label', () => {
    render(<DropZone onImagesImported={() => {}} />)
    const dropzone = screen.getByRole('button', { name: /déposez vos images/i })
    expect(dropzone).toBeDefined()
  })
})
