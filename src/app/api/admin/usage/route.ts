import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'
import { getAppConfig } from '@/lib/db/queries'

const DEFAULT_COST_PER_IMAGE_EUR = 0.07

export async function GET(request: NextRequest) {
  try {
    const db = getDb()
    const { searchParams } = new URL(request.url)

    const monthParam = searchParams.get('month')   // YYYY-MM
    const yearParam  = searchParams.get('year')    // YYYY
    const fromParam  = searchParams.get('from')    // YYYY-MM-DD
    const toParam    = searchParams.get('to')      // YYYY-MM-DD

    // Read configurable cost
    const costStr = getAppConfig(db, 'cost_per_image_eur')
    const COST_PER_IMAGE_EUR = costStr ? parseFloat(costStr) : DEFAULT_COST_PER_IMAGE_EUR

    // Build date filter
    let dateFilter: { sql: string; params: string[] } = { sql: '', params: [] }

    if (fromParam && toParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) && /^\d{4}-\d{2}-\d{2}$/.test(toParam)) {
      // Custom range
      dateFilter = { sql: ' AND {col} >= ? AND {col} <= ?', params: [fromParam, toParam + 'T23:59:59'] }
    } else if (monthParam && monthParam !== 'all' && /^\d{4}-\d{2}$/.test(monthParam)) {
      // Month filter
      const [y, m] = monthParam.split('-').map(Number)
      const nextMonth = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`
      dateFilter = { sql: ' AND {col} >= ? AND {col} < ?', params: [`${monthParam}-01`, nextMonth] }
    } else if (yearParam && /^\d{4}$/.test(yearParam)) {
      // Year filter
      dateFilter = { sql: ' AND {col} >= ? AND {col} < ?', params: [`${yearParam}-01-01`, `${Number(yearParam) + 1}-01-01`] }
    }

    const isFiltered = dateFilter.sql !== ''

    function df(col: string): { sql: string; params: string[] } {
      if (!isFiltered) return { sql: '', params: [] }
      return { sql: dateFilter.sql.replace(/{col}/g, col), params: [...dateFilter.params] }
    }

    // ── Totaux ─────────────────────────────────────────────────────────────
    const f1 = df('created_at')
    const total = db.prepare(
      `SELECT COUNT(*) as count FROM generation_tasks WHERE status = 'done' AND output_path NOT LIKE 'mock_%'${f1.sql}`
    ).get(...f1.params) as { count: number }

    const f2 = df('created_at')
    const totalFailed = db.prepare(
      `SELECT COUNT(*) as count FROM generation_tasks WHERE status = 'failed'${f2.sql}`
    ).get(...f2.params) as { count: number }

    const f3 = df('created_at')
    const totalRegens = db.prepare(
      `SELECT COUNT(*) as count FROM generation_task_versions WHERE output_path NOT LIKE 'mock_%'${f3.sql}`
    ).get(...f3.params) as { count: number }

    const f4 = df('created_at')
    const totalTasks = db.prepare(
      `SELECT COUNT(*) as count FROM generation_tasks WHERE output_path NOT LIKE 'mock_%'${f4.sql}`
    ).get(...f4.params) as { count: number }

    const errorRate = totalTasks.count > 0
      ? ((totalRegens.count + totalFailed.count) / totalTasks.count) * 100
      : 0

    // ── Total sessions ──────────────────────────────────────────────────────
    const fS = df('created_at')
    const totalSessions = (db.prepare(
      `SELECT COUNT(*) as count FROM sessions${fS.sql ? ' WHERE 1=1' + fS.sql : ''}`
    ).get(...fS.params) as { count: number }).count

    // ── Ce mois-ci (always current calendar month) ───────────────────────────
    const thisMonth = db.prepare(`
      SELECT COUNT(*) as count FROM generation_tasks
      WHERE status = 'done' AND output_path NOT LIKE 'mock_%'
      AND created_at >= date('now', 'start of month')
    `).get() as { count: number }

    const thisMonthRegens = db.prepare(`
      SELECT COUNT(*) as count FROM generation_task_versions v
      WHERE v.output_path NOT LIKE 'mock_%'
      AND v.created_at >= date('now', 'start of month')
    `).get() as { count: number }

    const thisMonthFailed = db.prepare(`
      SELECT COUNT(*) as count FROM generation_tasks
      WHERE status = 'failed' AND created_at >= date('now', 'start of month')
    `).get() as { count: number }

    const thisMonthTasks = db.prepare(`
      SELECT COUNT(*) as count FROM generation_tasks
      WHERE output_path NOT LIKE 'mock_%' AND created_at >= date('now', 'start of month')
    `).get() as { count: number }

    const errorRateMonth = thisMonthTasks.count > 0
      ? ((thisMonthRegens.count + thisMonthFailed.count) / thisMonthTasks.count) * 100
      : 0

    // ── Mois disponibles ────────────────────────────────────────────────────
    const availableMonths = db.prepare(`
      SELECT DISTINCT strftime('%Y-%m', created_at) as month
      FROM generation_tasks
      WHERE output_path NOT LIKE 'mock_%'
      ORDER BY month DESC
    `).all() as { month: string }[]

    // ── Années disponibles ──────────────────────────────────────────────────
    const availableYears = db.prepare(`
      SELECT DISTINCT strftime('%Y', created_at) as year
      FROM generation_tasks
      WHERE output_path NOT LIKE 'mock_%'
      ORDER BY year DESC
    `).all() as { year: string }[]

    // ── Par pays ────────────────────────────────────────────────────────────
    const byLangParams: string[] = []
    let byLangVersionFilter = ''
    let byLangTaskFilter = ''
    if (isFiltered) {
      const d = df('v.created_at')
      byLangVersionFilter = d.sql
      byLangParams.push(...d.params)
      const d2 = df('t.created_at')
      byLangTaskFilter = d2.sql
      byLangParams.push(...d2.params)
    }
    const byLanguage = db.prepare(`
      SELECT
        t.target_language,
        t.country_code,
        COUNT(DISTINCT t.id) as total_tasks,
        COUNT(DISTINCT CASE WHEN t.status = 'failed' THEN t.id END) as failed_tasks,
        COUNT(v.id) as regen_count
      FROM generation_tasks t
      LEFT JOIN generation_task_versions v ON v.task_id = t.id AND v.output_path NOT LIKE 'mock_%'
        ${byLangVersionFilter}
      WHERE (t.output_path NOT LIKE 'mock_%' OR t.status = 'failed')
        ${byLangTaskFilter}
      GROUP BY t.target_language, t.country_code
      ORDER BY (COUNT(v.id) + COUNT(DISTINCT CASE WHEN t.status = 'failed' THEN t.id END)) DESC
    `).all(...byLangParams) as {
      target_language: string; country_code: string; total_tasks: number; failed_tasks: number; regen_count: number
    }[]

    const byLanguageWithRate = byLanguage.map((row) => ({
      ...row,
      error_count: row.regen_count + row.failed_tasks,
      error_rate: row.total_tasks > 0 ? ((row.regen_count + row.failed_tasks) / row.total_tasks) * 100 : 0,
      estimated_cost: row.total_tasks * COST_PER_IMAGE_EUR,
    }))

    // ── Jobs récents avec username ──────────────────────────────────────────
    const recentJobParams: string[] = []
    let recentJobTaskFilter = ''
    let recentJobFilter = ''
    if (isFiltered) {
      const d1 = df('t2.created_at')
      recentJobTaskFilter = d1.sql
      recentJobParams.push(...d1.params)
      const d2 = df('g.created_at')
      recentJobFilter = d2.sql
      recentJobParams.push(...d2.params)
    }
    const recentJobs = db.prepare(`
      SELECT
        g.id,
        g.completed_tasks,
        g.failed_tasks,
        g.total_tasks,
        g.created_at,
        s.name as session_name,
        u.name as user_name,
        COUNT(v.id) as regen_count
      FROM generation_jobs g
      LEFT JOIN sessions s ON s.id = g.session_id
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN generation_tasks t ON t.job_id = g.id
      LEFT JOIN generation_task_versions v ON v.task_id = t.id AND v.output_path NOT LIKE 'mock_%'
      WHERE EXISTS (
        SELECT 1 FROM generation_tasks t2
        WHERE t2.job_id = g.id AND t2.status = 'done' AND t2.output_path NOT LIKE 'mock_%'
        ${recentJobTaskFilter}
      )
      ${recentJobFilter}
      GROUP BY g.id
      ORDER BY g.rowid DESC LIMIT 50
    `).all(...recentJobParams) as {
      id: string; completed_tasks: number; failed_tasks: number; total_tasks: number
      created_at: string; session_name: string; user_name: string | null; regen_count: number
    }[]

    const recentJobsWithStats = recentJobs.map((job) => {
      const totalForJob = job.total_tasks || job.completed_tasks
      const errors = job.regen_count + job.failed_tasks
      return {
        ...job,
        error_count: errors,
        error_rate: totalForJob > 0 ? (errors / totalForJob) * 100 : 0,
        estimated_cost_eur: job.completed_tasks * COST_PER_IMAGE_EUR,
      }
    })

    // ── Activité mensuelle ─────────────────────────────────────────────────
    const byMonth = db.prepare(`
      SELECT
        strftime('%Y-%m', created_at) as month,
        COUNT(*) as count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
      FROM generation_tasks
      WHERE output_path NOT LIKE 'mock_%' OR status = 'failed'
      GROUP BY month
      ORDER BY month ASC
    `).all() as { month: string; count: number; failed: number }[]

    return NextResponse.json({
      totalGenerations: total.count,
      totalCost: total.count * COST_PER_IMAGE_EUR,
      totalRegens: totalRegens.count,
      totalFailed: totalFailed.count,
      totalSessions,
      errorRate,
      thisMonth: thisMonth.count,
      thisMonthCost: thisMonth.count * COST_PER_IMAGE_EUR,
      thisMonthRegens: thisMonthRegens.count,
      errorRateMonth,
      costPerImage: COST_PER_IMAGE_EUR,
      availableMonths: availableMonths.map((r) => r.month),
      availableYears: availableYears.map((r) => r.year),
      byLanguage: byLanguageWithRate,
      recentJobs: recentJobsWithStats,
      byMonth,
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const db = getDb()
    db.prepare('DELETE FROM generation_task_versions').run()
    db.prepare('DELETE FROM generation_tasks').run()
    db.prepare('DELETE FROM generation_jobs').run()
    db.prepare('DELETE FROM sessions').run()
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 })
  }
}
