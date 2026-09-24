/**
 * MySQL si les variables MYSQL_ADDON_* sont complètes, sinon SQLite local (développement du scraper).
 * Forçage : --mysql ou --sqlite.
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

export function determineAdapter(): 'sqlite' | 'mysql' {
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
  
  if (hasMySQL()) {
    return 'mysql';
  }
  
  return 'sqlite';
}

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

