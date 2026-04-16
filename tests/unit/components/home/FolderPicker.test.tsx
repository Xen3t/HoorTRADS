import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FolderPicker from '@/components/home/FolderPicker'

describe('FolderPicker', () => {
  it('renders primary button', () => {
    render(<FolderPicker onImagesImported={() => {}} />)
    expect(screen.getByText(/Sélectionner un dossier/)).toBeDefined()
  })

  it('shows folder browser when button is clicked', () => {
    render(<FolderPicker onImagesImported={() => {}} />)
    fireEvent.click(screen.getByText(/Sélectionner un dossier/))
    expect(screen.getByText('Parcourir les dossiers')).toBeDefined()
  })

  it('shows close button in browser', () => {
    render(<FolderPicker onImagesImported={() => {}} />)
    fireEvent.click(screen.getByText(/Sélectionner un dossier/))
    expect(screen.getByText('×')).toBeDefined()
  })
})
