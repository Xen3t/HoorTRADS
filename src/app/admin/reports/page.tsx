'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'

interface Report {
  name: string
  createdAt: string
  size: number
}

interface Stats {
  totalImages: number
  totalFailures: number
  totalRegenSource: number
  totalRegenCorr: number
  firstPassPct: number | null
  firstPass: number
  firstPassTotal: number
  totalCost: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [htmlContent, setHtmlContent] = useState<string | null>(null)
  const [loadingReport, setLoadingReport] = useState(false)
  const [renamingFile, setRenamingFile] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [autoReport, setAutoReport] = useState(false)
  const [savingAutoReport, setSavingAutoReport] = useState(false)

  const reload = () => {
    fetch('/api/admin/reports')
      .then(r => r.json())
      .then(d => { setReports(d.reports); setStats(d.stats) })
  }

  useEffect(() => {
    fetch('/api/admin/reports')
      .then(r => r.json())
      .then(d => { setReports(d.reports); setStats(d.stats) })
      .finally(() => setLoading(false))
    fetch('/api/admin/config')
      .then(r => r.json())
      .then(d => { if (d.config?.synthesis_html_enabled) setAutoReport(d.config.synthesis_html_enabled === 'true') })
      .catch(() => {})
  }, [])

  const openReport = async (name: string) => {
    setSelected(name)
    setLoadingReport(true)
    setHtmlContent(null)
    const res = await fetch(`/api/admin/reports?file=${encodeURIComponent(name)}`)
    const html = await res.text()
    setHtmlContent(html)
    setLoadingReport(false)
  }

  const downloadReport = () => {
    if (!htmlContent || !selected) return
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = selected
    a.click()
    URL.revokeObjectURL(url)
  }

  const closeOverlay = () => {
    setSelected(null)
    setHtmlContent(null)
  }

  const startRename = (e: React.MouseEvent, name: string) => {
    e.stopPropagation()
    setRenamingFile(name)
    setRenameValue(name.replace(/\.html$/, ''))
  }

  const confirmRename = async (e: React.MouseEvent | React.KeyboardEvent, oldName: string) => {
    e.stopPropagation()
    const newName = renameValue.trim().replace(/\.html$/, '') + '.html'
    if (!newName || newName === oldName) { setRenamingFile(null); return }
    await fetch('/api/admin/reports', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: oldName, newName }),
    })
    setRenamingFile(null)
    reload()
  }

  const toggleAutoReport = async (enabled: boolean) => {
    setSavingAutoReport(true)
    setAutoReport(enabled)
    try {
      const configRes = await fetch('/api/admin/config')
      const configData = await configRes.json()
      await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...configData.config, synthesis_html_enabled: enabled ? 'true' : 'false' }),
      })
    } finally {
      setSavingAutoReport(false)
    }
  }

  const deleteReport = async (e: React.MouseEvent, name: string) => {
    e.stopPropagation()
    if (!confirm(`Supprimer "${name}" ?`)) return
    await fetch('/api/admin/reports', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: name }),
    })
    reload()
  }

  return (
    <main className="min-h-screen px-8 pt-12 pb-12">
      <div className="max-w-[700px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-10"
        >
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Rapports</h1>
            <p className="text-sm text-text-secondary mt-1">Synthèses HTML générées à l&apos;export</p>
          </div>
          <Link href="/admin" className="text-sm text-brand-teal hover:text-brand-teal-hover">← Admin</Link>
        </motion.div>

        {stats && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="grid grid-cols-6 gap-3 mb-6"
          >
            {[
              { label: 'Pourcentage First Pass', labelSub: undefined, value: stats.firstPassPct != null ? `${stats.firstPassPct}%` : '—', sub: stats.firstPassTotal > 0 ? `${stats.firstPass}/${stats.firstPassTotal}` : undefined, color: 'text-brand-green' },
              { label: 'Images générées', labelSub: undefined, value: stats.totalImages.toLocaleString('fr-FR'), color: 'text-text-primary' },
              { label: 'Regen source', labelSub: undefined, value: stats.totalRegenSource.toLocaleString('fr-FR'), color: stats.totalRegenSource > 0 ? 'text-amber-500' : 'text-text-primary' },
              { label: 'Regen correctives', labelSub: undefined, value: stats.totalRegenCorr.toLocaleString('fr-FR'), color: stats.totalRegenCorr > 0 ? 'text-amber-500' : 'text-text-primary' },
              { label: 'Échecs', labelSub: 'API', value: stats.totalFailures.toLocaleString('fr-FR'), color: stats.totalFailures > 0 ? 'text-brand-red' : 'text-text-primary' },
              { label: 'Coût total', labelSub: 'FOURCHETTE', value: stats.totalCost, color: 'text-text-primary' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-[12px] border border-border p-4 flex flex-col gap-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-disabled leading-tight">
                  {s.label}{s.labelSub && <><br /><span className="text-text-disabled/60">({s.labelSub})</span></>}
                </p>
                <div className="flex items-baseline gap-2">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  {'sub' in s && s.sub && <span className="text-xs text-text-disabled">{s.sub}</span>}
                </div>
              </div>
            ))}
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`flex items-center justify-between px-5 py-4 rounded-[12px] border mb-6 ${autoReport ? 'bg-brand-green/5 border-brand-green/30' : 'bg-white border-border'}`}
        >
          <div className="min-w-0 pr-4">
            <p className="text-sm font-semibold text-text-primary">Rapport automatique</p>
            <p className="text-xs text-text-disabled mt-0.5">Génère un fichier HTML à côté des images après chaque export.</p>
          </div>
          <button
            onClick={() => !savingAutoReport && toggleAutoReport(!autoReport)}
            disabled={savingAutoReport}
            className={`relative w-10 h-5 rounded-full transition-colors duration-200 shrink-0 ${autoReport ? 'bg-brand-green' : 'bg-border'} disabled:opacity-50`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${autoReport ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </motion.div>

        {loading ? (
          <div className="text-sm text-text-disabled text-center py-20">Chargement…</div>
        ) : reports.length === 0 ? (
          <div className="text-sm text-text-disabled text-center py-20">Aucun rapport disponible</div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col gap-2"
          >
            {reports.map((r, i) => (
              <motion.div
                key={r.name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => renamingFile !== r.name && openReport(r.name)}
                className="flex items-center justify-between px-5 py-4 bg-white rounded-[12px] border border-border shadow-sm hover:shadow-default transition-all duration-200 cursor-pointer group"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="text-xl shrink-0">📄</span>
                  {renamingFile === r.name ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      onKeyDown={e => { if (e.key === 'Enter') confirmRename(e, r.name); if (e.key === 'Escape') setRenamingFile(null) }}
                      className="flex-1 px-2 py-0.5 text-sm border border-brand-teal rounded-[6px] focus:outline-none"
                    />
                  ) : (
                    <span className="text-sm font-medium text-text-primary truncate group-hover:text-brand-teal transition-colors">{r.name}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  {renamingFile === r.name ? (
                    <>
                      <button onClick={e => confirmRename(e, r.name)} className="text-xs font-semibold text-brand-green hover:text-brand-green-hover">Valider</button>
                      <button onClick={e => { e.stopPropagation(); setRenamingFile(null) }} className="text-xs text-text-disabled hover:text-text-secondary">Annuler</button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-text-disabled">{formatSize(r.size)}</span>
                      <span className="text-xs text-text-secondary">{formatDate(r.createdAt)}</span>
                      <button onClick={e => startRename(e, r.name)} className="opacity-0 group-hover:opacity-100 text-xs text-text-disabled hover:text-brand-teal transition-all" title="Renommer">✏️</button>
                      <button onClick={e => deleteReport(e, r.name)} className="opacity-0 group-hover:opacity-100 text-xs text-text-disabled hover:text-brand-red transition-all" title="Supprimer">🗑️</button>
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col bg-black/50 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) closeOverlay() }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 16 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="flex flex-col m-4 mt-6 rounded-[16px] overflow-hidden bg-white shadow-lg flex-1"
            >
              <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-white shrink-0">
                <span className="text-sm font-medium text-text-primary truncate max-w-[60%]">{selected}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={downloadReport}
                    disabled={!htmlContent}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-[8px] bg-brand-green text-white hover:bg-brand-green-hover transition-colors disabled:opacity-40"
                  >
                    ↓ Télécharger
                  </button>
                  <button
                    onClick={closeOverlay}
                    className="flex items-center justify-center w-7 h-7 rounded-full text-text-secondary hover:bg-surface hover:text-text-primary transition-colors text-lg leading-none"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="flex-1 relative">
                {loadingReport && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-text-disabled bg-white">
                    Chargement du rapport…
                  </div>
                )}
                {htmlContent && (
                  <iframe
                    srcDoc={htmlContent}
                    className="w-full h-full border-0"
                    sandbox="allow-scripts"
                    title={selected}
                  />
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}
