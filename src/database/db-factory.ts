/**
 * Factory pour sélectionner automatiquement le bon adaptateur de base de données
 * - SQLite par défaut pour le développement local
 * - MySQL si configuré dans .env
 * - Forçage possible avec --sqlite ou --mysql
 */

import { DatabaseAdapter } from '../types';

function hasMySQL(): boolean {
  return !!(
    process.env.MYSQL_ADDON_HOST &&
    process.env.MYSQL_ADDON_USER &&
    process.env.MYSQL_ADDON_PASSWORD &&
    process.env.MYSQL_ADDON_DB
  );
}

/**
 * Détermine quel adaptateur utiliser
 */
export function determineAdapter(): 'sqlite' | 'mysql' {
  // Forçage via arguments
  if (process.argv.includes('--sqlite')) {
    return 'sqlite';
  }
  
  if (process.argv.includes('--mysql')) {
    if (!hasMySQL()) {
      console.error('❌ MySQL demandé mais non configuré dans .env');
      process.exit(1);
    }
    return 'mysql';
  }
  
  // Auto-détection : MySQL si configuré, sinon SQLite
  if (hasMySQL()) {
    return 'mysql';
  }
  
  return 'sqlite';
}

/**
 * Récupère l'instance de base de données appropriée
 */
export function getDatabase(): DatabaseAdapter {
  const adapter = determineAdapter();
  
  if (adapter === 'sqlite') {
    console.log('🗄️  Mode SQLite (développement local)');
    const { getInstance } = require('./sqlite-adapter');
    return getInstance();
  } else {
    console.log('🐬 Mode MySQL (production)');
    const { getInstance } = require('./connection');
    return getInstance();
  }
}

