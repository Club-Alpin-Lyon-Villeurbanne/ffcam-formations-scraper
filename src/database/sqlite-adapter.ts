/** Base SQLite locale, pour développer le scraper seulement : ni vrai caf_user ni caf_commission */
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { DatabaseAdapter } from '../types';
import { PATHS } from '../config';

class SQLiteAdapter implements DatabaseAdapter {
  private db: Database.Database | null = null;
  private dbPath: string;

  private usersByCafnum: Map<string, Map<string, number>> = new Map();

  constructor() {
    this.dbPath = path.join(PATHS.DATA_DIR, 'local.db');
  }

  async connect(): Promise<void> {
    if (this.db) return;
    
    try {
      if (!fs.existsSync(PATHS.DATA_DIR)) {
        fs.mkdirSync(PATHS.DATA_DIR, { recursive: true });
      }
      
      this.db = new Database(this.dbPath);
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('journal_mode = WAL');
      
      console.log('✅ Connecté à SQLite (local.db)\n');
      
      await this.initTables();
    } catch (error: any) {
      console.error('❌ Erreur connexion SQLite:', error.message);
      throw error;
    }
  }

  private tableExists(tableName: string): boolean {
    const result = this.db!.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
    ).get(tableName);
    return !!result;
  }

  /**
   * Drop et recrée les tables si le schéma a changé
   */
  private async migrateIfNeeded(): Promise<void> {
    const hasOldSchema = this.tableExists('formation_brevet') ||
                         this.tableExists('formation_referentiel') ||
                         this.tableExists('formation_brevet_referentiel');

    if (hasOldSchema) {
      console.log('⚠️  Ancien schéma détecté - Migration nécessaire');
      console.log('   Suppression des anciennes tables...');

      // Ordre imposé par les clés étrangères
      this.db!.exec('DROP TABLE IF EXISTS formation_competence_validation');
      this.db!.exec('DROP TABLE IF EXISTS formation_competence_referentiel');
      this.db!.exec('DROP TABLE IF EXISTS formation_brevet');
      this.db!.exec('DROP TABLE IF EXISTS formation_brevet_referentiel');
      this.db!.exec('DROP TABLE IF EXISTS formation_validation');
      this.db!.exec('DROP TABLE IF EXISTS formation_niveau_validation');
      this.db!.exec('DROP TABLE IF EXISTS formation_niveau_referentiel');
      this.db!.exec('DROP TABLE IF EXISTS formation_referentiel');
      // Nouvelles tables (au cas où migration partielle)
      this.db!.exec('DROP TABLE IF EXISTS formation_validation_groupe_competence');
      this.db!.exec('DROP TABLE IF EXISTS formation_referentiel_groupe_competence');
      this.db!.exec('DROP TABLE IF EXISTS formation_validation_brevet');
      this.db!.exec('DROP TABLE IF EXISTS formation_referentiel_brevet');
      this.db!.exec('DROP TABLE IF EXISTS formation_validation_formation');
      this.db!.exec('DROP TABLE IF EXISTS formation_validation_niveau_pratique');
      this.db!.exec('DROP TABLE IF EXISTS formation_referentiel_niveau_pratique');
      this.db!.exec('DROP TABLE IF EXISTS formation_referentiel_formation');
      this.db!.exec('DROP TABLE IF EXISTS formation_last_sync');
      this.db!.exec('DROP TABLE IF EXISTS caf_user');

      console.log('   ✅ Migration terminée - Nouveau schéma sera créé\n');
    }
  }

  private async initTables(): Promise<void> {
    await this.migrateIfNeeded();

    const tables = [
      `CREATE TABLE IF NOT EXISTS caf_user (
        id_user INTEGER PRIMARY KEY AUTOINCREMENT,
        cafnum_user TEXT UNIQUE
      )`,
      
      `CREATE TABLE IF NOT EXISTS formation_referentiel_formation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code_formation TEXT NOT NULL UNIQUE,
        intitule TEXT NOT NULL
      )`,

      `CREATE TABLE IF NOT EXISTS formation_referentiel_niveau_pratique (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cursus_niveau_id INTEGER NOT NULL UNIQUE,
        code_activite TEXT NOT NULL,
        activite TEXT NOT NULL,
        niveau TEXT NOT NULL,
        libelle TEXT NOT NULL,
        niveau_court TEXT,
        discipline TEXT
      )`,

      `CREATE TABLE IF NOT EXISTS formation_validation_formation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        code_formation TEXT,
        valide INTEGER DEFAULT 1,
        date_validation DATE,
        numero_formation TEXT,
        validateur TEXT,
        id_interne TEXT,
        intitule_formation TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES caf_user(id_user) ON DELETE CASCADE,
        FOREIGN KEY (code_formation) REFERENCES formation_referentiel_formation(code_formation) ON DELETE SET NULL
      )`,

      `CREATE TABLE IF NOT EXISTS formation_validation_niveau_pratique (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        cursus_niveau_id INTEGER NOT NULL,
        date_validation DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, cursus_niveau_id),
        FOREIGN KEY (user_id) REFERENCES caf_user(id_user) ON DELETE CASCADE,
        FOREIGN KEY (cursus_niveau_id) REFERENCES formation_referentiel_niveau_pratique(cursus_niveau_id) ON DELETE RESTRICT
      )`,

      `CREATE TABLE IF NOT EXISTS formation_referentiel_brevet (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code_brevet TEXT NOT NULL UNIQUE,
        intitule TEXT NOT NULL
      )`,

      `CREATE TABLE IF NOT EXISTS formation_validation_brevet (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        brevet_id INTEGER NOT NULL,
        date_obtention DATE,
        date_recyclage DATE,
        date_edition DATE,
        date_formation_continue DATE,
        date_migration DATE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, brevet_id),
        FOREIGN KEY (user_id) REFERENCES caf_user(id_user) ON DELETE CASCADE,
        FOREIGN KEY (brevet_id) REFERENCES formation_referentiel_brevet(id) ON DELETE RESTRICT
      )`,

      `CREATE TABLE IF NOT EXISTS formation_referentiel_groupe_competence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        intitule TEXT NOT NULL,
        code_activite TEXT,
        activite TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(intitule, code_activite)
      )`,

      `CREATE TABLE IF NOT EXISTS formation_validation_groupe_competence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        competence_id INTEGER NOT NULL,
        niveau_associe TEXT,
        date_validation DATETIME,
        est_valide INTEGER DEFAULT 0 NOT NULL,
        valide_par TEXT,
        commentaire TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, competence_id),
        FOREIGN KEY (user_id) REFERENCES caf_user(id_user) ON DELETE CASCADE,
        FOREIGN KEY (competence_id) REFERENCES formation_referentiel_groupe_competence(id) ON DELETE RESTRICT
      )`,

      `CREATE TABLE IF NOT EXISTS formation_last_sync (
        type TEXT PRIMARY KEY,
        last_sync DATETIME DEFAULT CURRENT_TIMESTAMP,
        records_count INTEGER DEFAULT 0
      )`
    ];

    for (const table of tables) {
      this.db!.exec(table);
    }
  }

  /** Traduit à la volée la syntaxe MySQL utilisée par les importers */
  async execute(sql: string, params: any[] = []): Promise<[any[], any[]]> {
    if (!this.db) {
      throw new Error('Connexion non établie. Appelez connect() d\'abord.');
    }

    let sqliteQuery = sql;
    
    // INSERT OR REPLACE supprime puis réinsère : les ids changent, contrairement à MySQL
    if (sql.includes('ON DUPLICATE KEY UPDATE')) {
      sqliteQuery = sql.replace(/INSERT INTO/i, 'INSERT OR REPLACE INTO')
                       .replace(/ON DUPLICATE KEY UPDATE.*/is, '');
    }

    sqliteQuery = sqliteQuery.replace(/NOW\(\)/gi, 'CURRENT_TIMESTAMP');

    try {
      const isSelect = sqliteQuery.trim().toUpperCase().startsWith('SELECT');
      
      if (isSelect) {
        const rows = this.db!.prepare(sqliteQuery).all(params);
        // Même forme de retour que mysql2 : [rows, fields]
        return [rows || [], []];
      } else {
        const stmt = this.db!.prepare(sqliteQuery);
        const result = stmt.run(params) as Database.RunResult;
        return [{ 
          affectedRows: result.changes, 
          insertId: result.lastInsertRowid 
        } as any, []];
      }
    } catch (error: any) {
      // Ignorer les erreurs de contrainte UNIQUE (équivalent au ON DUPLICATE KEY UPDATE)
      if (error.message.includes('UNIQUE constraint failed')) {
        if (sql.includes('INSERT INTO')) {
          // Ne rien faire, c'est normal avec INSERT OR REPLACE
          return [{ affectedRows: 0 } as any, []];
        }
      }
      console.error('Erreur SQLite:', error.message);
      throw error;
    }
  }

  async getUserIdFromCafnum(cafnum: string): Promise<number | null> {
    cafnum = String(cafnum ?? '').trim();
    if (!this.db) return null;
    if (!cafnum || cafnum.length < 4) return null;

    const prefix = cafnum.slice(0, 4);

    // Une erreur SQL remonte à l'importer (comptée en erreur) : la transformer en null
    // ferait passer toutes les lignes pour des adhérents introuvables
    let usersForPrefix = this.usersByCafnum.get(prefix);

    if (!usersForPrefix) {
      const [rows] = await this.execute(
        'SELECT id_user, cafnum_user FROM caf_user WHERE cafnum_user LIKE ?',
        [`${prefix}%`]
      );
      usersForPrefix = new Map(rows.map((row: any) => [String(row.cafnum_user).trim(), row.id_user]));
      this.usersByCafnum.set(prefix, usersForPrefix);
    }

    return usersForPrefix.get(cafnum) ?? null;
  }

  async updateLastSync(type: string, count: number): Promise<void> {
    if (!this.db) return;
    
    try {
      await this.execute(
        `INSERT OR REPLACE INTO formation_last_sync (type, last_sync, records_count) 
         VALUES (?, CURRENT_TIMESTAMP, ?)`,
        [type, count]
      );
    } catch (error: any) {
      console.error('Erreur update last sync:', error.message);
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  isConnected(): boolean {
    return this.db !== null;
  }
}

let instance: SQLiteAdapter | null = null;

export function getInstance(): SQLiteAdapter {
  if (!instance) {
    instance = new SQLiteAdapter();
  }
  return instance;
}

