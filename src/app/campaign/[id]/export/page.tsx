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
  const [campaignName, setCampaignName] = useState('')
  const [isExportingServer, setIsExportingServer] = useState(false)
  const [isExportingDrive, setIsExportingDrive] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [exportProgress, setExportProgress] = useState(0)
  const [serverResult, setServerResult] = useState<string | null>(null)
  const [driveError, setDriveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const sessRes = await fetch(`/api/sessions/${sessionId}`)
        const sessData = await sessRes.json()
        if (cancelled) return
        if (sessData.session) {
          setSession(sessData.session)
          try {
            const cfg = sessData.session.config ? JSON.parse(sessData.session.config) : {}
            setCampaignName(cfg.campaignName || sessData.session.name || '')
          } catch {
            setCampaignName(sessData.session.name || '')
          }
        }

        const jobRes = await fetch(`/api/generate/by-session/${sessionId}`)
        const jobData = await jobRes.json()
        if (cancelled) return
        if (jobData.jobId) {
          if (!cancelled) setJobId(jobData.jobId)
          const imgRes = await fetch(`/api/generate/${jobData.jobId}/images`)
          const imgData = await imgRes.json()
          if (!cancelled) setImageCount(imgData.total || 0)
        }
      } catch (e) { console.error('[export] load', e) }
    }
    load()
    return () => { cancelled = true }
  }, [sessionId])

  const handleExportServer = async () => {
    setIsExportingServer(true)
    setServerResult(null)
    setExportProgress(0)
    const progressInterval = setInterval(() => {
      setExportProgress((p) => Math.min(p + Math.random() * 12, 90))
    }, 300)
    try {
      const res = await fetch('/api/export/server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          mode: exportMode,
          customPath: exportMode === 'custom' ? customPath : undefined,
          compressionTarget: parseFloat(compressionTarget),
          campaignName: campaignName.trim() || session?.name,
        }),
      })
      if (!res.ok) return
      const data = await res.json()
      if (data.success) {
        setServerResult(data.message)
        // Persiste le nom d'opération dans la config de session
        try {
          const existingConfig = session?.config ? JSON.parse(session.config) : {}
          await fetch(`/api/sessions/${sessionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              config: JSON.stringify({ ...existingConfig, campaignName: campaignName.trim() }),
            }),
          })
        } catch (e) { console.error('[export] persist campaign name', e) }
      }
    } finally {
      clearInterval(progressInterval)
      setExportProgress(100)
      setTimeout(() => setExportProgress(0), 800)
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

        {/* Campaign name override */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white rounded-[12px] shadow-sm px-5 py-4 mb-4"
        >
          <p className="text-xs font-semibold text-text-secondary mb-2">Nom de l&apos;opération (préfixe fichier)</p>
          <input
            type="text"
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            placeholder={session?.name || ''}
            className="
              w-full px-3 py-2 rounded-[8px] text-sm
              border border-border bg-white text-text-primary
              focus:border-brand-green focus:outline-none
            "
          />
          <p className="text-[10px] text-text-disabled mt-1">
            Exemple&nbsp;: <span className="font-mono">{(campaignName || session?.name || 'NomOp').replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_')}_1920x1080_DE.jpg</span>
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
              ${exportMode === 'auto' ? 'bg-brand-green-light border border-brand-green' : 'bg-white hover:bg-surface border border-border'}
            `}
          >
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${exportMode === 'auto' ? 'border-brand-green' : 'border-border'}`}>
                {exportMode === 'auto' && <div className="w-2 h-2 rounded-full bg-brand-green" />}
              </div>
              <span className="text-sm font-semibold text-text-primary">Dossiers d&apos;origine</span>
            </div>
            <p className="text-xs text-text-secondary mt-1 ml-6">
              Les images sont rangées dans un sous-dossier RENDU/ à l&apos;intérieur du dossier source, avec des sous-dossiers par pays (RENDU/DE/, RENDU/LU/, etc.)
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
              ${exportMode === 'custom' ? 'bg-brand-green-light border border-brand-green' : 'bg-white hover:bg-surface border border-border'}
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
          className="flex items-center gap-2 px-4 py-3 bg-white border border-border rounded-[12px] text-sm text-text-secondary mb-6"
        >
          <span>ℹ️</span>
          <span>{imageCount} images + translations.json prêts à exporter</span>
        </motion.div>

        {/* Export options — 3 cards side-by-side */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4"
        >
          {/* Exporter sur disque / serveur */}
          <div className="bg-white rounded-[12px] shadow-sm p-4 flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-[8px] bg-brand-green-light flex items-center justify-center text-brand-green">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12H2"/>
                  <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/>
                  <line x1="6" y1="16" x2="6.01" y2="16"/>
                  <line x1="10" y1="16" x2="10.01" y2="16"/>
                </svg>
              </div>
              <h3 className="font-bold text-sm text-text-primary">Exporter</h3>
            </div>
            <p className="text-xs text-text-disabled mb-3 flex-1">
              Vers un dossier local ou réseau (format dossier par pays).
            </p>
            <button
              onClick={handleExportServer}
              disabled={isExportingServer || (exportMode === 'custom' && !customPath.trim())}
              className="
                w-full px-3 py-2 rounded-[8px]
                bg-brand-green text-white font-semibold text-xs
                hover:bg-brand-green-hover transition-colors
                disabled:opacity-50
              "
            >
              {isExportingServer ? 'Export en cours...' : 'Exporter'}
            </button>
            {isExportingServer && (
              <div className="w-full h-1 bg-border rounded-full overflow-hidden mt-2">
                <div
                  className="h-full bg-brand-green rounded-full transition-all duration-300"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
            )}
          </div>

          {/* Google Drive */}
          <div className="bg-white rounded-[12px] shadow-sm p-4 flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-[8px] bg-brand-teal-light flex items-center justify-center">
                <Image src="/google-drive.svg" alt="" width={16} height={16} />
              </div>
              <h3 className="font-bold text-sm text-text-primary">Google Drive</h3>
            </div>
            <p className="text-xs text-text-disabled mb-3 flex-1">
              Envoi direct sur le drive partagé IMGxHAxMKG.
            </p>
            <button
              onClick={handleExportDrive}
              disabled={isExportingDrive}
              className="
                w-full px-3 py-2 rounded-[8px]
                bg-brand-teal text-white font-semibold text-xs
                hover:bg-brand-teal-hover transition-colors
                disabled:opacity-50
              "
            >
              {isExportingDrive ? 'Envoi en cours...' : 'Envoyer'}
            </button>
          </div>

          {/* ZIP Download */}
          <div className="bg-white rounded-[12px] shadow-sm p-4 flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-[8px] bg-surface flex items-center justify-center text-text-primary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </div>
              <h3 className="font-bold text-sm text-text-primary">Télécharger (ZIP)</h3>
            </div>
            <p className="text-xs text-text-disabled mb-3 flex-1">
              Archive zippée de toutes les images, triées par pays.
            </p>
            {jobId ? (
              <a
                href={`/api/generate/${jobId}/download-all`}
                className="
                  w-full px-3 py-2 rounded-[8px] text-center
                  bg-white text-text-primary border border-border font-semibold text-xs
                  hover:border-brand-green hover:text-brand-green
                  transition-colors
                "
              >
                Télécharger
              </a>
            ) : (
              <button disabled className="w-full px-3 py-2 rounded-[8px] bg-surface text-text-disabled font-semibold text-xs cursor-not-allowed">
                Indisponible
              </button>
            )}
          </div>
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

      </div>
    </main>
  )
}
