'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ByLanguage {
  target_language: string
  country_code: string
  total_tasks: number
  failed_tasks: number
  regen_count: number
  error_count: number
  error_rate: number
  estimated_cost: number
}

interface RecentJob {
  id: string
  completed_tasks: number
  failed_tasks: number
  total_tasks: number
  created_at: string
  session_name: string
  user_name: string | null
  regen_count: number
  error_count: number
  error_rate: number
  estimated_cost_eur: number
}

interface ByMonth {
  month: string
  count: number
  failed: number
}

interface UsageData {
  totalGenerations: number
  totalCost: number
  totalRegens: number
  totalFailed: number
  totalSessions: number
  errorRate: number
  thisMonth: number
  thisMonthCost: number
  thisMonthRegens: number
  errorRateMonth: number
  costPerImage: number
  availableMonths: string[]
  availableYears: string[]
  byLanguage: ByLanguage[]
  recentJobs: RecentJob[]
  byMonth: ByMonth[]
}

type SortKey = 'country_code' | 'total_tasks' | 'error_rate' | 'estimated_cost' | 'regen_count'
type SortDir = 'asc' | 'desc'

function ErrorRateBadge({ rate }: { rate: number }) {
  const color = rate === 0 ? 'text-brand-green' : rate < 10 ? 'text-amber-600' : 'text-brand-red'
  const bg = rate === 0 ? 'bg-brand-green-light' : rate < 10 ? 'bg-amber-50' : 'bg-red-50'
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${bg} ${color}`}>
      {rate === 0 ? '0%' : `${rate.toFixed(1)}%`}
    </span>
  )
}

function formatMonth(m: string) {
  const [year, month] = m.split('-')
  const names = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']
  return `${names[parseInt(month) - 1]} ${year}`
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-[16px] border border-border p-5 flex flex-col gap-1">
      <p className="text-xs text-text-secondary font-medium uppercase tracking-wider">{label}</p>
      <p className={`text-3xl font-bold ${color ?? 'text-text-primary'}`}>{value}</p>
      {sub && <p className="text-xs text-text-disabled">{sub}</p>}
    </div>
  )
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className={`ml-1 text-[10px] ${active ? 'text-brand-teal' : 'text-text-disabled'}`}>
      {active ? (dir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  )
}

const currentYear = new Date().getFullYear().toString()

export default function AdminUsagePage() {
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('error_rate')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Filter state
  const [filterMode, setFilterMode] = useState<'year' | 'month' | 'custom'>('year')
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [selectedMonth, setSelectedMonth] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // Editable cost
  const [costInput, setCostInput] = useState('')
  const [savingCost, setSavingCost] = useState(false)
  const [costSaved, setCostSaved] = useState(false)

  function buildUrl() {
    if (filterMode === 'custom' && fromDate && toDate) return `/api/admin/usage?from=${fromDate}&to=${toDate}`
    if (filterMode === 'month' && selectedMonth) return `/api/admin/usage?month=${selectedMonth}`
    return `/api/admin/usage?year=${selectedYear}`
  }

  const load = () => {
    setLoading(true)
    fetch(buildUrl())
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        if (d.costPerImage && !costInput) setCostInput(d.costPerImage.toString())
      })
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [filterMode, selectedYear, selectedMonth, fromDate, toDate])

  const handleReset = async () => {
    setResetting(true)
    try {
      await fetch('/api/admin/usage', { method: 'DELETE' })
      setShowResetConfirm(false)
      load()
    } finally {
      setResetting(false)
    }
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const handleSaveCost = async () => {
    const val = parseFloat(costInput)
    if (isNaN(val) || val <= 0) return
    setSavingCost(true)
    try {
      await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cost_per_image_eur: val.toString() }),
      })
      setCostSaved(true)
      setTimeout(() => setCostSaved(false), 2000)
      load()
    } finally {
      setSavingCost(false)
    }
  }

  const sortedByLanguage = [...(data?.byLanguage ?? [])].sort((a, b) => {
    const mult = sortDir === 'asc' ? 1 : -1
    if (sortKey === 'country_code') return mult * a.country_code.localeCompare(b.country_code)
    return mult * ((a[sortKey] as number) - (b[sortKey] as number))
  })

  const allMonths = data?.availableMonths || []
  const allYears = data?.availableYears || []
  const chartData = (data?.byMonth ?? []).slice(-12)
  const maxCount = Math.max(...chartData.map((m) => m.count), 1)

  const periodLabel = filterMode === 'custom' && fromDate && toDate
    ? `${fromDate} → ${toDate}`
    : filterMode === 'month' && selectedMonth
      ? formatMonth(selectedMonth)
      : `Année ${selectedYear}`

  return (
    <main className="min-h-screen px-8 pt-12 pb-12">
      <div className="max-w-[1200px] mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Utilisation API</h1>
            <p className="text-sm text-text-secondary">Coûts, erreurs et statistiques de génération</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowResetConfirm(true)}
              className="text-xs text-brand-red hover:text-brand-red/80 border border-brand-red/30 hover:border-brand-red/60 px-3 py-1.5 rounded-[8px] transition-colors"
            >
              Repartir de zéro
            </button>
            <a href="/admin" className="text-sm text-brand-teal hover:text-brand-teal-hover">← Admin</a>
          </div>
        </div>

        {/* Reset confirm */}
        <AnimatePresence>
          {showResetConfirm && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-4 bg-red-50 border border-brand-red/30 rounded-[12px] p-4"
            >
              <p className="text-sm font-semibold text-brand-red mb-1">⚠ Réinitialiser toutes les données ?</p>
              <p className="text-xs text-text-secondary mb-4">
                Cette action supprime définitivement toutes les sessions, jobs, tâches et images générées. Irréversible.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setShowResetConfirm(false)} className="flex-1 py-2 rounded-[8px] border border-border text-sm text-text-secondary hover:bg-surface transition-colors">Annuler</button>
                <button onClick={handleReset} disabled={resetting} className="flex-1 py-2 rounded-[8px] bg-brand-red text-white text-sm font-semibold hover:bg-brand-red/90 transition-colors disabled:opacity-60">
                  {resetting ? 'Suppression...' : 'Oui, tout supprimer'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Filters */}
        <div className="bg-white rounded-[12px] border border-border p-4 mb-6 flex flex-wrap items-end gap-4">
          {/* Mode tabs */}
          <div className="flex items-center gap-1 bg-surface rounded-[8px] p-1">
            <button
              onClick={() => setFilterMode('year')}
              className={`px-3 py-1.5 rounded-[6px] text-xs font-semibold transition-colors ${filterMode === 'year' ? 'bg-white shadow-sm text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
            >
              Année
            </button>
            <button
              onClick={() => setFilterMode('month')}
              className={`px-3 py-1.5 rounded-[6px] text-xs font-semibold transition-colors ${filterMode === 'month' ? 'bg-white shadow-sm text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
            >
              Mois
            </button>
            <button
              onClick={() => setFilterMode('custom')}
              className={`px-3 py-1.5 rounded-[6px] text-xs font-semibold transition-colors ${filterMode === 'custom' ? 'bg-white shadow-sm text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
            >
              Période
            </button>
          </div>

          {/* Year selector */}
          {filterMode === 'year' && (
            <div className="flex items-center gap-2 flex-wrap">
              {allYears.length > 0 ? allYears.map((y) => (
                <button
                  key={y}
                  onClick={() => setSelectedYear(y)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${selectedYear === y ? 'bg-brand-green text-white' : 'bg-surface border border-border text-text-secondary hover:bg-border'}`}
                >
                  {y}
                </button>
              )) : (
                <span className="text-xs text-text-disabled">{currentYear}</span>
              )}
            </div>
          )}

          {/* Month selector */}
          {filterMode === 'month' && (
            <div className="flex items-center gap-2 flex-wrap">
              {allMonths.map((m) => (
                <button
                  key={m}
                  onClick={() => setSelectedMonth(m)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${selectedMonth === m ? 'bg-brand-green text-white' : 'bg-surface border border-border text-text-secondary hover:bg-border'}`}
                >
                  {formatMonth(m)}
                </button>
              ))}
            </div>
          )}

          {/* Custom range */}
          {filterMode === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                className="px-3 py-1.5 rounded-[8px] text-xs border border-border bg-white focus:outline-none focus:border-brand-green" />
              <span className="text-xs text-text-disabled">→</span>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                className="px-3 py-1.5 rounded-[8px] text-xs border border-border bg-white focus:outline-none focus:border-brand-green" />
            </div>
          )}

          <span className="text-xs text-text-disabled ml-auto">{periodLabel}</span>
        </div>

        {loading ? (
          <p className="text-center text-sm text-text-secondary py-16">Chargement...</p>
        ) : (
          <motion.div key={buildUrl()} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>

            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <KpiCard label="Images générées" value={String(data?.totalGenerations ?? 0)} sub={`${data?.thisMonth ?? 0} ce mois`} />
              <KpiCard label="Coût estimé" value={`${(data?.totalCost ?? 0).toFixed(2)} €`} sub={`${(data?.thisMonthCost ?? 0).toFixed(2)} € ce mois`} />
              <KpiCard label="Taux d'erreur" value={`${(data?.errorRate ?? 0).toFixed(1)}%`} sub={`${(data?.errorRateMonth ?? 0).toFixed(1)}% ce mois`} color={(data?.errorRate ?? 0) < 10 ? 'text-brand-green' : 'text-brand-red'} />
              <KpiCard label="Regénérations" value={String(data?.totalRegens ?? 0)} sub={`${data?.totalFailed ?? 0} échec${(data?.totalFailed ?? 0) !== 1 ? 's' : ''}`} />
              <KpiCard label="Projets créés" value={String(data?.totalSessions ?? 0)} />
            </div>

            {/* Monthly bar chart */}
            {chartData.length > 0 && (
              <div className="bg-white rounded-[16px] border border-border p-5 mb-4">
                <p className="text-sm font-semibold text-text-primary mb-1">Activité mensuelle</p>
                <p className="text-xs text-text-disabled mb-4">Images générées par mois</p>
                <div className="flex items-end gap-1.5 h-32">
                  {chartData.map((row) => {
                    const heightPct = Math.max((row.count / maxCount) * 100, 2)
                    const failedPct = row.count > 0 ? (row.failed / row.count) * 100 : 0
                    return (
                      <div key={row.month} className="flex-1 flex flex-col items-center gap-1 group relative">
                        <div className="w-full rounded-t-[4px] relative overflow-hidden transition-opacity hover:opacity-80" style={{ height: `${heightPct}%`, minHeight: 4 }}>
                          <div className="absolute inset-0 bg-brand-green" />
                          {failedPct > 0 && <div className="absolute bottom-0 left-0 right-0 bg-brand-red/60" style={{ height: `${failedPct}%` }} />}
                        </div>
                        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[9px] px-1.5 py-1 rounded-[4px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                          {formatMonth(row.month)}<br />{row.count} img · {row.failed} échec
                        </div>
                        <span className="text-[8px] text-text-disabled truncate w-full text-center">{row.month.slice(5)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* By country table */}
            {sortedByLanguage.length > 0 && (
              <div className="bg-white rounded-[16px] border border-border overflow-hidden mb-4">
                <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                  <p className="text-sm font-semibold text-text-primary">Détail par pays</p>
                  <p className="text-xs text-text-disabled">Cliquez sur une colonne pour trier</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-surface">
                        <th className="text-left px-4 py-2.5 font-semibold text-text-secondary cursor-pointer hover:text-text-primary select-none" onClick={() => handleSort('country_code')}>
                          Pays <SortIcon active={sortKey === 'country_code'} dir={sortDir} />
                        </th>
                        <th className="text-right px-4 py-2.5 font-semibold text-text-secondary cursor-pointer hover:text-text-primary select-none" onClick={() => handleSort('total_tasks')}>
                          Images <SortIcon active={sortKey === 'total_tasks'} dir={sortDir} />
                        </th>
                        <th className="text-right px-4 py-2.5 font-semibold text-text-secondary cursor-pointer hover:text-text-primary select-none" onClick={() => handleSort('regen_count')}>
                          Regénération <SortIcon active={sortKey === 'regen_count'} dir={sortDir} />
                        </th>
                        <th className="text-right px-4 py-2.5 font-semibold text-text-secondary cursor-pointer hover:text-text-primary select-none" onClick={() => handleSort('error_rate')}>
                          Erreurs <SortIcon active={sortKey === 'error_rate'} dir={sortDir} />
                        </th>
                        <th className="text-right px-4 py-2.5 font-semibold text-text-secondary cursor-pointer hover:text-text-primary select-none" onClick={() => handleSort('estimated_cost')}>
                          Coût <SortIcon active={sortKey === 'estimated_cost'} dir={sortDir} />
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {sortedByLanguage.map((row) => (
                        <tr key={`${row.target_language}-${row.country_code}`} className="hover:bg-surface">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className={`fi fi-${row.country_code.toLowerCase()}`} style={{ fontSize: '14px', borderRadius: '2px', flexShrink: 0 }} />
                              <span className="font-semibold text-text-primary">{row.country_code.toUpperCase()}</span>
                              <span className="text-text-disabled">{row.target_language}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium text-text-primary">{row.total_tasks}</td>
                          <td className="px-4 py-2.5 text-right text-text-secondary">{row.regen_count}</td>
                          <td className="px-4 py-2.5 text-right"><ErrorRateBadge rate={row.error_rate} /></td>
                          <td className="px-4 py-2.5 text-right font-medium text-text-primary">{row.estimated_cost.toFixed(2)} €</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-surface">
                        <td className="px-4 py-2.5 font-bold text-text-primary text-xs">TOTAL</td>
                        <td className="px-4 py-2.5 text-right font-bold text-text-primary">{data?.totalGenerations ?? 0}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-text-secondary">{data?.totalRegens ?? 0}</td>
                        <td className="px-4 py-2.5 text-right"><ErrorRateBadge rate={data?.errorRate ?? 0} /></td>
                        <td className="px-4 py-2.5 text-right font-bold text-text-primary">{(data?.totalCost ?? 0).toFixed(2)} €</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Session logs */}
            {data?.recentJobs && data.recentJobs.length > 0 && (
              <div className="bg-white rounded-[16px] border border-border overflow-hidden mb-4">
                <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                  <p className="text-sm font-semibold text-text-primary">Logs de sessions</p>
                  <span className="text-xs text-text-disabled">{data.recentJobs.length} session{data.recentJobs.length > 1 ? 's' : ''}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-surface">
                        <th className="text-left px-5 py-2.5 font-semibold text-text-secondary">Session</th>
                        <th className="text-left px-5 py-2.5 font-semibold text-text-secondary">Utilisateur</th>
                        <th className="text-left px-5 py-2.5 font-semibold text-text-secondary">Date</th>
                        <th className="text-right px-5 py-2.5 font-semibold text-text-secondary">Images</th>
                        <th className="text-right px-5 py-2.5 font-semibold text-text-secondary">Regénération</th>
                        <th className="text-right px-5 py-2.5 font-semibold text-text-secondary">Erreurs</th>
                        <th className="text-right px-5 py-2.5 font-semibold text-text-secondary">Coût</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.recentJobs.map((job) => (
                        <tr key={job.id} className="hover:bg-surface">
                          <td className="px-5 py-2.5 font-medium text-text-primary max-w-[180px] truncate">{job.session_name || 'Sans nom'}</td>
                          <td className="px-5 py-2.5 text-text-secondary">{job.user_name || <span className="text-text-disabled">—</span>}</td>
                          <td className="px-5 py-2.5 text-text-disabled whitespace-nowrap">
                            {new Date(job.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-5 py-2.5 text-right">
                            <span className="text-brand-green font-semibold">{job.completed_tasks}</span>
                            {job.failed_tasks > 0 && <span className="text-brand-red ml-1">· {job.failed_tasks} ✗</span>}
                          </td>
                          <td className="px-5 py-2.5 text-right text-text-secondary">{job.regen_count || '—'}</td>
                          <td className="px-5 py-2.5 text-right"><ErrorRateBadge rate={job.error_rate} /></td>
                          <td className="px-5 py-2.5 text-right font-semibold text-text-primary">{job.estimated_cost_eur.toFixed(2)} €</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {data?.recentJobs?.length === 0 && data?.totalGenerations === 0 && (
              <div className="text-center py-16 text-text-disabled text-sm">Aucune donnée pour cette période.</div>
            )}

            {/* Pricing reference — editable */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-[16px] border border-border p-5">
                <p className="text-sm font-semibold text-text-secondary mb-3">Référence tarifaire</p>
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={costInput}
                    onChange={(e) => setCostInput(e.target.value)}
                    className="w-24 px-3 py-1.5 rounded-[8px] text-sm border border-border bg-surface focus:outline-none focus:border-brand-green font-mono"
                  />
                  <span className="text-xs text-text-secondary">€ / image générée</span>
                  <button
                    onClick={handleSaveCost}
                    disabled={savingCost}
                    className="ml-auto px-3 py-1.5 rounded-[8px] text-xs font-semibold bg-brand-green text-white hover:bg-brand-green-hover transition-colors disabled:opacity-50"
                  >
                    {costSaved ? '✓ Sauvegardé' : savingCost ? '...' : 'Enregistrer'}
                  </button>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 text-text-secondary">Résolution</th>
                      <th className="text-right py-2 text-text-secondary">Standard</th>
                      <th className="text-right py-2 text-text-secondary">Batch (−50%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border">
                      <td className="py-2">1K (1024px)</td>
                      <td className="text-right py-2">$0.067</td>
                      <td className="text-right py-2">$0.034</td>
                    </tr>
                    <tr>
                      <td className="py-2">2K (2048px)</td>
                      <td className="text-right py-2">$0.101</td>
                      <td className="text-right py-2">$0.051</td>
                    </tr>
                  </tbody>
                </table>
                <p className="text-[10px] text-text-disabled mt-2">Tarif indicatif par image — modifiable selon le modèle utilisé</p>
              </div>

              <div className="px-5 py-4 bg-amber-50 border border-amber-200 rounded-[16px] text-xs text-amber-700 self-start">
                <p className="font-semibold mb-1">⚠ Données indicatives</p>
                <p>Ces statistiques incluent toutes les générations depuis le début (tests, développement). Pour le coût réel facturé, consultez votre tableau de bord <strong>Google AI Studio</strong>.</p>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </main>
  )
}
