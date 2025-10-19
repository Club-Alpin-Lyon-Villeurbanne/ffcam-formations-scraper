/**
 * Gestion de la connexion à la base de données MySQL
 */
import * as mysql from 'mysql2/promise';
import { DatabaseAdapter } from '../types';
import { dbConfig } from '../config';

class DatabaseConnection implements DatabaseAdapter {
  private connection: mysql.Connection | null = null;

  /**
   * Initialise la connexion à la base de données
   */
  async connect(): Promise<void> {
    if (this.connection) {
      return;
    }

    try {
      this.connection = await mysql.createConnection(dbConfig);
      console.log('✅ Connecté à MySQL\n');
    } catch (error: any) {
      console.error('❌ Erreur connexion MySQL:', error.message);
      throw error;
    }
  }

  /**
   * Exécute une requête SQL
   */
  async execute(sql: string, params: any[] = []): Promise<[any[], any[]]> {
    if (!this.connection) {
      throw new Error('Connexion non établie. Appelez connect() d\'abord.');
    }
    return this.connection.execute(sql, params) as Promise<[any[], any[]]>;
  }

  /**
   * Récupère un utilisateur par son cafnum
   */
  async getUserIdFromCafnum(cafnum: string): Promise<number | null> {
    if (!this.connection) return null;

    try {
      const [rows] = await this.execute(
        'SELECT id_user FROM caf_user WHERE cafnum_user = ? LIMIT 1',
        [cafnum]
      );

      if (rows.length > 0) {
        return rows[0].id_user;
      }

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
    if (!this.connection) return;
    
    try {
      await this.execute(
        `INSERT INTO formation_last_sync (type, last_sync, records_count) 
         VALUES (?, NOW(), ?) 
         ON DUPLICATE KEY UPDATE 
         last_sync = NOW(), 
         records_count = VALUES(records_count)`,
        [type, count]
      );
    } catch (error: any) {
      console.error('Erreur update last sync:', error.message);
    }
  }

  /**
   * Ferme la connexion à la base de données
   */
  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }
  }

  /**
   * Vérifie si la connexion est active
   */
  isConnected(): boolean {
    return this.connection !== null;
  }
}

// Singleton pour éviter les connexions multiples
let instance: DatabaseConnection | null = null;

export function getInstance(): DatabaseConnection {
  if (!instance) {
    instance = new DatabaseConnection();
  }
  return instance;
}

