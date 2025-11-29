/**
 * Service de liaison entre référentiels FFCAM et commissions CAF
 *
 * Utilise les patterns hardcodés pour associer les brevets/niveaux/compétences
 * aux commissions du club.
 */

import { DatabaseAdapter } from '../types';
import {
  getCommissionsForBrevet,
  getCommissionsForFormation,
  getCommissionForActivite
} from '../utils/commission-mapping';

export class CommissionLinker {
  private db: DatabaseAdapter;
  private dryRun: boolean;
  private commissionCache: Map<string, number> = new Map();

  constructor(db: DatabaseAdapter, dryRun: boolean = false) {
    this.db = db;
    this.dryRun = dryRun;
  }

  /**
   * Récupère l'ID d'une commission depuis son code (avec cache)
   */
  private async getCommissionId(code: string): Promise<number | null> {
    // Vérifier le cache
    if (this.commissionCache.has(code)) {
      return this.commissionCache.get(code) || null;
    }

    try {
      const [rows] = await this.db.execute(
        `SELECT id_commission FROM caf_commission WHERE code_commission = ? LIMIT 1`,
        [code]
      );

      if (rows && rows.length > 0) {
        const id = rows[0].id_commission;
        this.commissionCache.set(code, id);
        return id;
      }
    } catch (error: any) {
      // Table n'existe peut-être pas (SQLite dev)
      if (!error.message.includes('no such table')) {
        console.error(`Erreur recherche commission ${code}:`, error.message);
      }
    }

    return null;
  }

  /**
   * Lie un brevet à ses commissions correspondantes (many-to-many)
   *
   * Un brevet peut être lié à plusieurs commissions.
   *
   * @param brevetId - ID du brevet dans formation_brevet_referentiel
   * @param codeBrevet - Code du brevet (ex: "BF1-ESC")
   * @returns Nombre de liaisons créées
   */
  async linkBrevet(brevetId: number, codeBrevet: string): Promise<number> {
    const commissions = getCommissionsForBrevet(codeBrevet);
    if (commissions.length === 0) return 0;

    if (this.dryRun) return commissions.length;

    let linked = 0;

    for (const slug of commissions) {
      const commissionId = await this.getCommissionId(slug);
      if (!commissionId) continue;

      try {
        await this.db.execute(
          `INSERT IGNORE INTO formation_commission_brevet (brevet_id, commission_id)
           VALUES (?, ?)`,
          [brevetId, commissionId]
        );
        linked++;
      } catch (error: any) {
        if (!error.message.includes('Duplicate entry') && !error.message.includes('no such table')) {
          console.error(`Erreur liaison brevet ${codeBrevet} → ${slug}:`, error.message);
        }
      }
    }

    return linked;
  }

  /**
   * Lie un niveau de pratique à sa commission correspondante
   *
   * @param niveauId - ID du niveau dans formation_referentiel_niveau_pratique
   * @param activite - Activité FFCAM (ex: "ESCALADE")
   * @param discipline - Discipline optionnelle (ex: "Randonnée")
   * @returns true si liaison créée, false sinon
   */
  async linkNiveau(
    niveauId: number,
    activite: string,
    discipline?: string | null
  ): Promise<boolean> {
    const slug = getCommissionForActivite(activite, discipline);
    if (!slug) return false;

    if (this.dryRun) return true;

    const commissionId = await this.getCommissionId(slug);
    if (!commissionId) return false;

    try {
      await this.db.execute(
        `INSERT IGNORE INTO formation_commission_niveau_pratique (niveau_id, commission_id)
         VALUES (?, ?)`,
        [niveauId, commissionId]
      );
      return true;
    } catch (error: any) {
      if (!error.message.includes('Duplicate entry') && !error.message.includes('no such table')) {
        console.error(`Erreur liaison niveau → ${slug}:`, error.message);
      }
      return false;
    }
  }

  /**
   * Lie une compétence à sa commission correspondante
   *
   * @param competenceId - ID de la compétence dans formation_referentiel_groupe_competence
   * @param activite - Activité FFCAM (ex: "Escalade")
   * @returns true si liaison créée, false sinon
   */
  async linkCompetence(
    competenceId: number,
    activite: string | null
  ): Promise<boolean> {
    if (!activite) return false;

    const slug = getCommissionForActivite(activite);
    if (!slug) return false;

    if (this.dryRun) return true;

    const commissionId = await this.getCommissionId(slug);
    if (!commissionId) return false;

    try {
      await this.db.execute(
        `INSERT IGNORE INTO formation_commission_groupe_competence (groupe_competence_id, commission_id)
         VALUES (?, ?)`,
        [competenceId, commissionId]
      );
      return true;
    } catch (error: any) {
      if (!error.message.includes('Duplicate entry') && !error.message.includes('no such table')) {
        console.error(`Erreur liaison compétence → ${slug}:`, error.message);
      }
      return false;
    }
  }

  /**
   * Lie une formation à ses commissions correspondantes (many-to-many)
   *
   * @param formationId - ID de la formation dans formation_referentiel_formation
   * @param codeFormation - Code de la formation (ex: "STG-ES-001")
   * @returns Nombre de liaisons créées
   */
  async linkFormation(formationId: number, codeFormation: string): Promise<number> {
    const commissions = getCommissionsForFormation(codeFormation);
    if (commissions.length === 0) return 0;

    if (this.dryRun) return commissions.length;

    let linked = 0;

    for (const slug of commissions) {
      const commissionId = await this.getCommissionId(slug);
      if (!commissionId) continue;

      try {
        await this.db.execute(
          `INSERT IGNORE INTO formation_commission_formation (formation_id, commission_id)
           VALUES (?, ?)`,
          [formationId, commissionId]
        );
        linked++;
      } catch (error: any) {
        if (!error.message.includes('Duplicate entry') && !error.message.includes('no such table')) {
          console.error(`Erreur liaison formation ${codeFormation} → ${slug}:`, error.message);
        }
      }
    }

    return linked;
  }
}

export default CommissionLinker;
