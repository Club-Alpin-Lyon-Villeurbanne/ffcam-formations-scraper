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
   * Vérifie si une table existe
   */
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
    // Vérifier si formation_brevet existe avec l'ancien schéma (sans brevet_id)
    if (this.tableExists('formation_brevet')) {
      const columns = this.db!.pragma(`table_info(formation_brevet)`) as any[];
      const hasBrevetId = columns.some((col: any) => col.name === 'brevet_id');

      if (!hasBrevetId) {
        console.log('⚠️  Ancien schéma détecté - Migration nécessaire');
        console.log('   Suppression des anciennes tables...');

        // Drop toutes les tables (ordre important pour les FK)
        this.db!.exec('DROP TABLE IF EXISTS formation_competence_validation');
        this.db!.exec('DROP TABLE IF EXISTS formation_competence_referentiel');
        this.db!.exec('DROP TABLE IF EXISTS formation_brevet');
        this.db!.exec('DROP TABLE IF EXISTS formation_brevet_referentiel');
        this.db!.exec('DROP TABLE IF EXISTS formation_validation');
        this.db!.exec('DROP TABLE IF EXISTS formation_niveau_validation');
        this.db!.exec('DROP TABLE IF EXISTS formation_niveau_referentiel');
        this.db!.exec('DROP TABLE IF EXISTS formation_referentiel');
        this.db!.exec('DROP TABLE IF EXISTS formation_last_sync');
        this.db!.exec('DROP TABLE IF EXISTS caf_user');

        console.log('   ✅ Migration terminée - Nouveau schéma sera créé\n');
      }
    }
  }

  /**
   * Initialise les tables SQLite - Schéma complet (14 tables)
   */
  private async initTables(): Promise<void> {
    // Migrer si nécessaire
    await this.migrateIfNeeded();

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

      // 5. Table référentiel des brevets
      `CREATE TABLE IF NOT EXISTS formation_brevet_referentiel (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code_brevet TEXT NOT NULL UNIQUE,
        intitule TEXT NOT NULL
      )`,

      // 6. Table des brevets (alignée avec MySQL prod)
      `CREATE TABLE IF NOT EXISTS formation_brevet (
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
        FOREIGN KEY (brevet_id) REFERENCES formation_brevet_referentiel(id) ON DELETE RESTRICT
      )`,

      // 7. Table référentiel des compétences
      `CREATE TABLE IF NOT EXISTS formation_competence_referentiel (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        intitule TEXT NOT NULL,
        code_activite TEXT,
        activite TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(intitule, code_activite)
      )`,

      // 8. Table de validation des compétences
      `CREATE TABLE IF NOT EXISTS formation_competence_validation (
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
        FOREIGN KEY (competence_id) REFERENCES formation_competence_referentiel(id) ON DELETE RESTRICT
      )`,

      // 9. Table de mapping activités FFCAM → Commissions
      `CREATE TABLE IF NOT EXISTS formation_activite_commission_mapping (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        activite_ffcam TEXT NOT NULL,
        code_activite TEXT,
        discipline TEXT,
        commission_id INTEGER NOT NULL,
        priorite INTEGER DEFAULT 0,
        actif INTEGER DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,

      // 9b. Table de mapping patterns de code brevet → Commissions
      `CREATE TABLE IF NOT EXISTS formation_brevet_pattern_commission_mapping (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code_pattern TEXT NOT NULL,
        exclude_pattern TEXT,
        commission_id INTEGER NOT NULL,
        priorite INTEGER DEFAULT 10,
        actif INTEGER DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,

      // 10. Tables de liaison Many-to-Many (Référentiels ↔ Commissions)
      `CREATE TABLE IF NOT EXISTS formation_niveau_commission (
        niveau_id INTEGER NOT NULL,
        commission_id INTEGER NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (niveau_id, commission_id),
        FOREIGN KEY (niveau_id) REFERENCES formation_niveau_referentiel(id) ON DELETE CASCADE
      )`,

      `CREATE TABLE IF NOT EXISTS formation_competence_commission (
        competence_id INTEGER NOT NULL,
        commission_id INTEGER NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (competence_id, commission_id),
        FOREIGN KEY (competence_id) REFERENCES formation_competence_referentiel(id) ON DELETE CASCADE
      )`,

      `CREATE TABLE IF NOT EXISTS formation_brevet_commission (
        brevet_id INTEGER NOT NULL,
        commission_id INTEGER NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (brevet_id, commission_id),
        FOREIGN KEY (brevet_id) REFERENCES formation_brevet_referentiel(id) ON DELETE CASCADE
      )`,

      // 14. Table de synchronisation
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

