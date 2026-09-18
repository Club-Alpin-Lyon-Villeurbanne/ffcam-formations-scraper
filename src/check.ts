#!/usr/bin/env node
/**
 * Vérification de la configuration d'un club avant le premier import (lecture seule)
 *   1. variables d'environnement   2. fichier GC du club
 *   3. login SSO + accès extranet  4. base : commissions attendues vs caf_commission
 *
 * Utilisation : npm run check   (NODE_ENV=production npm run check)
 */
import * as fs from 'fs';
import * as path from 'path';
import { FFCAM_CONFIG, getClubCode, getClubConfigDir } from './config';
import { FfcamSsoError } from './auth/ffcam-sso';
import { loadGcMapping, getMappingStats } from './utils/gc-csv-mapping';
import { getAllMappedCommissionSlugs } from './utils/commission-mapping';
import { getDatabase } from './database/db-factory';
import NiveauxScraper from './scrapers/niveaux-scraper';

let failures = 0;
const ok = (m: string) => console.log(`  ✅ ${m}`);
const warn = (m: string, hint?: string) => { console.log(`  ⚠️  ${m}`); if (hint) console.log(`     👉 ${hint}`); };
const ko = (m: string, hint?: string) => { failures++; console.log(`  ❌ ${m}`); if (hint) console.log(`     👉 ${hint}`); };

async function main(): Promise<void> {
  console.log('🩺 VÉRIFICATION DE LA CONFIGURATION CLUB\n');

  console.log("1. Variables d'environnement");
  if (FFCAM_CONFIG.EMAIL && FFCAM_CONFIG.PASSWORD) ok(`FFCAM_EMAIL / FFCAM_PASSWORD définis (profil : "${FFCAM_CONFIG.PROFILE}")`);
  else ko('FFCAM_EMAIL / FFCAM_PASSWORD manquants', "Identifiants du portail FFCAM d'un compte ayant un profil extranet du club");
  let clubCode: string | null = null;
  try { clubCode = getClubCode(); ok(`CLUB_CODE=${clubCode}`); }
  catch (error: any) { ko(error.message, "4 premiers chiffres de vos numéros d'adhérent"); }
  let clubDir: string | null = null;
  try { clubDir = getClubConfigDir(); ok(`CLUB=${process.env.CLUB} → ${path.relative(process.cwd(), clubDir)}/`); }
  catch (error: any) { ko(error.message, 'Ajoutez CLUB=<identifiant> dans .env (ex. CLUB=chambery)'); }

  console.log('\n2. Mapping groupes de compétences → commissions');
  let gcCommissions = new Set<string>();
  if (clubDir) {
    const csvPath = path.join(clubDir, 'groupes-competences-commissions.csv');
    if (!fs.existsSync(csvPath)) ko(`Fichier absent : ${path.relative(process.cwd(), csvPath)}`, 'Copiez config/clubs/lyon/groupes-competences-commissions.csv et adaptez la colonne commission');
    else { const stats = getMappingStats(loadGcMapping(csvPath)); gcCommissions = stats.uniqueCommissions; ok(`${stats.totalGc} groupes de compétences, ${gcCommissions.size} commissions référencées`); }
  }

  console.log("\n3. Accès à l'extranet FFCAM");
  if (FFCAM_CONFIG.EMAIL && FFCAM_CONFIG.PASSWORD) {
    try {
      const probe = await new NiveauxScraper().probe();
      ok(`Login SSO et extranet OK : ${probe.records} niveaux de pratique visibles`);
      if (!probe.clubCode) warn("Impossible de lire le code club sur l'extranet (aucun niveau de pratique saisi ?)");
      else if (probe.clubCode === clubCode) ok(`Le profil extranet est bien celui du club ${clubCode}`);
      else ko(`Le profil extranet est celui du club ${probe.clubCode}, pas ${clubCode}`, 'Vérifiez CLUB_CODE, ou FFCAM_PROFILE si le compte a plusieurs profils');
    } catch (error: any) {
      if (error instanceof FfcamSsoError) ko(`Login SSO échoué (${error.step}) : ${error.message}`);
      else ko(`Extranet : ${error.message.split('\n')[0]}`);
    }
  }

  console.log('\n4. Base de données');
  const db = getDatabase();
  try {
    await db.connect();
    ok('Connexion établie');
    try {
      const [rows] = await db.execute('SELECT code_commission FROM caf_commission');
      const inDb = new Set((rows as Array<{ code_commission: string }>).map(r => r.code_commission));
      const needed = [...new Set([...getAllMappedCommissionSlugs(), ...gcCommissions])].sort();
      const missing = needed.filter(slug => !inDb.has(slug));
      ok(`${inDb.size} commissions en base`);
      if (missing.length === 0) ok('Toutes les commissions attendues par le mapping existent');
      else ko(`${missing.length} commission(s) absente(s) de caf_commission : ${missing.join(', ')}`, 'Créez-les dans la plateforme avec ce code_commission, sinon les liaisons correspondantes seront ignorées');
    } catch (error: any) {
      warn(`caf_commission illisible (${error.message.split('\n')[0]})`, 'Ce contrôle nécessite la base MySQL de la plateforme (MYSQL_ADDON_*)');
    }
    if (clubCode) {
      const [countRows] = await db.execute('SELECT COUNT(*) AS total FROM caf_user WHERE cafnum_user LIKE ?', [`${clubCode}%`]);
      const total = (countRows as any[])[0]?.total ?? 0;
      if (total > 0) ok(`${total} adhérents du club ${clubCode} dans caf_user`);
      else ko(`Aucun adhérent avec un cafnum en ${clubCode}… dans caf_user`, "Vérifiez CLUB_CODE, et que les adhérents sont importés dans la plateforme");
    }
  } catch (error: any) {
    ko(`Base de données : ${error.message.split('\n')[0]}`, 'Vérifiez les variables MYSQL_ADDON_* dans .env');
  } finally {
    if (db.isConnected()) await db.close();
  }

  console.log(failures === 0 ? '\n✅ Configuration prête. Étape suivante : npm run import:dry' : `\n❌ ${failures} problème(s) à corriger`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(error => { console.error('❌ Erreur inattendue :', error.message); process.exit(1); });
