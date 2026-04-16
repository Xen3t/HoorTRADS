'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import FolderPicker from '@/components/home/FolderPicker'
import DropZone from '@/components/home/DropZone'
import FolderTree from '@/components/home/FolderTree'
import CampaignNameInput from '@/components/home/CampaignNameInput'
import SessionCard from '@/components/home/SessionCard'
import type { ImportedImage } from '@/types/images'
import type { FolderNode, SubfolderEntry } from '@/types/folder'
import type { Session } from '@/types/session'

interface FolderScanData {
  images: ImportedImage[]
  folderPath: string
  campaignName: string
  tree: FolderNode
  totalImages: number
  subfolders: SubfolderEntry[]
}

export default function Home() {
  const resultsRef = useRef<HTMLDivElement>(null)
  const [dragImages, setDragImages] = useState<ImportedImage[]>([])
  const [folderData, setFolderData] = useState<FolderScanData | null>(null)
  const [campaignName, setCampaignName] = useState('')
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set())
  const [showAllSessions, setShowAllSessions] = useState(false)

  const ALL_FLAGS = ['de', 'es', 'it', 'gb', 'nl', 'pt', 'pl', 'se', 'be', 'cz', 'dk', 'fi', 'gr', 'hr', 'hu', 'ie', 'lt', 'lv', 'ro', 'si', 'sk', 'lu']
  const [randomFlags, setRandomFlags] = useState(ALL_FLAGS.slice(0, 10))

  useEffect(() => {
    const shuffled = [...ALL_FLAGS].sort(() => Math.random() - 0.5)
    setRandomFlags(shuffled.slice(0, 10))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/sessions')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.sessions) setSessions(data.sessions)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const handleFolderImport = async (data: {
    images: ImportedImage[]
    rootName: string
    rootPath: string
    tree: FolderNode
    totalImages: number
    subfolders: SubfolderEntry[]
  }) => {
    setFolderData({
      images: data.images,
      folderPath: data.rootPath,
      campaignName: data.rootName,
      tree: data.tree,
      totalImages: data.totalImages,
      subfolders: data.subfolders,
    })
    setCampaignName(data.rootName)
    setDragImages([])

    // Set default selected folders
    const defaults = new Set(
      data.subfolders
        .filter((f) => f.selectedByDefault)
        .map((f) => f.name)
    )
    // If no defaults matched, select all
    if (defaults.size === 0) {
      data.subfolders.forEach((f) => defaults.add(f.name))
    }
    setSelectedFolders(defaults)

    // Auto-scroll to results
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 200)
  }

  const handleContinue = async () => {
    if (!folderData) return

    const selectedImageCount = folderData.subfolders
      .filter((f) => selectedFolders.has(f.name))
      .reduce((sum, f) => sum + f.imageCount, 0)

    try {
      // Build list of selected folder paths
      const selectedPaths = folderData.subfolders.length > 0
        ? folderData.subfolders
            .filter((f) => selectedFolders.has(f.name))
            .map((f) => f.path)
        : [folderData.folderPath]

      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName,
          image_count: selectedImageCount || folderData.totalImages,
          source_path: folderData.folderPath,
          selected_paths: selectedPaths,
          current_step: 'configure',
        }),
      })
      const result = await res.json()
      if (result.session?.id) {
        window.location.href = `/campaign/${result.session.id}/configure`
      }
    } catch {
      // Session creation failed silently
    }
  }

  const handleDropImport = (newImages: ImportedImage[]) => {
    setDragImages((prev) => [...prev, ...newImages])
    setFolderData(null)
  }

  const handleToggleFolder = (folderName: string) => {
    setSelectedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderName)) {
        next.delete(folderName)
      } else {
        next.add(folderName)
      }
      return next
    })
  }

  const handleSessionClick = (session: Session) => {
    if (typeof window !== 'undefined') {
      window.location.href = `/campaign/${session.id}/configure`
    }
  }

  const handleSessionDelete = async (session: Session) => {
    try {
      await fetch(`/api/sessions/${session.id}`, { method: 'DELETE' })
      setSessions((prev) => prev.filter((s) => s.id !== session.id))
    } catch {
      // Delete failed silently
    }
  }

  const hasContent = folderData !== null || dragImages.length > 0

  const [showAdminPrompt, setShowAdminPrompt] = useState(false)
  const [adminCode, setAdminCode] = useState('')
  const [adminError, setAdminError] = useState(false)

  const handleAdminAccess = () => {
    if (adminCode === '1212') {
      window.location.href = '/admin'
    } else {
      setAdminError(true)
      setTimeout(() => setAdminError(false), 2000)
    }
  }

  return (
    <main className="min-h-screen px-8 pt-24 pb-12 relative overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #f8faf6 0%, #ffffff 40%, #f8f9fa 100%)' }}
    >
      {/* Admin gear icon */}
      <button
        onClick={() => setShowAdminPrompt(!showAdminPrompt)}
        className="absolute top-6 right-6 text-text-disabled hover:text-text-secondary transition-colors"
        title="Admin"
      >
        <span className="text-lg">⚙️</span>
      </button>

      {/* Admin code prompt */}
      <AnimatePresence>
        {showAdminPrompt && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-14 right-6 bg-white rounded-[12px] shadow-lg border border-border p-4 z-50"
          >
            <p className="text-xs font-semibold text-text-secondary mb-2">Accès admin</p>
            <div className="flex gap-2">
              <input
                type="password"
                value={adminCode}
                onChange={(e) => { setAdminCode(e.target.value); setAdminError(false) }}
                onKeyDown={(e) => e.key === 'Enter' && handleAdminAccess()}
                placeholder="Code"
                className={`
                  w-32 px-3 py-1.5 rounded-[8px] text-sm
                  border bg-white focus:outline-none
                  ${adminError ? 'border-brand-red' : 'border-border focus:border-brand-green'}
                `}
                autoFocus
              />
              <button
                onClick={handleAdminAccess}
                className="px-3 py-1.5 bg-brand-green text-white text-xs font-semibold rounded-[8px] hover:bg-brand-green-hover"
              >
                →
              </button>
            </div>
            {adminError && <p className="text-[10px] text-brand-red mt-1">Code invalide</p>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Decorative background shapes */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.06 }}
          transition={{ duration: 2 }}
          className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, #5d9228 0%, transparent 65%)' }}
        />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.04 }}
          transition={{ duration: 2, delay: 0.5 }}
          className="absolute top-60 -left-40 w-[400px] h-[400px] rounded-full"
          style={{ background: 'radial-gradient(circle, #38a0ad 0%, transparent 65%)' }}
        />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.03 }}
          transition={{ duration: 2, delay: 1 }}
          className="absolute bottom-20 right-0 w-[300px] h-[300px] rounded-full"
          style={{ background: 'radial-gradient(circle, #dc9083 0%, transparent 65%)' }}
        />
      </div>

      <div className="w-full max-w-[600px] mx-auto text-center relative">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="mb-12"
        >
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <h1 className="text-7xl font-bold tracking-tight">
              <span className="text-text-primary">Hoor</span><span className="text-brand-green">TRADS</span>
            </h1>
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-4 text-text-secondary text-base tracking-wide"
          >
            Traduisez vos visuels publicitaires en un clic
          </motion.p>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="flex items-center justify-center gap-2 mt-4"
          >
            {randomFlags.map((code, i) => (
              <motion.span
                key={code}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 0.4, y: 0 }}
                transition={{ duration: 0.3, delay: 0.7 + i * 0.05 }}
                className={`fi fi-${code}`}
                style={{ fontSize: '14px', borderRadius: '2px' }}
              />
            ))}
          </motion.div>
        </motion.div>

        <AnimatePresence mode="wait">
          {!hasContent ? (
            /* Import zone — unified block */
            <motion.div
              key="import"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.4 }}
              className="bg-white rounded-[20px] shadow-sm border border-border p-8"
            >
              {/* Folder picker */}
              <FolderPicker onImagesImported={handleFolderImport} />

              {/* Divider */}
              <div className="flex items-center gap-4 my-5">
                <div className="flex-1 h-px bg-border" />
                <span className="text-text-disabled text-[11px] font-medium uppercase tracking-wider">ou</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Drop zone */}
              <DropZone onImagesImported={handleDropImport} />
            </motion.div>
          ) : (
            /* Scan results — replaces import zone */
            <motion.div
              key="results"
              ref={resultsRef}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.4 }}
              className="space-y-4"
            >
              {folderData && (
                <div className="bg-white rounded-[20px] shadow-sm border border-border p-6">
                  {/* Back button */}
                  <button
                    onClick={() => { setFolderData(null); setDragImages([]) }}
                    className="text-xs text-text-disabled hover:text-text-secondary transition-colors mb-4"
                  >
                    ← Retour en arrière
                  </button>

                  <CampaignNameInput
                    initialName={campaignName}
                    onNameChange={setCampaignName}
                  />
                  <p className="text-sm text-text-secondary mt-2 mb-4">
                    {folderData.totalImages} image{folderData.totalImages > 1 ? 's' : ''} trouvée{folderData.totalImages > 1 ? 's' : ''}
                  </p>

                  {/* Subfolder selection */}
                  {folderData.subfolders.length > 0 && (
                    <FolderTree
                      subfolders={folderData.subfolders}
                      selectedFolders={selectedFolders}
                      onToggleFolder={handleToggleFolder}
                    />
                  )}

                  {/* Continue button */}
                  <div className="mt-5 text-center">
                    <motion.button
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.2 }}
                      onClick={handleContinue}
                      disabled={selectedFolders.size === 0 && folderData.subfolders.length > 0}
                      className="
                        px-8 py-3 rounded-[12px]
                        bg-brand-green text-white font-bold text-sm
                        hover:bg-brand-green-hover hover:shadow-lg
                        transition-all duration-200
                        disabled:opacity-40 disabled:cursor-not-allowed
                      "
                    >
                      Continuer vers la configuration →
                    </motion.button>
                  </div>
                </div>
              )}

              {dragImages.length > 0 && (
                <div className="p-6 bg-surface rounded-[12px] shadow-sm text-left">
                  <h2 className="text-lg font-semibold text-text-primary mb-4">
                    {dragImages.length} image{dragImages.length > 1 ? 's' : ''} importée{dragImages.length > 1 ? 's' : ''}
                  </h2>
                  <div className="grid grid-cols-6 gap-2">
                    {dragImages.slice(0, 12).map((img, i) => (
                      <motion.div
                        key={img.id}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3, delay: i * 0.05 }}
                        className="aspect-square bg-border rounded-[8px] flex items-center justify-center text-xs text-text-disabled"
                        title={img.filename}
                      >
                        {img.format.toUpperCase()}
                      </motion.div>
                    ))}
                    {dragImages.length > 12 && (
                      <div className="aspect-square bg-surface rounded-[8px] flex items-center justify-center text-xs text-text-secondary font-semibold">
                        +{dragImages.length - 12}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Recent sessions — only show when no folder selected */}
        {!hasContent && sessions.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="mt-12 text-left"
          >
            <h3 className="text-sm font-semibold text-text-secondary mb-3">Sessions récentes</h3>
            <div className="space-y-2">
              {(showAllSessions ? sessions : sessions.slice(0, 3)).map((session, i) => (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                >
                  <SessionCard session={session} onClick={handleSessionClick} onDelete={handleSessionDelete} />
                </motion.div>
              ))}
            </div>
            {sessions.length > 3 && !showAllSessions && (
              <button
                onClick={() => setShowAllSessions(true)}
                className="mt-2 text-xs text-text-disabled hover:text-text-secondary transition-colors"
              >
                Voir les {sessions.length - 3} autres sessions...
              </button>
            )}
          </motion.div>
        )}
      </div>
    </main>
  )
}
