'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const VERSION = '0.3.0'

type Tab = 'pipeline' | 'strategies' | 'roadmap'

const PIPELINE_CLASSIC = [
  { icon: '🖼️', color: 'bg-blue-50 border-blue-200', label: 'Images source', desc: 'Visuels français uploadés (tous formats)' },
  { icon: '⚙️', color: 'bg-slate-50 border-slate-200', label: 'Configuration', desc: 'Pays cibles, méthode, résolution' },
  { icon: '🤖', color: 'bg-brand-green-light border-brand-green', label: 'Génération NB2', desc: 'Image FR + prompt natif → image traduite · gemini-3.1-flash-image-preview' },
  { icon: '🔍', color: 'bg-amber-50 border-amber-200', label: 'Vérification', desc: 'Score 0–5 par visuel · gemini-3.1-pro-preview' },
  { icon: '📦', color: 'bg-purple-50 border-purple-200', label: 'Export', desc: 'Images + traductions.json' },
]

const PIPELINE_PRECISION = [
  { icon: '🖼️', color: 'bg-blue-50 border-blue-200', label: 'Images source', desc: 'Visuels français uploadés (tous formats)' },
  { icon: '⚙️', color: 'bg-slate-50 border-slate-200', label: 'Configuration', desc: 'Pays cibles, méthode Précision, résolution' },
  { icon: '👁️', color: 'bg-purple-50 border-purple-200', label: 'Pré-analyse', desc: 'Filtre les hints pertinents du glossaire · gemini-3.1-flash-lite-preview', highlight: true },
  { icon: '🤖', color: 'bg-brand-green-light border-brand-green', label: 'Génération NB2', desc: 'Image FR + prompt natif + hints contextuels → image traduite' },
  { icon: '🔍', color: 'bg-amber-50 border-amber-200', label: 'Vérification', desc: 'Score 0–5 par visuel · gemini-3.1-pro-preview' },
  { icon: '📦', color: 'bg-purple-50 border-purple-200', label: 'Export', desc: 'Images + traductions.json' },
]

const PIPELINE_GOOGLE = [
  { icon: '🖼️', color: 'bg-blue-50 border-blue-200', label: 'Images source', desc: 'Visuels français (1 représentatif utilisé pour extraction)' },
  { icon: '⚙️', color: 'bg-slate-50 border-slate-200', label: 'Configuration', desc: 'Pays cibles, méthode Natif, résolution' },
  { icon: '🔎', color: 'bg-orange-50 border-orange-200', label: 'Extraction', desc: 'Tout le texte FR extrait depuis le 1080×1080 · gemini-3.1-flash-lite-preview', highlight: true },
  { icon: '🌐', color: 'bg-blue-50 border-blue-200', label: 'Traduction', desc: 'Zones traduites vers toutes les langues en 1 appel · gemini-3.1-pro-preview', highlight: true },
  { icon: '📝', color: 'bg-amber-50 border-amber-200', label: 'Review textes', desc: 'Optionnel (mode pre_render) — édition manuelle + vérif LLM avant génération', highlight: false },
  { icon: '🤖', color: 'bg-brand-green-light border-brand-green', label: 'Génération NB2', desc: 'Image FR + textes pré-traduits entre guillemets → image traduite' },
  { icon: '🔍', color: 'bg-amber-50 border-amber-200', label: 'Vérif visuels', desc: 'Score 0–5 par visuel · gemini-3.1-pro-preview (optionnel)' },
  { icon: '📦', color: 'bg-purple-50 border-purple-200', label: 'Export', desc: 'Images + traductions.json' },
]

const STRATEGIES = [
  {
    id: 'Option 1',
    name: 'Remplacement direct',
    badge: 'Testé — abandonné',
    badgeColor: 'bg-red-100 text-red-600',
    summary: 'On demande à NB2 de remplacer "X" par "Y" dans l\'image.',
    pros: ['Texte 100% contrôlé', 'Cohérence parfaite entre formats'],
    cons: [
      'NB2 n\'est pas un éditeur chirurgical — il reconstruit les zones autour du texte',
      'Dégradation visuelle confirmée en test : polices changées, layout perturbé',
      '4 visuels testés : 1 propre, 2 corrects, 1 dégradé — résultat inacceptable',
    ],
    verdict: 'Abandonné. La qualité visuelle dégradée ne justifie pas le contrôle textuel.',
    verdictColor: 'text-red-500',
  },
  {
    id: 'Option 2',
    name: 'Génération libre guidée',
    badge: 'Mode Classique',
    badgeColor: 'bg-brand-green-light text-brand-green',
    summary: 'NB2 reçoit l\'image source + un prompt marketing natif. Il traduit et adapte librement.',
    pros: [
      'Qualité visuelle maximale',
      'Prompt marketing natif : copywriter, pas traducteur',
      'Rapide et économique',
    ],
    cons: [
      'Aucune garantie sur les termes exacts',
      'Variabilité résiduelle entre runs (LLM non-déterministe)',
    ],
    verdict: 'Mode principal. Idéal pour des visuels simples sans contrainte de terminologie stricte.',
    verdictColor: 'text-brand-green',
  },
  {
    id: 'Option 3',
    name: 'Guidage contextuel',
    badge: 'Mode Précision — désactivé',
    badgeColor: 'bg-purple-100 text-purple-400',
    summary: 'Un Vision LLM filtre le dictionnaire par image et injecte des hints contextuels dans le prompt de génération.',
    pros: [
      'Hints ciblés sur le contenu réel de l\'image — pas de bruit',
      'Qualité visuelle préservée',
      'Glossaire peut grossir sans alourdir les prompts',
    ],
    cons: [
      'Dépend de la richesse du dictionnaire',
      'Temporairement désactivé — en cours d\'évaluation',
    ],
    verdict: 'En attente de validation. Complément potentiel au mode Classique.',
    verdictColor: 'text-purple-400',
  },
  {
    id: 'Option 4',
    name: 'Text-first (recommandé Google)',
    badge: 'Mode Natif',
    badgeColor: 'bg-orange-100 text-orange-700',
    summary: 'Un LLM texte extrait et traduit tous les textes en amont. NB2 reçoit les traductions finales entre guillemets explicites.',
    pros: [
      'Traduction contrôlée par un modèle texte dédié (gemini-3.1-pro-preview)',
      'Cohérence garantie entre tous les formats du même job',
      'Extraction + traduction faites une seule fois par job — pas par image',
      'Coût mesuré : ~0,065 €/image (vérification incluse)',
    ],
    cons: [
      '2 appels LLM supplémentaires avant la génération',
      'Si l\'extraction échoue, fallback sur le mode Classique',
    ],
    verdict: 'Mode recommandé pour les campagnes multi-langues avec textes complexes. ~78 € pour 1 200 images.',
    verdictColor: 'text-orange-600',
  },
]

const ROADMAP = [
  {
    status: 'done',
    label: 'Fait',
    color: 'bg-brand-green-light text-brand-green',
    items: [
      'Génération parallèle (CONCURRENCY=20, 95 RPM)',
      'Versionnage des régénérations',
      'Dictionnaire de termes + Règles de style par langue',
      'Prompt marketing natif (copywriter, pas traducteur)',
      'Panel admin : config API, usage, pays, prompts, logs',
      'Reprise de session',
      'Vérification LLM auto (score 0–5, verdict VALIDE/LIMITE/À CORRIGER)',
      'Mode Natif : text-first, extraction + traduction en amont, ~0,065 €/image',
      'Cohérence inter-formats : 1 seule extraction par job',
      'Laboratoire de modèles : tester extraction + traduction avec n\'importe quel modèle Gemini',
      'Repartir de l\'image source FR lors d\'une régénération (hallucinations visuelles)',
      'Prompts configurables par mode depuis l\'admin',
      'Logs : zones extraites + traductions visibles par job',
      'Vérification textuelle pré-génération (mode pre_render) — édition manuelle + LLM + correction IA par langue',
      'Pipeline configurable : vérification avant ou après la génération d\'images',
      'Propriétés typographiques dans l\'extraction (weight, case, color, size) — injectées dans le prompt NB2',
    ],
  },
  {
    status: 'soon',
    label: 'Priorité',
    color: 'bg-amber-100 text-amber-700',
    items: [
      'Export Google Drive',
      'Export Google Drive',
      'Valider le mode Précision et le réactiver',
    ],
  },
  {
    status: 'later',
    label: 'V2',
    color: 'bg-surface text-text-secondary',
    items: [
      'Gestion des polices branded',
      'Batch API Gemini (−50% coût)',
    ],
  },
]

const TABS: { id: Tab; label: string }[] = [
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'strategies', label: 'Stratégies' },
  { id: 'roadmap', label: 'Roadmap' },
]

export default function AdminDocPage() {
  const [tab, setTab] = useState<Tab>('pipeline')

  return (
    <main className="min-h-screen px-8 pt-12 pb-16">
      <div className="max-w-[750px] mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Documentation</h1>
            <p className="text-xs text-text-disabled mt-0.5">HoorTRAD v{VERSION} · Gemini NB2 (gemini-3.1-flash-image-preview)</p>
          </div>
          <a href="/admin" className="text-sm text-brand-teal hover:text-brand-teal-hover">← Admin</a>
        </div>

        {/* Tabs */}
        <div className="flex border border-border rounded-full overflow-hidden w-fit mb-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-2 text-sm font-semibold transition-colors outline-none
                ${tab === t.id ? 'bg-brand-green text-white' : 'bg-white text-text-secondary hover:bg-surface'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">

          {/* Pipeline tab */}
          {tab === 'pipeline' && (
            <motion.div key="pipeline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">

              {/* Classic */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-[12px] shadow-sm p-5">
                <div className="flex items-center gap-2 mb-5">
                  <span className="font-bold text-sm text-text-primary">Mode Classique</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-green-light text-brand-green">Recommandé</span>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {PIPELINE_CLASSIC.map((step, i) => (
                    <div key={step.label} className="flex items-center gap-1">
                      <div className={`border rounded-[8px] p-3 w-[130px] ${step.color}`}>
                        <div className="text-xl mb-1">{step.icon}</div>
                        <div className="text-xs font-bold text-text-primary leading-tight mb-0.5">{step.label}</div>
                        <div className="text-[10px] text-text-secondary leading-tight">{step.desc}</div>
                      </div>
                      {i < PIPELINE_CLASSIC.length - 1 && (
                        <span className="text-text-disabled font-bold text-sm">→</span>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Precision */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="bg-white rounded-[12px] shadow-sm p-5 opacity-50">
                <div className="flex items-center gap-2 mb-5">
                  <span className="font-bold text-sm text-text-primary">Mode Précision</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-400">Désactivé</span>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {PIPELINE_PRECISION.map((step, i) => (
                    <div key={step.label} className="flex items-center gap-1">
                      <div className={`border rounded-[8px] p-3 w-[130px] ${step.color}`}>
                        <div className="text-xl mb-1">{step.icon}</div>
                        <div className="text-xs font-bold text-text-primary leading-tight mb-0.5">{step.label}</div>
                        <div className="text-[10px] text-text-secondary leading-tight">{step.desc}</div>
                      </div>
                      {i < PIPELINE_PRECISION.length - 1 && (
                        <span className="text-text-disabled font-bold text-sm">→</span>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Natif */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="bg-white rounded-[12px] shadow-sm p-5">
                <div className="flex items-center gap-2 mb-5">
                  <span className="font-bold text-sm text-text-primary">Mode Natif</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">Recommandé Google</span>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {PIPELINE_GOOGLE.map((step, i) => (
                    <div key={step.label} className="flex items-center gap-1">
                      <div className={`border rounded-[8px] p-3 w-[130px] ${step.color} ${step.highlight ? 'ring-2 ring-orange-300' : ''}`}>
                        <div className="text-xl mb-1">{step.icon}</div>
                        <div className="text-xs font-bold text-text-primary leading-tight mb-0.5">{step.label}</div>
                        <div className="text-[10px] text-text-secondary leading-tight">{step.desc}</div>
                        {(step as { cost?: string }).cost && (
                          <div className="text-[10px] font-bold text-orange-600 mt-1">{(step as { cost?: string }).cost}</div>
                        )}
                      </div>
                      {i < PIPELINE_GOOGLE.length - 1 && (
                        <span className="text-text-disabled font-bold text-sm">→</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-3 pl-1 space-y-0.5">
                  <p className="text-[10px] text-text-disabled">Extraction + traduction : 1 seul appel par job (partagé entre tous les formats)</p>
                  <p className="text-[10px] font-semibold text-orange-600">Coût total mesuré : ~0,065 €/image · ~78 € pour 1 200 images (vérification incluse)</p>
                </div>
              </motion.div>

            </motion.div>
          )}

          {/* Strategies tab */}
          {tab === 'strategies' && (
            <motion.div key="strategies" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="space-y-4">
                {STRATEGIES.map((s, i) => (
                  <motion.div key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                    className="bg-white rounded-[12px] shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-text-disabled">{s.id}</span>
                      <span className="font-bold text-sm text-text-primary">{s.name}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.badgeColor}`}>{s.badge}</span>
                    </div>
                    <p className="text-xs text-text-secondary mb-3 italic">{s.summary}</p>
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div>
                        <p className="text-[10px] font-bold text-brand-green uppercase mb-1.5">Avantages</p>
                        <ul className="space-y-1">
                          {s.pros.map((p) => <li key={p} className="text-xs text-text-primary flex items-start gap-1.5"><span className="text-brand-green shrink-0 mt-0.5">+</span>{p}</li>)}
                        </ul>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-brand-red uppercase mb-1.5">Inconvénients</p>
                        <ul className="space-y-1">
                          {s.cons.map((c) => <li key={c} className="text-xs text-text-primary flex items-start gap-1.5"><span className="text-brand-red shrink-0 mt-0.5">−</span>{c}</li>)}
                        </ul>
                      </div>
                    </div>
                    <div className="border-t border-border pt-2">
                      <p className={`text-xs font-semibold ${s.verdictColor}`}>→ {s.verdict}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Roadmap tab */}
          {tab === 'roadmap' && (
            <motion.div key="roadmap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="space-y-3">
                {ROADMAP.map((group, i) => (
                  <motion.div key={group.status} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                    className="bg-white rounded-[12px] shadow-sm p-5">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${group.color} inline-block mb-3`}>{group.label}</span>
                    <ul className="space-y-1.5">
                      {group.items.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm text-text-primary">
                          <span className="mt-0.5 shrink-0 text-text-disabled">
                            {group.status === 'done' ? '✓' : group.status === 'soon' ? '→' : '·'}
                          </span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </main>
  )
}
