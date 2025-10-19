/**
 * Adaptateur SQLite pour le développement local
 * Utilise better-sqlite3 pour de meilleures performances
 */
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { DatabaseAdapter } from '../types';
import { PATHS } from '../config';

class SQLiteAdapter implements DatabaseAdapter {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor() {
    this.dbPath = path.join(PATHS.DATA_DIR, 'local.db');
  }

  /**
   * Initialise la connexion SQLite
   */
  async connect(): Promise<void> {
    if (this.db) return;
    
    try {
      // S'assurer que le dossier existe
      if (!fs.existsSync(PATHS.DATA_DIR)) {
        fs.mkdirSync(PATHS.DATA_DIR, { recursive: true });
      }
      
      this.db = new Database(this.dbPath);
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('journal_mode = WAL');
      
      console.log('✅ Connecté à SQLite (local.db)\n');
      
      // Initialiser les tables si nécessaire
      await this.initTables();
    } catch (error: any) {
      console.error('❌ Erreur connexion SQLite:', error.message);
      throw error;
    }
  }

  /**
   * Initialise les tables SQLite - Schéma simplifié (5 tables)
   */
  private async initTables(): Promise<void> {
    const tables = [
      // Table des utilisateurs (conservée pour référence)
      `CREATE TABLE IF NOT EXISTS caf_user (
        id_user INTEGER PRIMARY KEY AUTOINCREMENT,
        cafnum_user TEXT UNIQUE
      )`,
      
      // 1. Table référentiel des formations
      `CREATE TABLE IF NOT EXISTS formation_referentiel (
        code_formation TEXT PRIMARY KEY,
        intitule TEXT NOT NULL
      )`,
      
      // 2. Table référentiel des niveaux
      `CREATE TABLE IF NOT EXISTS formation_niveau_referentiel (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cursus_niveau_id INTEGER NOT NULL UNIQUE,
        code_activite TEXT NOT NULL,
        activite TEXT NOT NULL,
        niveau TEXT NOT NULL,
        libelle TEXT NOT NULL,
        niveau_court TEXT,
        discipline TEXT
      )`,
      
      // 3. Table de validation des formations (alignée avec MySQL prod)
      `CREATE TABLE IF NOT EXISTS formation_validation (
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
        FOREIGN KEY (code_formation) REFERENCES formation_referentiel(code_formation) ON DELETE SET NULL
      )`,
      
      // 4. Table de validation des niveaux
      `CREATE TABLE IF NOT EXISTS formation_niveau_validation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        cursus_niveau_id INTEGER NOT NULL,
        date_validation DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, cursus_niveau_id),
        FOREIGN KEY (user_id) REFERENCES caf_user(id_user) ON DELETE CASCADE,
        FOREIGN KEY (cursus_niveau_id) REFERENCES formation_niveau_referentiel(cursus_niveau_id) ON DELETE RESTRICT
      )`,
      
      // 5. Table de synchronisation
      `CREATE TABLE IF NOT EXISTS formation_last_sync (
        type TEXT PRIMARY KEY,
        last_sync DATETIME DEFAULT CURRENT_TIMESTAMP,
        records_count INTEGER DEFAULT 0
      )`
    ];

    // Créer les tables
    for (const table of tables) {
      this.db!.exec(table);
    }
  }

  /**
   * Exécute une requête SQL
   * Adapte la syntaxe MySQL vers SQLite si nécessaire
   */
  async execute(sql: string, params: any[] = []): Promise<[any[], any[]]> {
    if (!this.db) {
      throw new Error('Connexion non établie. Appelez connect() d\'abord.');
    }

    // Adapter la syntaxe MySQL vers SQLite
    let sqliteQuery = sql;
    
    // ON DUPLICATE KEY UPDATE -> INSERT OR REPLACE
    if (sql.includes('ON DUPLICATE KEY UPDATE')) {
      // Pour simplifier, on utilise INSERT OR REPLACE
      sqliteQuery = sql.replace(/INSERT INTO/i, 'INSERT OR REPLACE INTO')
                       .replace(/ON DUPLICATE KEY UPDATE.*/is, '');
    }

    // NOW() -> CURRENT_TIMESTAMP
    sqliteQuery = sqliteQuery.replace(/NOW\(\)/gi, 'CURRENT_TIMESTAMP');

    try {
      // Déterminer le type de requête
      const isSelect = sqliteQuery.trim().toUpperCase().startsWith('SELECT');
      
      if (isSelect) {
        const rows = this.db!.prepare(sqliteQuery).all(params);
        // Retourner dans le format attendu par MySQL2 [rows, fields]
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
        // Essayer de faire un UPDATE à la place
        if (sql.includes('INSERT INTO')) {
          // Ne rien faire, c'est normal avec INSERT OR REPLACE
          return [{ affectedRows: 0 } as any, []];
        }
      }
      console.error('Erreur SQLite:', error.message);
      throw error;
    }
  }

  /**
   * Récupère un utilisateur par son cafnum
   */
  async getUserIdFromCafnum(cafnum: string): Promise<number | null> {
    if (!this.db) return null;
    
    try {
      const [rows] = await this.execute(
        'SELECT id_user FROM caf_user WHERE cafnum_user = ? LIMIT 1',
        [cafnum]
      );
      
      if (rows.length > 0) {
        return rows[0].id_user;
      }

      // Utilisateur non trouvé (silencieux - stats dans les importers)
      return null;
    } catch (error: any) {
      console.error(`Erreur recherche user ${cafnum}:`, error.message);
      return null;
    }
  }

  /**
   * Met à jour la date de dernière synchronisation
   */
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

  /**
   * Ferme la connexion
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Vérifie si la connexion est active
   */
  isConnected(): boolean {
    return this.db !== null;
  }
}

// Singleton
let instance: SQLiteAdapter | null = null;

export function getInstance(): SQLiteAdapter {
  if (!instance) {
    instance = new SQLiteAdapter();
  }
  return instance;
}

