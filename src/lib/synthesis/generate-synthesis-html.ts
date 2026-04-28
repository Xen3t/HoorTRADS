import type Database from 'better-sqlite3'
import { inferProvider } from '@/lib/provider-utils'

interface JobRow {
  id: string
  session_id: string
  status: string
  config: string
  created_at: string
  updated_at: string
  total_tasks: number
  completed_tasks: number
  failed_tasks: number
}

interface SessionRow {
  id: string
  name: string
  user_id: string | null
}

interface UserRow {
  name: string
  email: string
}

interface TaskRow {
  id: string
  source_image_name: string
  target_language: string
  country_code: string
  status: string
  output_path: string | null
  error_message: string | null
  prompt_sent: string | null
  verification_status: string | null
  created_at: string
}

interface TaskVersionRow {
  id: string
  task_id: string
  prompt_sent: string | null
  regen_label: string | null
  created_at: string
}

const PROVIDER_LABEL: Record<string, string> = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  mixed: 'Mixte',
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || isNaN(ms) || ms < 0) return '—'
  const totalSec = Math.round(ms / 1000)
  if (totalSec === 0) return '< 1s'
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  if (m === 0) return `${s}s`
  if (m < 60) return `${m}'${String(s).padStart(2, '0')}"`
  const h = Math.floor(m / 60)
  return `${h}h${String(m % 60).padStart(2, '0')}'`
}

function formatDateTime(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// CSS identique pour tous les rapports
const CSS = `:root { --green:#2EB872; --green-light:#E8F7F0; --teal:#19A7CE; --teal-light:#E1F4FA; --red:#E15554; --red-light:#FCEBEB; --amber:#F59E0B; --amber-light:#FEF3C7; --bg:#F8F9FA; --surface:#F2F4F6; --border:#E4E7EA; --text-primary:#1F2937; --text-secondary:#6B7280; --text-disabled:#9CA3AF; --blue:#3B82F6; --blue-light:#DBEAFE; --purple:#8B5CF6; --emerald:#10B981; --emerald-light:#D1FAE5; }
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Titillium Web',-apple-system,BlinkMacSystemFont,system-ui,sans-serif; background:var(--bg); color:var(--text-primary); font-size:14px; line-height:1.5; }
.container { max-width:1100px; margin:0 auto; padding:36px 24px 60px; }
.report-header { background:white; border:1px solid var(--border); border-radius:14px; padding:24px 28px; margin-bottom:24px; display:flex; justify-content:space-between; align-items:center; gap:24px; }
.report-header h1 { font-size:24px; font-weight:700; line-height:1.2; }
.report-header .subtitle { display:flex; flex-wrap:wrap; gap:14px; margin-top:8px; font-size:13px; color:var(--text-secondary); }
.report-header .subtitle .item { display:inline-flex; align-items:center; gap:5px; }
.report-header .stamp { text-align:right; flex-shrink:0; }
.report-header .stamp .label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-disabled); margin-bottom:4px; }
.report-header .stamp .date { font-size:13px; font-weight:600; color:var(--text-primary); font-family:'JetBrains Mono',monospace; }
.status-badge { display:inline-block; font-size:11px; font-weight:700; padding:4px 10px; border-radius:999px; margin-left:8px; vertical-align:middle; }
.status-done { background:var(--green-light); color:var(--green); }
.kpi-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; margin-bottom:24px; }
.kpi { background:white; border-radius:12px; padding:18px; border:1px solid var(--border); }
.kpi-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-disabled); margin-bottom:8px; }
.kpi-value { font-size:30px; font-weight:700; line-height:1; }
.kpi-sub { font-size:11px; color:var(--text-secondary); margin-top:6px; }
.kpi-icon { float:right; font-size:20px; opacity:0.4; }
.kpi.alert .kpi-value { color:var(--red); }
.kpi.success .kpi-value { color:var(--green); }
.kpi.warning .kpi-value { color:var(--amber); }
.section { background:white; border-radius:12px; border:1px solid var(--border); margin-bottom:20px; }
.section-header { padding:14px 18px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; }
.section-header h2 { font-size:14px; font-weight:700; }
.section-header .meta { font-size:11px; color:var(--text-disabled); }
.section-body { padding:18px; }
.models-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; }
.model-card { display:flex; align-items:center; gap:12px; padding:12px 14px; background:var(--surface); border-radius:10px; }
.model-icon { width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:16px; flex-shrink:0; }
.model-icon.extract { background:var(--blue-light); }
.model-icon.translate { background:var(--teal-light); }
.model-icon.image { background:var(--green-light); }
.model-icon.verify { background:var(--amber-light); }
.model-info { flex:1; min-width:0; }
.model-step { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-disabled); }
.model-name { font-size:13px; font-weight:600; font-family:'JetBrains Mono',monospace; color:var(--text-primary); margin-top:2px; word-break:break-all; }
.model-provider { display:inline-block; font-size:9px; font-weight:700; padding:2px 6px; border-radius:999px; margin-left:6px; vertical-align:middle; }
.provider-gemini { background:var(--blue-light); color:#1E40AF; }
.provider-openai { background:var(--emerald-light); color:#065F46; }
.provider-mixed { background:var(--amber-light); color:#92400E; }
.model-stats { font-size:10px; color:var(--text-secondary); margin-top:4px; }
.quality-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; }
.quality-card { padding:14px; border-radius:10px; border:1px solid var(--border); }
.quality-card .label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-disabled); margin-bottom:4px; }
.quality-card .value { font-size:22px; font-weight:700; }
.quality-card .desc { font-size:11px; color:var(--text-secondary); margin-top:4px; }
.quality-card .progress { height:4px; background:var(--surface); border-radius:999px; margin-top:10px; overflow:hidden; }
.quality-card .progress-fill { height:100%; background:var(--green); border-radius:999px; }
.success-rate-bar { display:flex; align-items:center; gap:10px; padding:10px 14px; background:var(--surface); border-radius:10px; margin-bottom:14px; }
.success-rate-bar .label { font-size:12px; font-weight:600; flex-shrink:0; min-width:110px; }
.success-rate-bar .bar { flex:1; height:10px; background:white; border-radius:999px; overflow:hidden; display:flex; }
.success-rate-bar .bar .ok { background:var(--green); }
.success-rate-bar .bar .ko { background:var(--red); }
.success-rate-bar .pct { font-size:12px; font-weight:700; min-width:50px; text-align:right; }
.failures-table, .regen-table { width:100%; }
.failures-table thead th, .regen-table thead th { text-align:left; padding:10px 12px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-disabled); border-bottom:1px solid var(--border); }
.failures-table tbody td, .regen-table tbody td { padding:10px 12px; font-size:12px; border-bottom:1px solid var(--border); vertical-align:top; }
.failures-table tbody tr:last-child td, .regen-table tbody tr:last-child td { border-bottom:none; }
.failures-table .file-name, .regen-table .file-name { font-family:'JetBrains Mono',monospace; font-size:11px; }
.lang-tag { display:inline-block; font-weight:700; font-size:11px; padding:2px 6px; border-radius:4px; background:var(--surface); }
.failures-table .err-msg { color:var(--red); font-family:'JetBrains Mono',monospace; font-size:11px; word-break:break-word; }
.regen-tag { display:inline-block; font-size:10px; font-weight:700; padding:2px 7px; border-radius:999px; }
.regen-source { background:var(--blue-light); color:#1E40AF; }
.regen-corr { background:var(--amber-light); color:#92400E; }
.regen-prompt { font-size:11px; color:var(--text-secondary); font-style:italic; margin-top:2px; }
.empty-row td { text-align:center; color:var(--text-disabled); padding:20px; font-style:italic; }
.zones-list { display:flex; flex-direction:column; gap:6px; }
.zone-row { display:flex; gap:10px; padding:8px 12px; background:var(--surface); border-radius:8px; align-items:center; }
.zone-label { font-family:'JetBrains Mono',monospace; font-size:11px; color:var(--text-disabled); width:140px; flex-shrink:0; }
.zone-text { flex:1; font-size:13px; color:var(--text-primary); font-weight:500; }
.zone-meta { font-size:10px; color:var(--text-disabled); font-family:'JetBrains Mono',monospace; flex-shrink:0; }
.translations-block { display:flex; flex-direction:column; gap:14px; }
.lang-block { background:var(--surface); border-radius:10px; padding:12px 14px; }
.lang-header { display:flex; align-items:center; gap:8px; margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid var(--border); }
.lang-header .flag { font-weight:700; font-size:11px; color:var(--teal); text-transform:uppercase; letter-spacing:0.06em; padding:3px 8px; background:var(--teal-light); border-radius:999px; }
.lang-header .count { font-size:11px; color:var(--text-disabled); }
.trans-table { display:flex; flex-direction:column; gap:2px; }
.trans-header-row { display:grid; grid-template-columns:130px 1fr 1fr 1fr; gap:10px; padding:6px 0; border-bottom:1px solid var(--border); margin-bottom:4px; }
.trans-row { display:grid; grid-template-columns:130px 1fr 1fr 1fr; gap:10px; padding:6px 0; align-items:start; font-size:12px; }
.trans-row.edited { background:#FFFBEB; border-radius:6px; padding:6px 8px; margin:0 -8px; }
.trans-key { font-family:'JetBrains Mono',monospace; color:var(--text-disabled); font-size:11px; }
.trans-cell { color:var(--text-primary); word-break:break-word; }
.trans-source { color:var(--text-secondary); font-style:italic; }
.trans-ai { color:var(--text-secondary); }
.trans-approved { color:var(--text-primary); font-weight:600; }
.edited-badge { display:inline-block; margin-left:6px; font-size:9px; font-weight:700; padding:1px 5px; border-radius:999px; background:var(--amber-light); color:#92400E; vertical-align:middle; }
.footer { text-align:center; margin-top:32px; font-size:11px; color:var(--text-disabled); }
.footer code { font-family:'JetBrains Mono',monospace; padding:1px 5px; background:var(--surface); border-radius:4px; }`

// Fonctions de rendu côté client (injectées telles quelles dans le HTML)
const RENDER_JS = `
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderHeader() {
  const pBg  = D.provider === 'OpenAI' ? '#D1FAE5' : D.provider === 'Mixte' ? '#FEF3C7' : '#DBEAFE';
  const pCol = D.provider === 'OpenAI' ? '#065F46'  : D.provider === 'Mixte' ? '#92400E'  : '#1E40AF';
  const pBadge = D.provider
    ? '<span class="item"><span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:999px;background:' + pBg + ';color:' + pCol + '">' + esc(D.provider) + '</span></span>'
    : '';
  return '<div class="report-header"><div><h1>' + esc(D.title) + '<span class="status-badge status-done">Exporté</span></h1><div class="subtitle"><span class="item">👤 ' + esc(D.user) + '</span><span class="item">📅 ' + esc(D.date) + '</span><span class="item">🌍 ' + esc(D.langues) + '</span><span class="item">🖼️ ' + esc(D.visuels) + '</span>' + pBadge + '</div></div><div class="stamp"><div class="label">Synthèse générée</div><div class="date">' + esc(D.synthesisDate) + '</div></div></div>';
}

function renderKpis() {
  var k = D.kpis;
  var failPct = k.images > 0 ? ((k.failures / k.images) * 100).toFixed(1) : '0.0';
  var costKpi = D.cost != null ? '<div class="kpi"><span class="kpi-icon">💶</span><div class="kpi-label">Coût estimé</div><div class="kpi-value" style="font-size:22px">' + esc(D.cost) + '</div><div class="kpi-sub">APIs image + texte</div></div>' : '';
  return '<div class="kpi-grid"><div class="kpi"><span class="kpi-icon">🖼️</span><div class="kpi-label">Images générées</div><div class="kpi-value">' + k.images + '</div><div class="kpi-sub">sur ' + k.imagesDemandees + ' demandées</div></div><div class="kpi ' + (k.failures > 0 ? 'alert' : '') + '"><span class="kpi-icon">⚠</span><div class="kpi-label">Échecs</div><div class="kpi-value">' + k.failures + '</div><div class="kpi-sub">' + failPct + '% du total</div></div><div class="kpi ' + (k.regenSource > 0 ? 'warning' : '') + '"><span class="kpi-icon">⟳</span><div class="kpi-label">Regen depuis source</div><div class="kpi-value">' + k.regenSource + '</div><div class="kpi-sub">retry sans modif</div></div><div class="kpi ' + (k.regenCorr > 0 ? 'warning' : '') + '"><span class="kpi-icon">✏️</span><div class="kpi-label">Regen correctives</div><div class="kpi-value">' + k.regenCorr + '</div><div class="kpi-sub">avec prompt utilisateur</div></div><div class="kpi success"><span class="kpi-icon">⏱</span><div class="kpi-label">Durée totale</div><div class="kpi-value">' + esc(k.duree) + '</div><div class="kpi-sub">création → export</div></div>' + costKpi + '</div>';
}

function renderModels() {
  var cards = D.models.map(function(m) {
    var pCls   = m.provider === 'gemini' ? 'provider-gemini' : m.provider === 'openai' ? 'provider-openai' : 'provider-mixed';
    var pLabel = m.provider === 'gemini' ? 'Gemini' : m.provider === 'openai' ? 'OpenAI' : esc(m.provider);
    return '<div class="model-card"><div class="model-icon ' + m.cls + '">' + m.icon + '</div><div class="model-info"><div class="model-step">' + esc(m.role) + '</div><div class="model-name">' + esc(m.name) + ' <span class="model-provider ' + pCls + '">' + pLabel + '</span></div><div class="model-stats">' + esc(m.stats) + '</div></div></div>';
  }).join('');
  return '<div class="section"><div class="section-header"><h2>🧠 Modèles utilisés</h2><span class="meta">Configuration au moment de la session</span></div><div class="section-body"><div class="models-grid">' + cards + '</div></div></div>';
}


function renderQuality() {
  var q = D.quality;
  var scoreVal  = q.avgScore !== null ? Number(q.avgScore).toFixed(1) + '<span style="font-size:14px;color:var(--text-secondary);font-weight:400;">/' + q.avgScoreMax + '</span>' : '—';
  var scoreDesc = q.avgScore !== null ? 'vérification visuelle automatique' : 'aucune vérification';
  var scorePct  = q.avgScore !== null ? (q.avgScore / q.avgScoreMax * 100).toFixed(0) : 0;
  var iterVal   = q.avgIterations ? Number(q.avgIterations).toFixed(2) : '—';
  return '<div class="section"><div class="section-header"><h2>📊 Qualité de la génération</h2><span class="meta">' + q.firstPassTotal + ' images analysées</span></div><div class="section-body"><div class="success-rate-bar"><span class="label">Taux de succès</span><div class="bar"><div class="ok" style="width:' + q.successRate.toFixed(1) + '%"></div><div class="ko" style="width:' + (100 - q.successRate).toFixed(1) + '%"></div></div><span class="pct">' + q.successRate.toFixed(1) + '%</span></div><div class="quality-grid"><div class="quality-card"><div class="label">Score moyen</div><div class="value">' + scoreVal + '</div><div class="desc">' + scoreDesc + '</div><div class="progress"><div class="progress-fill" style="width:' + scorePct + '%"></div></div></div><div class="quality-card"><div class="label">Validés du 1er coup</div><div class="value">' + q.firstPass + '<span style="font-size:14px;color:var(--text-secondary);font-weight:400;">/' + q.firstPassTotal + '</span></div><div class="desc">' + q.firstPassRate.toFixed(1) + '% sans régénération</div><div class="progress"><div class="progress-fill" style="width:' + q.firstPassRate.toFixed(1) + '%"></div></div></div><div class="quality-card"><div class="label">Itérations moyennes</div><div class="value">' + iterVal + '</div><div class="desc">incl. regen src + correctives</div><div class="progress"><div class="progress-fill" style="width:' + q.iterPct.toFixed(1) + '%; background:var(--amber)"></div></div></div></div></div></div>';
}

function renderZones() {
  if (!D.zones || D.zones.length === 0) return '';
  var rows = D.zones.map(function(z) { return '<div class="zone-row"><span class="zone-label">' + esc(z.key) + '</span><span class="zone-text">' + esc(z.text) + '</span>' + (z.meta ? '<span class="zone-meta">' + esc(z.meta) + '</span>' : '') + '</div>'; }).join('');
  return '<div class="section"><div class="section-header"><h2>🔎 Zones extraites (' + D.zones.length + ')</h2><span class="meta">texte source français · propriétés typographiques</span></div><div class="section-body"><div class="zones-list">' + rows + '</div></div></div>';
}

function renderDocHints() {
  var hints = D.configDocHints;
  if (!hints || Object.keys(hints).length === 0) return '';
  var count = Object.keys(hints).length;
  var blocks = Object.entries(hints).map(function(e) { return '<div class="lang-block"><div class="lang-header"><span class="flag">' + esc(e[0].toUpperCase()) + '</span></div><div style="font-size:12px;color:var(--text-secondary);white-space:pre-wrap;">' + esc(e[1]) + '</div></div>'; }).join('');
  return '<div class="section"><div class="section-header"><h2>📄 Doc config filtré par langue</h2><span class="meta">' + count + ' langue' + (count > 1 ? 's' : '') + '</span></div><div class="section-body"><div class="translations-block">' + blocks + '</div></div></div>';
}

function renderTranslations() {
  var langs = Object.keys(D.translations);
  if (langs.length === 0) return '';
  var totalEdited = langs.reduce(function(s, l) { return s + D.translations[l].filter(function(t) { return t.edited; }).length; }, 0);
  var h2 = totalEdited > 0
    ? '🌐 Traductions (' + langs.length + ' langue' + (langs.length > 1 ? 's' : '') + ' · ' + totalEdited + ' édition' + (totalEdited > 1 ? 's' : '') + ' utilisateur)'
    : '🌐 Traductions (' + langs.length + ' langue' + (langs.length > 1 ? 's' : '') + ')';
  var colHdr = '<div class="trans-header-row"><div class="trans-key" style="font-size:9px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-disabled);font-weight:700">Zone</div><div class="trans-cell" style="font-size:9px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-disabled);font-weight:700">Source FR</div><div class="trans-cell" style="font-size:9px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-disabled);font-weight:700">Traduction IA</div><div class="trans-cell" style="font-size:9px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-disabled);font-weight:700">Validée</div></div>';
  var blocks = langs.map(function(lang) {
    var zones = D.translations[lang];
    var editedCount = zones.filter(function(t) { return t.edited; }).length;
    var editedLabel = editedCount > 0 ? '<span style="color:var(--amber);font-weight:700">' + editedCount + ' modifié' + (editedCount > 1 ? 's' : '') + '</span>' : '';
    var rows = zones.map(function(t) {
      var aiHtml = t.ai ? esc(t.ai) : '<span style="color:var(--text-disabled)">—</span>';
      var apprHtml = t.approved ? esc(t.approved) : '<span style="color:var(--text-disabled)">—</span>';
      return '<div class="trans-row' + (t.edited ? ' edited' : '') + '"><div class="trans-key">' + esc(t.key) + '</div><div class="trans-cell trans-source">' + esc(t.source) + '</div><div class="trans-cell trans-ai">' + aiHtml + '</div><div class="trans-cell trans-approved">' + apprHtml + (t.edited ? '<span class="edited-badge">modifié</span>' : '') + '</div></div>';
    }).join('');
    return '<div class="lang-block"><div class="lang-header"><span class="flag">' + esc(lang.toUpperCase()) + '</span><span class="count">' + zones.length + ' zone' + (zones.length > 1 ? 's' : '') + (editedLabel ? ' · ' + editedLabel : '') + '</span></div><div class="trans-table">' + colHdr + rows + '</div></div>';
  }).join('');
  return '<div class="section"><div class="section-header"><h2>' + h2 + '</h2><span class="meta">Source FR · Traduction IA · Validée (modifiée par utilisateur)</span></div><div class="section-body"><div class="translations-block">' + blocks + '</div></div></div>';
}

function renderFailures() {
  var rows = D.failures.length === 0
    ? '<tr class="empty-row"><td colspan="3">Aucun échec — toutes les images ont été générées</td></tr>'
    : D.failures.map(function(f) { return '<tr><td class="file-name">' + esc(f.file) + '</td><td><span class="lang-tag">' + esc(f.lang) + '</span></td><td class="err-msg">' + esc(f.error) + '</td></tr>'; }).join('');
  return '<div class="section"><div class="section-header"><h2>⚠ Images en échec (' + D.failures.length + ')</h2><span class="meta">après auto-retry</span></div><table class="failures-table"><thead><tr><th>Image</th><th>Langue</th><th>Erreur</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function renderRegens() {
  var srcCount  = D.regens.filter(function(r) { return r.type === 'source'; }).length;
  var corrCount = D.regens.filter(function(r) { return r.type === 'corr'; }).length;
  var rows = D.regens.length === 0
    ? '<tr class="empty-row"><td colspan="5">Aucune régénération</td></tr>'
    : D.regens.map(function(r) {
        var detail = r.type === 'source' ? '—' : (r.prompt ? '<div class="regen-prompt">"' + esc(r.prompt) + '"</div>' : '<div class="regen-prompt">—</div>');
        return '<tr><td class="file-name">' + esc(r.file) + '</td><td><span class="lang-tag">' + esc(r.lang) + '</span></td><td><span class="regen-tag ' + (r.type === 'source' ? 'regen-source' : 'regen-corr') + '">' + (r.type === 'source' ? 'Depuis source' : 'Corrective') + '</span></td><td>' + detail + '</td><td><span style="color:#6B7280;font-family:\\'JetBrains Mono\\',monospace;font-size:11px;">' + esc(r.time) + '</span></td></tr>';
      }).join('');
  return '<div class="section"><div class="section-header"><h2>⟳ Historique des régénérations (' + D.regens.length + ')</h2><span class="meta">' + srcCount + ' depuis source · ' + corrCount + ' correctives</span></div><table class="regen-table"><thead><tr><th>Image</th><th>Langue</th><th>Type</th><th>Détails</th><th>Heure</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function renderFooter() {
  return '<div class="footer">Synthèse autonome générée par <code>HoorTRADS</code> · job <code>' + esc(D.jobId) + '</code><br>Fichier indépendant — peut être ouvert sans serveur, archivé, partagé.</div>';
}

document.title = D.title + ' — Synthèse HoorTRADS';
document.getElementById('root').innerHTML =
  renderHeader() + renderKpis() + renderModels() +
  renderQuality() + renderZones() + renderDocHints() + renderTranslations() +
  renderFailures() + renderRegens() + renderFooter();
`

export function generateSynthesisHtml(db: Database.Database, jobId: string): string {
  const job = db.prepare('SELECT * FROM generation_jobs WHERE id = ?').get(jobId) as JobRow | undefined
  if (!job) throw new Error('Job not found')

  const session = db.prepare('SELECT id, name, user_id FROM sessions WHERE id = ?').get(job.session_id) as SessionRow | undefined
  let userLabel = 'Anonyme'
  if (session?.user_id) {
    const u = db.prepare('SELECT name, email FROM users WHERE id = ?').get(session.user_id) as UserRow | undefined
    userLabel = u?.name || u?.email || 'Anonyme'
  }

  const tasks = db.prepare(`
    SELECT id, source_image_name, target_language, country_code, status, output_path, error_message, prompt_sent, verification_status, created_at
    FROM generation_tasks WHERE job_id = ?
  `).all(jobId) as TaskRow[]

  const taskIds = tasks.map((t) => t.id)
  const versions: TaskVersionRow[] = taskIds.length > 0
    ? db.prepare(`
        SELECT id, task_id, prompt_sent, regen_label, created_at
        FROM generation_task_versions WHERE task_id IN (${taskIds.map(() => '?').join(',')})
        ORDER BY created_at ASC
      `).all(...taskIds) as TaskVersionRow[]
    : []

  const cfg = job.config ? JSON.parse(job.config) : {}
  const log = cfg.preTranslationLog as { timings?: Record<string, string>; provider?: string; extractedZones?: Record<string, unknown>; translations?: Record<string, unknown>; configDocHints?: Record<string, unknown> } | undefined
  const timings = log?.timings || {}

  const cfgExtract = cfg.primary_model_extract || cfg.model_extract
  const cfgTranslate = cfg.primary_model_translate || cfg.model_translate
  const cfgGenerate = cfg.primary_model_generate || cfg.model_generate
  const cfgVerify = cfg.primary_model_verify || cfg.model_verify
  const readAppConfig = (key: string): string | null => {
    try {
      const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get(key) as { value: string } | undefined
      return row?.value ?? null
    } catch { return null }
  }
  const finalExtract = cfgExtract || readAppConfig('primary_model_extract') || readAppConfig('model_extract')
  const finalTranslate = cfgTranslate || readAppConfig('primary_model_translate') || readAppConfig('model_translate')
  const finalGenerate = cfgGenerate || readAppConfig('primary_model_generate') || readAppConfig('model_generate')
  const finalVerify = cfgVerify || readAppConfig('primary_model_verify') || readAppConfig('model_verify')

  const totalImages = job.total_tasks
  const successCount = tasks.filter((t) => t.status === 'done').length
  const failedCount = tasks.filter((t) => t.status === 'failed').length
  const successRate = totalImages > 0 ? (successCount / totalImages) * 100 : 0

  const versionsBySource = versions.filter((v) => v.regen_label === 'source' || v.regen_label === null || v.regen_label === '')
  const versionsCorrective = versions.filter((v) => v.regen_label && v.regen_label !== 'source')
  const regenSourceCount = versionsBySource.length
  const regenCorrectiveCount = versionsCorrective.length

  const verifiedTasks = tasks.filter((t) => t.verification_status)
  const avgScore = verifiedTasks.length > 0
    ? verifiedTasks.reduce((sum, t) => sum + (parseFloat(t.verification_status as string) || 0), 0) / verifiedTasks.length
    : 0
  const validatedFirstTry = tasks.filter((t) => t.status === 'done' && !versions.some((v) => v.task_id === t.id)).length

  const extractingAt = timings.extracting_at ? new Date(timings.extracting_at).getTime() : 0
  const extractedAt = timings.extracted_at ? new Date(timings.extracted_at).getTime() : 0
  const translatingAt = timings.translating_at ? new Date(timings.translating_at).getTime() : 0
  const translatedAt = timings.translated_at ? new Date(timings.translated_at).getTime() : 0
  const imageGenerationDoneAt = timings.image_generation_done_at ? new Date(timings.image_generation_done_at).getTime() : 0

  const startMs = extractingAt > 0 ? extractingAt : new Date(job.created_at).getTime()
  const endMs = imageGenerationDoneAt > 0 ? imageGenerationDoneAt : new Date(job.updated_at).getTime()
  const totalMs = Math.max(0, endMs - startMs)

  const extractMs = (extractingAt > 0 && extractedAt > 0) ? Math.max(0, extractedAt - extractingAt) : 0
  const translateMs = (translatingAt > 0 && translatedAt > 0) ? Math.max(0, translatedAt - translatingAt) : 0
  const imageStartMs = translatedAt || extractedAt || 0
  const imageEndMs = imageGenerationDoneAt > 0 ? imageGenerationDoneAt : endMs
  const imageMs = (imageStartMs > 0 && imageEndMs > imageStartMs) ? imageEndMs - imageStartMs : 0
  const langs = [...new Set(tasks.map((t) => t.target_language))].sort()
  const sourceImageCount = new Set(tasks.map((t) => t.source_image_name)).size

  const provider = log?.provider as string | undefined
  const providerLabel = provider ? PROVIDER_LABEL[provider] || provider : null

  const sessionName = session?.name || 'Session sans nom'
  const generatedAtStr = new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  // Zones extraites
  const extractedZones = (log?.extractedZones || {}) as Record<string, { text?: string; weight?: string; case?: string; color?: string; size?: string } | string>
  const zonesData = Object.entries(extractedZones).map(([key, z]) => ({
    key,
    text: typeof z === 'string' ? z : z.text || '',
    meta: typeof z === 'object' ? [z.weight, z.case, z.color, z.size].filter(Boolean).join(' · ') : '',
  }))

  // Traductions
  const aiTranslations = (log?.translations || {}) as Record<string, Record<string, string>>
  const approvedTranslations = (cfg.approvedTranslations || {}) as Record<string, Record<string, string>>
  const allLangs = new Set([...Object.keys(aiTranslations), ...Object.keys(approvedTranslations)])
  const translationsData: Record<string, Array<{ key: string; source: string; ai: string; approved: string; edited: boolean }>> = {}
  for (const lang of Array.from(allLangs)) {
    const aiZones = aiTranslations[lang] || {}
    const approvedZones = approvedTranslations[lang] || {}
    const allZoneKeys = new Set([...Object.keys(aiZones), ...Object.keys(approvedZones)])
    translationsData[lang] = Array.from(allZoneKeys).map((key) => {
      const sourceText = typeof extractedZones[key] === 'string'
        ? extractedZones[key] as string
        : (extractedZones[key] as { text?: string })?.text || ''
      const aiVal = aiZones[key] || ''
      const approvedVal = approvedZones[key] !== undefined ? approvedZones[key] : aiVal
      const wasEdited = approvedZones[key] !== undefined && approvedZones[key] !== aiVal
      return { key, source: sourceText, ai: aiVal, approved: approvedVal, edited: wasEdited }
    })
  }

  // Config doc hints
  const configDocHints = (log?.configDocHints || {}) as Record<string, string>

  // Modèles
  const modelsData: Array<{ role: string; icon: string; cls: string; name: string; provider: string; stats: string }> = []
  if (finalExtract) modelsData.push({ role: 'Extraction', icon: '🔎', cls: 'extract', name: finalExtract, provider: inferProvider(finalExtract), stats: `${Object.keys(extractedZones).length} zones extraites · ${formatDuration(extractMs)}` })
  if (finalTranslate) modelsData.push({ role: 'Traduction', icon: '🌐', cls: 'translate', name: finalTranslate, provider: inferProvider(finalTranslate), stats: `${Object.keys(aiTranslations).length} langues · ${formatDuration(translateMs)}` })
  if (finalGenerate) modelsData.push({ role: "Génération d'image", icon: '🎨', cls: 'image', name: finalGenerate, provider: inferProvider(finalGenerate), stats: `${successCount} images · ${formatDuration(imageMs)}` })
  if (finalVerify) modelsData.push({ role: 'Vérification', icon: '🔍', cls: 'verify', name: finalVerify, provider: inferProvider(finalVerify), stats: `${verifiedTasks.length} vérifs · score moyen ${avgScore.toFixed(1)}/5` })

  // Échecs
  const failuresData = tasks.filter((t) => t.status === 'failed').map((t) => ({
    file: t.source_image_name,
    lang: t.target_language.toUpperCase(),
    error: (t.error_message || 'Erreur inconnue').slice(0, 200),
  }))

  // Régénérations
  const taskById = new Map(tasks.map((t) => [t.id, t]))
  const regensData = versions.slice(0, 50).map((v) => {
    const task = taskById.get(v.task_id)
    if (!task) return null
    const isSource = !v.regen_label || v.regen_label === 'source'
    return {
      file: task.source_image_name,
      lang: task.target_language.toUpperCase(),
      type: isSource ? 'source' : 'corr',
      prompt: !isSource && v.prompt_sent ? v.prompt_sent.slice(0, 200) : null,
      time: new Date(v.created_at).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    }
  }).filter((v): v is NonNullable<typeof v> => v !== null)

  // Qualité
  const firstPassRate = successCount > 0 ? (validatedFirstTry / successCount) * 100 : 0
  const avgIterations = successCount > 0 ? 1 + (regenSourceCount + regenCorrectiveCount) / successCount : 0
  const iterPct = successCount > 0 ? Math.min(100, ((regenSourceCount + regenCorrectiveCount) / successCount) * 100) : 0

  // Objet de données complet sérialisé dans le HTML
  const data = {
    title: sessionName,
    user: userLabel,
    date: formatDateTime(job.created_at),
    langues: `${langs.length} langue${langs.length > 1 ? 's' : ''} (${langs.map((l) => l.toUpperCase()).join(', ')})`,
    visuels: `${sourceImageCount} visuel${sourceImageCount > 1 ? 's' : ''} source`,
    provider: providerLabel,
    synthesisDate: generatedAtStr,
    kpis: {
      images: successCount,
      imagesDemandees: totalImages,
      failures: failedCount,
      regenSource: regenSourceCount,
      regenCorr: regenCorrectiveCount,
      duree: formatDuration(totalMs),
    },
    models: modelsData,
    quality: {
      successRate,
      avgScore: avgScore > 0 ? avgScore : null,
      avgScoreMax: 5,
      firstPass: validatedFirstTry,
      firstPassTotal: successCount,
      firstPassRate,
      avgIterations,
      iterPct,
    },
    zones: zonesData,
    translations: translationsData,
    configDocHints,
    failures: failuresData,
    regens: regensData,
    cost: null as string | null,  // ex: "1,24 €" — à renseigner manuellement après génération
    jobId,
  }

  const dataJson = JSON.stringify(data, null, 2).replace(/<\/script>/gi, '<\\/script>')

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Synthèse — ${escapeHtml(sessionName)}</title>
<style>${CSS}</style>
<script>
// ╔══════════════════════════════════════════════════════════╗
//   DONNÉES — modifiez uniquement cette section
// ╚══════════════════════════════════════════════════════════╝
const D = ${dataJson};
// ╚══════════════════════════════════════════════════════════╝
</script>
</head>
<body>
<div class="container" id="root"></div>
<script>${RENDER_JS}</script>
</body>
</html>`
}
