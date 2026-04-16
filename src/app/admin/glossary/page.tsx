'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

type Tab = 'dictionnaire' | 'regles'

interface GlossaryTerm {
  id: string
  term_source: string
  term_target: string
  language_code: string
  created_at: string
}

interface LanguageRule {
  id: string
  language_code: string
  rule: string
  created_at: string
}

// language_code → { country code for display, flag emoji }
const LANG_META: Record<string, { country: string; flag: string }> = {
  nl: { country: 'NL', flag: '🇳🇱' },
  de: { country: 'DE', flag: '🇩🇪' },
  en: { country: 'GB', flag: '🇬🇧' },
  es: { country: 'ES', flag: '🇪🇸' },
  pt: { country: 'PT', flag: '🇵🇹' },
  it: { country: 'IT', flag: '🇮🇹' },
  cs: { country: 'CZ', flag: '🇨🇿' },
  da: { country: 'DK', flag: '🇩🇰' },
  fi: { country: 'FI', flag: '🇫🇮' },
  el: { country: 'GR', flag: '🇬🇷' },
  hr: { country: 'HR', flag: '🇭🇷' },
  hu: { country: 'HU', flag: '🇭🇺' },
  lt: { country: 'LT', flag: '🇱🇹' },
  lv: { country: 'LV', flag: '🇱🇻' },
  pl: { country: 'PL', flag: '🇵🇱' },
  ro: { country: 'RO', flag: '🇷🇴' },
  sv: { country: 'SE', flag: '🇸🇪' },
  sl: { country: 'SI', flag: '🇸🇮' },
  sk: { country: 'SK', flag: '🇸🇰' },
}

const LANGUAGES = Object.keys(LANG_META)

function LangLabel({ code }: { code: string }) {
  const meta = LANG_META[code]
  if (!meta) return <span className="text-xs text-text-disabled uppercase">{code}</span>
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`fi fi-${meta.country.toLowerCase()}`} style={{ fontSize: '12px' }} />
      <span className="text-xs font-semibold text-text-primary">{meta.country}</span>
    </span>
  )
}

export default function AdminGlossaryPage() {
  const [tab, setTab] = useState<Tab>('dictionnaire')

  // Dictionnaire state
  const [terms, setTerms] = useState<GlossaryTerm[]>([])
  const [loadingTerms, setLoadingTerms] = useState(true)
  const [newSource, setNewSource] = useState('')
  const [newTarget, setNewTarget] = useState('')
  const [newTermLang, setNewTermLang] = useState('nl')
  const [addingTerm, setAddingTerm] = useState(false)
  const [filterTermLang, setFilterTermLang] = useState<string>('all')

  // Règles state
  const [rules, setRules] = useState<LanguageRule[]>([])
  const [loadingRules, setLoadingRules] = useState(true)
  const [newRule, setNewRule] = useState('')
  const [newRuleLang, setNewRuleLang] = useState('nl')
  const [addingRule, setAddingRule] = useState(false)
  const [filterRuleLang, setFilterRuleLang] = useState<string>('all')

  const loadTerms = async () => {
    try {
      const res = await fetch('/api/admin/glossary')
      const data = await res.json()
      setTerms(data.terms || [])
    } finally {
      setLoadingTerms(false)
    }
  }

  const loadRules = async () => {
    try {
      const res = await fetch('/api/admin/rules')
      const data = await res.json()
      setRules(data.rules || [])
    } finally {
      setLoadingRules(false)
    }
  }

  useEffect(() => { loadTerms(); loadRules() }, [])

  const handleAddTerm = async () => {
    if (!newSource.trim() || !newTarget.trim()) return
    setAddingTerm(true)
    try {
      const res = await fetch('/api/admin/glossary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term_source: newSource, term_target: newTarget, language_code: newTermLang }),
      })
      if (res.ok) { setNewSource(''); setNewTarget(''); await loadTerms() }
    } finally { setAddingTerm(false) }
  }

  const handleDeleteTerm = async (id: string) => {
    await fetch(`/api/admin/glossary/${id}`, { method: 'DELETE' })
    setTerms((prev) => prev.filter((t) => t.id !== id))
  }

  const handleAddRule = async () => {
    if (!newRule.trim()) return
    setAddingRule(true)
    try {
      const res = await fetch('/api/admin/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language_code: newRuleLang, rule: newRule }),
      })
      if (res.ok) { setNewRule(''); await loadRules() }
    } finally { setAddingRule(false) }
  }

  const handleDeleteRule = async (id: string) => {
    await fetch(`/api/admin/rules/${id}`, { method: 'DELETE' })
    setRules((prev) => prev.filter((r) => r.id !== id))
  }

  const usedTermLangs = [...new Set(terms.map((t) => t.language_code))].sort()
  const filteredTerms = filterTermLang === 'all' ? terms : terms.filter((t) => t.language_code === filterTermLang)

  const usedRuleLangs = [...new Set(rules.map((r) => r.language_code))].sort()
  const filteredRules = filterRuleLang === 'all' ? rules : rules.filter((r) => r.language_code === filterRuleLang)

  return (
    <main className="min-h-screen px-8 pt-12 pb-12">
      <div className="max-w-[650px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Glossaire</h1>
            <p className="text-sm text-text-secondary">
              {terms.length} terme{terms.length !== 1 ? 's' : ''} · {rules.length} règle{rules.length !== 1 ? 's' : ''}
            </p>
          </div>
          <a href="/admin" className="text-sm text-brand-teal hover:text-brand-teal-hover">← Admin</a>
        </div>

        {/* Tabs */}
        <div className="flex border border-border rounded-full overflow-hidden w-fit mb-6">
          {(['dictionnaire', 'regles'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 text-sm font-semibold transition-colors outline-none capitalize
                ${tab === t ? 'bg-brand-green text-white' : 'bg-white text-text-secondary hover:bg-surface'}`}
            >
              {t === 'dictionnaire' ? 'Dictionnaire' : 'Règles'}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {tab === 'dictionnaire' ? (
            <motion.div key="dictionnaire" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {/* Add term */}
              <div className="bg-white rounded-[12px] shadow-sm p-5 mb-4">
                <p className="text-sm font-semibold text-text-secondary mb-3">Ajouter un terme</p>
                <div className="flex gap-2">
                  <input
                    value={newSource}
                    onChange={(e) => setNewSource(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTerm()}
                    placeholder="Terme français"
                    className="flex-1 px-3 py-2 rounded-[8px] text-sm border border-border focus:border-brand-green focus:outline-none"
                  />
                  <span className="self-center text-text-disabled">→</span>
                  <input
                    value={newTarget}
                    onChange={(e) => setNewTarget(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTerm()}
                    placeholder="Traduction préférée"
                    className="flex-1 px-3 py-2 rounded-[8px] text-sm border border-border focus:border-brand-green focus:outline-none"
                  />
                  <select
                    value={newTermLang}
                    onChange={(e) => setNewTermLang(e.target.value)}
                    className="px-2 py-2 rounded-[8px] text-sm border border-border bg-white"
                  >
                    {LANGUAGES.map((l) => <option key={l} value={l}>{LANG_META[l]?.country || l.toUpperCase()}</option>)}
                  </select>
                  <button
                    onClick={handleAddTerm}
                    disabled={!newSource.trim() || !newTarget.trim() || addingTerm}
                    className="px-4 py-2 bg-brand-green text-white font-semibold text-sm rounded-[8px] hover:bg-brand-green-hover disabled:opacity-50 transition-colors"
                  >
                    {addingTerm ? '...' : 'Ajouter'}
                  </button>
                </div>
              </div>

              {/* Filter pills */}
              {usedTermLangs.length > 1 && (
                <div className="flex gap-1 flex-wrap mb-3">
                  <button onClick={() => setFilterTermLang('all')} className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${filterTermLang === 'all' ? 'bg-brand-teal text-white' : 'bg-surface text-text-secondary hover:bg-border'}`}>Tous</button>
                  {usedTermLangs.map((l) => (
                    <button key={l} onClick={() => setFilterTermLang(l)} className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${filterTermLang === l ? 'bg-brand-teal text-white' : 'bg-surface text-text-secondary hover:bg-border'}`}><LangLabel code={l} /></button>
                  ))}
                </div>
              )}

              {/* Term list */}
              {loadingTerms ? (
                <p className="text-center text-sm text-text-secondary py-8">Chargement...</p>
              ) : filteredTerms.length > 0 ? (
                <div className="bg-white rounded-[12px] shadow-sm overflow-hidden">
                  <AnimatePresence>
                    {filteredTerms.map((term) => (
                      <motion.div key={term.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
                        className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-surface">
                        <span className="text-sm font-medium text-text-primary flex-1">{term.term_source}</span>
                        <span className="text-text-disabled text-xs">→</span>
                        <span className="text-sm text-text-primary flex-1">{term.term_target}</span>
                        <LangLabel code={term.language_code} />
                        <button onClick={() => handleDeleteTerm(term.id)} className="text-text-disabled hover:text-brand-red transition-colors text-lg leading-none">×</button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="text-center py-8 text-text-disabled text-sm">
                  {terms.length === 0 ? 'Aucun terme.' : 'Aucun terme pour cette langue.'}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div key="regles" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {/* Add rule */}
              <div className="bg-white rounded-[12px] shadow-sm p-5 mb-4">
                <p className="text-sm font-semibold text-text-secondary mb-1">Ajouter une règle</p>
                <p className="text-xs text-text-disabled mb-3">Décrivez une convention de style ou d&apos;usage propre à cette langue en contexte publicitaire.</p>
                <div className="flex gap-2 mb-2">
                  <select
                    value={newRuleLang}
                    onChange={(e) => setNewRuleLang(e.target.value)}
                    className="px-2 py-2 rounded-[8px] text-sm border border-border bg-white"
                  >
                    {LANGUAGES.map((l) => <option key={l} value={l}>{LANG_META[l]?.country || l.toUpperCase()}</option>)}
                  </select>
                  <input
                    value={newRule}
                    onChange={(e) => setNewRule(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddRule()}
                    placeholder="Ex : Ne jamais mettre de signe - devant un pourcentage de réduction"
                    className="flex-1 px-3 py-2 rounded-[8px] text-sm border border-border focus:border-brand-green focus:outline-none"
                  />
                  <button
                    onClick={handleAddRule}
                    disabled={!newRule.trim() || addingRule}
                    className="px-4 py-2 bg-brand-green text-white font-semibold text-sm rounded-[8px] hover:bg-brand-green-hover disabled:opacity-50 transition-colors"
                  >
                    {addingRule ? '...' : 'Ajouter'}
                  </button>
                </div>
              </div>

              {/* Filter pills */}
              {usedRuleLangs.length > 1 && (
                <div className="flex gap-1 flex-wrap mb-3">
                  <button onClick={() => setFilterRuleLang('all')} className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${filterRuleLang === 'all' ? 'bg-brand-teal text-white' : 'bg-surface text-text-secondary hover:bg-border'}`}>Toutes</button>
                  {usedRuleLangs.map((l) => (
                    <button key={l} onClick={() => setFilterRuleLang(l)} className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${filterRuleLang === l ? 'bg-brand-teal text-white' : 'bg-surface text-text-secondary hover:bg-border'}`}><LangLabel code={l} /></button>
                  ))}
                </div>
              )}

              {/* Rule list */}
              {loadingRules ? (
                <p className="text-center text-sm text-text-secondary py-8">Chargement...</p>
              ) : filteredRules.length > 0 ? (
                <div className="bg-white rounded-[12px] shadow-sm overflow-hidden">
                  <AnimatePresence>
                    {filteredRules.map((rule) => (
                      <motion.div key={rule.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
                        className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-surface">
                        <LangLabel code={rule.language_code} />
                        <span className="text-sm text-text-primary flex-1">{rule.rule}</span>
                        <button onClick={() => handleDeleteRule(rule.id)} className="text-text-disabled hover:text-brand-red transition-colors text-lg leading-none mt-0.5">×</button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="text-center py-8 text-text-disabled text-sm">
                  {rules.length === 0 ? 'Aucune règle. Ajoutez des conventions de style par langue.' : 'Aucune règle pour cette langue.'}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  )
}
