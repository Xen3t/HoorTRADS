import Database from 'better-sqlite3'

let db: Database.Database | null = null

export function getDb(dbPath?: string): Database.Database {
  if (!db) {
    const path = dbPath || process.env.DATABASE_PATH || './data/hoortrad.db'
    db = new Database(path)
    db.pragma('journal_mode = WAL')
    runMigrations(db)
  }
  return db
}

export function createTestDb(): Database.Database {
  const testDb = new Database(':memory:')
  runMigrations(testDb)
  return testDb
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'draft',
      image_count INTEGER NOT NULL DEFAULT 0,
      market_count INTEGER NOT NULL DEFAULT 0,
      current_step TEXT NOT NULL DEFAULT 'configure',
      source_path TEXT,
      config TEXT
    );

    CREATE TABLE IF NOT EXISTS generation_jobs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      total_tasks INTEGER NOT NULL DEFAULT 0,
      completed_tasks INTEGER NOT NULL DEFAULT 0,
      failed_tasks INTEGER NOT NULL DEFAULT 0,
      config TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS generation_tasks (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      source_image_path TEXT NOT NULL,
      source_image_name TEXT NOT NULL,
      target_language TEXT NOT NULL,
      country_code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      output_path TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (job_id) REFERENCES generation_jobs(id)
    );

    CREATE TABLE IF NOT EXISTS generation_task_versions (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      output_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES generation_tasks(id)
    );

    CREATE TABLE IF NOT EXISTS glossary (
      id TEXT PRIMARY KEY,
      term_source TEXT NOT NULL,
      term_target TEXT NOT NULL,
      language_code TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
}
