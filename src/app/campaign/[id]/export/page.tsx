'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import Image from 'next/image'
import type { Session } from '@/types/session'

type ExportMode = 'auto' | 'custom'

export default function ExportPage() {
  const params = useParams()
  const sessionId = params.id as string
  const [session, setSession] = useState<Session | null>(null)
  const [imageCount, setImageCount] = useState(0)
  const [exportMode, setExportMode] = useState<ExportMode>('auto')
  const [customPath, setCustomPath] = useState('')
  const [compressionTarget, setCompressionTarget] = useState('1')
  const [isExportingServer, setIsExportingServer] = useState(false)
  const [isExportingDrive, setIsExportingDrive] = useState(false)
  const [serverResult, setServerResult] = useState<string | null>(null)
  const [driveError, setDriveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const sessRes = await fetch(`/api/sessions/${sessionId}`)
        const sessData = await sessRes.json()
        if (cancelled) return
        if (sessData.session) setSession(sessData.session)

        const jobRes = await fetch(`/api/generate/by-session/${sessionId}`)
        const jobData = await jobRes.json()
        if (cancelled) return
        if (jobData.jobId) {
          const imgRes = await fetch(`/api/generate/${jobData.jobId}/images`)
          const imgData = await imgRes.json()
          if (!cancelled) setImageCount(imgData.total || 0)
        }
      } catch {}
    }
    load()
    return () => { cancelled = true }
  }, [sessionId])

  const handleExportServer = async () => {
    setIsExportingServer(true)
    setServerResult(null)
    try {
      const res = await fetch('/api/export/server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          mode: exportMode,
          customPath: exportMode === 'custom' ? customPath : undefined,
          compressionTarget: parseFloat(compressionTarget),
        }),
      })
      const data = await res.json()
      if (data.success) {
        setServerResult(data.message)
      }
    } finally {
      setIsExportingServer(false)
    }
  }

  const handleExportDrive = async () => {
    setIsExportingDrive(true)
    setDriveError(null)
    try {
      const res = await fetch('/api/export/drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      const data = await res.json()
      if (!res.ok) setDriveError(data.error)
    } finally {
      setIsExportingDrive(false)
    }
  }

  if (!session) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-text-secondary">Chargement...</p>
      </main>
    )
  }

  const sourcePath = session.source_path || ''

  return (
    <main className="min-h-screen px-8 pt-4 pb-12">
      <div className="w-full max-w-[550px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h2 className="text-xl font-bold text-text-primary">Export</h2>
          <p className="text-sm text-text-secondary mt-1">
            Choisissez une destination pour vos visuels traduits
          </p>
        </motion.div>

        {/* Export mode selection */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-[12px] shadow-sm p-5 mb-4"
        >
          <p className="text-xs font-semibold text-text-secondary mb-3">Destination</p>

          {/* Auto mode */}
          <button
            onClick={() => setExportMode('auto')}
            className={`
              w-full text-left p-3 rounded-[8px] mb-2 transition-colors
              ${exportMode === 'auto' ? 'bg-brand-green-light border border-brand-green' : 'bg-surface hover:bg-border border border-transparent'}
            `}
          >
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${exportMode === 'auto' ? 'border-brand-green' : 'border-border'}`}>
                {exportMode === 'auto' && <div className="w-2 h-2 rounded-full bg-brand-green" />}
              </div>
              <span className="text-sm font-semibold text-text-primary">Dossiers d&apos;origine</span>
            </div>
            <p className="text-xs text-text-secondary mt-1 ml-6">
              Les images sont rangées dans le dossier RENDU/ de chaque source avec des sous-dossiers par pays (DE/, LU/, etc.)
            </p>
            {sourcePath && (
              <p className="text-[10px] text-brand-teal mt-1 ml-6 truncate">📁 {sourcePath}</p>
            )}
          </button>

          {/* Custom mode */}
          <button
            onClick={() => setExportMode('custom')}
            className={`
              w-full text-left p-3 rounded-[8px] transition-colors
              ${exportMode === 'custom' ? 'bg-brand-green-light border border-brand-green' : 'bg-surface hover:bg-border border border-transparent'}
            `}
          >
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${exportMode === 'custom' ? 'border-brand-green' : 'border-border'}`}>
                {exportMode === 'custom' && <div className="w-2 h-2 rounded-full bg-brand-green" />}
              </div>
              <span className="text-sm font-semibold text-text-primary">Dossier personnalisé</span>
            </div>
            <p className="text-xs text-text-secondary mt-1 ml-6">
              Toutes les images exportées dans un seul dossier de votre choix
            </p>
          </button>

          {/* Custom path input */}
          {exportMode === 'custom' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-3 overflow-hidden"
            >
              <input
                type="text"
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                placeholder="ex. C:\Export\Campagne..."
                className="
                  w-full px-3 py-2 rounded-[8px] text-sm
                  border border-border bg-white text-text-primary
                  focus:border-brand-green focus:outline-none
                "
              />
            </motion.div>
          )}
        </motion.div>

        {/* Compression */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white rounded-[12px] shadow-sm px-5 py-4 mb-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Compression</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-disabled">&lt; {compressionTarget} MB</span>
              <select
                value={compressionTarget}
                onChange={(e) => setCompressionTarget(e.target.value)}
                className="text-xs border border-border rounded px-2 py-1 bg-white text-text-primary"
              >
                <option value="0.5">0.5 MB</option>
                <option value="1">1 MB (par défaut)</option>
                <option value="2">2 MB</option>
                <option value="5">Sans limite</option>
              </select>
            </div>
          </div>
        </motion.div>

        {/* Info box */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-2 px-4 py-3 bg-surface border border-border rounded-[12px] text-sm text-text-secondary mb-6"
        >
          <span>ℹ️</span>
          <span>{imageCount} images + translations.json prêts à exporter</span>
        </motion.div>

        {/* Export buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="space-y-3"
        >
          <button
            onClick={handleExportServer}
            disabled={isExportingServer || (exportMode === 'custom' && !customPath.trim())}
            className="
              w-full flex items-center justify-center gap-3
              py-4 rounded-[12px]
              bg-brand-green text-white font-bold text-base
              hover:bg-brand-green-hover hover:shadow-lg
              transition-all duration-200
              disabled:opacity-50
            "
          >
            <span className="text-xl">🖥️</span>
            {isExportingServer ? 'Export en cours...' : 'Enregistrer sur le serveur'}
          </button>

          <button
            onClick={handleExportDrive}
            disabled={isExportingDrive}
            className="
              w-full flex items-center justify-center gap-3
              py-4 rounded-[12px]
              bg-brand-teal text-white font-bold text-base
              hover:bg-brand-teal-hover hover:shadow-lg
              transition-all duration-200
              disabled:opacity-50
            "
          >
            <span className="bg-white rounded-[4px] p-0.5 flex items-center justify-center">
              <Image src="/google-drive.svg" alt="" width={16} height={16} />
            </span>
            {isExportingDrive ? 'Envoi en cours...' : 'Envoyer sur le drive IMGxHAxMKG'}
          </button>
        </motion.div>

        {/* Results */}
        {serverResult && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-4 bg-brand-green-light rounded-[12px] text-sm text-brand-green font-semibold text-center"
          >
            ✓ {serverResult}
          </motion.div>
        )}

        {driveError && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-4 bg-brand-red-light rounded-[12px] text-sm text-brand-red text-center"
          >
            {driveError}
          </motion.div>
        )}

        {serverResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-8 text-center"
          >
            <button
              onClick={() => { window.location.href = '/' }}
              className="text-sm text-brand-teal hover:text-brand-teal-hover transition-colors font-semibold"
            >
              ← Retour à l&apos;accueil
            </button>
          </motion.div>
        )}
      </div>
    </main>
  )
}
