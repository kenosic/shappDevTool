import { ipcMain } from "electron";
import Database from "better-sqlite3";
import { existsSync } from "fs";
import { copyFileSync } from "fs";
import { dialog } from "electron";
import { join } from "path";

function openDb(dbPath: string): Database.Database {
  return new Database(dbPath, { readonly: false });
}

export function registerKvHandlers(): void {
  ipcMain.handle("kv:getTables", (_e, dbPath: string): string[] => {
    if (!existsSync(dbPath)) return [];
    try {
      const db = openDb(dbPath);
      const rows = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        .all() as { name: string }[];
      db.close();
      return rows.map((r) => r.name);
    } catch {
      return [];
    }
  });

  ipcMain.handle(
    "kv:getTableRows",
    (
      _e,
      dbPath: string,
      table: string,
      limit = 100,
      offset = 0
    ): { rows: Record<string, unknown>[]; total: number } => {
      if (!existsSync(dbPath)) return { rows: [], total: 0 };
      try {
        const db = openDb(dbPath);
        // Validate table name to prevent SQL injection (names from sqlite_master are safe)
        const tables = (
          db
            .prepare(
              "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
            )
            .all(table) as { name: string }[]
        ).map((r) => r.name);
        if (tables.length === 0) {
          db.close();
          return { rows: [], total: 0 };
        }
        const tableName = tables[0];
        const totalRow = db
          .prepare(`SELECT COUNT(*) as count FROM "${tableName}"`)
          .get() as { count: number };
        const rows = db
          .prepare(
            `SELECT * FROM "${tableName}" LIMIT ? OFFSET ?`
          )
          .all(limit, offset) as Record<string, unknown>[];
        db.close();
        return { rows, total: totalRow.count };
      } catch {
        return { rows: [], total: 0 };
      }
    }
  );

  ipcMain.handle(
    "kv:runQuery",
    (
      _e,
      dbPath: string,
      sql: string
    ): { columns: string[]; rows: unknown[][] } | { error: string } => {
      if (!existsSync(dbPath)) return { columns: [], rows: [] };
      try {
        const db = openDb(dbPath);
        const stmt = db.prepare(sql);
        if (stmt.reader) {
          const rows = stmt.all() as Record<string, unknown>[];
          const columns =
            rows.length > 0
              ? Object.keys(rows[0])
              : (stmt.columns() as { name: string }[]).map((c) => c.name);
          db.close();
          return {
            columns,
            rows: rows.map((r) => columns.map((c) => r[c])),
          };
        } else {
          stmt.run();
          db.close();
          return { columns: ["result"], rows: [["OK"]] };
        }
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : String(err),
        } as { error: string };
      }
    }
  );

  ipcMain.handle(
    "kv:exportDb",
    async (_e, dbPath: string): Promise<string | null> => {
      if (!existsSync(dbPath)) return null;
      const result = await dialog.showSaveDialog({
        title: "导出数据库",
        defaultPath: "app-state.db",
        filters: [{ name: "SQLite Database", extensions: ["db", "sqlite"] }],
      });
      if (result.canceled || !result.filePath) return null;
      copyFileSync(dbPath, result.filePath);
      return result.filePath;
    }
  );

  // ── KV Store specific handlers ─────────────────────────────────

  type KvRow = { key: string; value: string; updated_at: number };

  function ensureKvTable(db: Database.Database) {
    db.prepare(
      `CREATE TABLE IF NOT EXISTS shapp_kv (
         key TEXT PRIMARY KEY,
         value TEXT NOT NULL,
         updated_at INTEGER NOT NULL
       )`
    ).run();
  }

  ipcMain.handle(
    "kv:getAllEntries",
    (_e, dbPath: string): Array<{ key: string; value: string; updatedAt: number }> => {
      if (!existsSync(dbPath)) return [];
      try {
        const db = openDb(dbPath);
        ensureKvTable(db);
        const rows = db
          .prepare("SELECT key, value, updated_at FROM shapp_kv ORDER BY key")
          .all() as KvRow[];
        db.close();
        return rows.map((r) => ({ key: r.key, value: r.value, updatedAt: r.updated_at }));
      } catch {
        return [];
      }
    }
  );

  ipcMain.handle(
    "kv:setEntry",
    (_e, dbPath: string, key: string, value: string): void => {
      const db = openDb(dbPath);
      try {
        ensureKvTable(db);
        db.prepare(
          `INSERT INTO shapp_kv (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        ).run(key, value, Date.now());
      } finally {
        db.close();
      }
    }
  );

  ipcMain.handle(
    "kv:deleteEntry",
    (_e, dbPath: string, key: string): void => {
      if (!existsSync(dbPath)) return;
      const db = openDb(dbPath);
      try {
        db.prepare("DELETE FROM shapp_kv WHERE key = ?").run(key);
      } finally {
        db.close();
      }
    }
  );

  ipcMain.handle(
    "kv:clearAll",
    (_e, dbPath: string): void => {
      if (!existsSync(dbPath)) return;
      const db = openDb(dbPath);
      try {
        db.prepare("DELETE FROM shapp_kv").run();
      } finally {
        db.close();
      }
    }
  );

  ipcMain.handle(
    "kv:importEntries",
    (_e, dbPath: string, entries: Array<{ key: string; value: string }>): void => {
      const db = openDb(dbPath);
      try {
        ensureKvTable(db);
        const insert = db.prepare(
          `INSERT INTO shapp_kv (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        );
        const insertMany = db.transaction((rows: Array<{ key: string; value: string }>) => {
          for (const row of rows) {
            insert.run(row.key, row.value, Date.now());
          }
        });
        insertMany(entries);
      } finally {
        db.close();
      }
    }
  );
}
