/**
 * Service de mapping entre activités FFCAM et commissions CAF Lyon
 *
 * Permet de lier automatiquement les référentiels de formations FFCAM
 * (niveaux, compétences, brevets) aux commissions du club en fonction
 * de l'activité, du code activité et de la discipline.
 */

import { DatabaseAdapter } from '../types';

export class CommissionMapper {
  private db: DatabaseAdapter;
  private dryRun: boolean;

  constructor(db: DatabaseAdapter, dryRun: boolean = false) {
    this.db = db;
    this.dryRun = dryRun;
  }

  /**
   * Trouve les commissions correspondant à une activité FFCAM
   *
   * Logique de matching (par ordre de priorité):
   * 1. activite_ffcam + code_activite + discipline (le plus précis)
   * 2. activite_ffcam + code_activite
   * 3. activite_ffcam + discipline
   * 4. activite_ffcam seul (fallback)
   *
   * @param activite - Activité FFCAM (ex: "SPORTS DE NEIGE", "ESCALADE")
   * @param codeActivite - Code activité optionnel (ex: "SKI", "ESC")
   * @param discipline - Discipline optionnelle (ex: "Randonnée", "Piste")
   * @returns Liste des IDs de commissions triés par priorité (desc)
   */
  async findCommissions(
    activite: string | null | undefined,
    codeActivite?: string | null,
    discipline?: string | null
  ): Promise<number[]> {
    if (!activite) {
      return [];
    }

    try {
      // Normaliser les valeurs (uppercase, trim)
      const actNorm = activite.toUpperCase().trim();
      const codeNorm = codeActivite ? codeActivite.toUpperCase().trim() : null;
      const discNorm = discipline ? discipline.trim() : null;

      // Query avec tous les critères
      const [rows] = await this.db.execute(
        `SELECT DISTINCT commission_id, priorite
         FROM formation_activite_commission_mapping
         WHERE actif = 1
           AND UPPER(activite_ffcam) = ?
           AND (
             -- Match exact (activite + code + discipline)
             (code_activite = ? AND discipline = ?)
             OR
             -- Match activite + code
             (code_activite = ? AND discipline IS NULL AND ? IS NULL)
             OR
             -- Match activite + discipline
             (code_activite IS NULL AND discipline = ? AND ? IS NULL)
             OR
             -- Match activite seule
             (code_activite IS NULL AND discipline IS NULL)
           )
         ORDER BY priorite DESC, commission_id ASC`,
        [actNorm, codeNorm, discNorm, codeNorm, codeNorm, discNorm, discNorm]
      );

      if (rows.length === 0) {
        // Aucun mapping trouvé - logger pour analyse
        if (codeNorm || discNorm) {
          console.log(`   ⚠️  Activité non mappée: "${actNorm}" (code: ${codeNorm || 'N/A'}, discipline: ${discNorm || 'N/A'})`);
        }
        return [];
      }

      return rows.map((row: any) => row.commission_id);
    } catch (error: any) {
      console.error(`Erreur mapping commission pour "${activite}":`, error.message);
      return [];
    }
  }

  /**
   * Lie un niveau de pratique aux commissions correspondantes
   *
   * @param niveauId - ID du niveau dans formation_niveau_referentiel
   * @param activite - Activité du niveau (ex: "ESCALADE")
   * @param codeActivite - Code activité (ex: "ESC")
   * @param discipline - Discipline (ex: "Voie")
   */
  async linkNiveauToCommissions(
    niveauId: number,
    activite: string,
    codeActivite?: string | null,
    discipline?: string | null
  ): Promise<number> {
    const commissionIds = await this.findCommissions(activite, codeActivite, discipline);

    if (commissionIds.length === 0) {
      return 0;
    }

    if (this.dryRun) {
      return commissionIds.length;
    }

    let linkedCount = 0;
    for (const commissionId of commissionIds) {
      try {
        await this.db.execute(
          `INSERT INTO formation_niveau_commission (niveau_id, commission_id, created_at)
           VALUES (?, ?, NOW())
           ON DUPLICATE KEY UPDATE created_at = created_at`,
          [niveauId, commissionId]
        );
        linkedCount++;
      } catch (error: any) {
        // Ignorer les doublons ou erreurs de FK
        if (!error.message.includes('Duplicate entry')) {
          console.error(`Erreur liaison niveau ${niveauId} → commission ${commissionId}:`, error.message);
        }
      }
    }

    return linkedCount;
  }

  /**
   * Lie une compétence aux commissions correspondantes
   *
   * @param competenceId - ID de la compétence dans formation_competence_referentiel
   * @param activite - Activité de la compétence (ex: "Escalade", "Transversal")
   * @param codeActivite - Code activité (ex: "ESC")
   */
  async linkCompetenceToCommissions(
    competenceId: number,
    activite: string | null,
    codeActivite?: string | null
  ): Promise<number> {
    // Les compétences transversales (activite=null) ne sont pas mappées
    if (!activite || activite.toUpperCase() === 'TRANSVERSAL') {
      return 0;
    }

    const commissionIds = await this.findCommissions(activite, codeActivite, null);

    if (commissionIds.length === 0) {
      return 0;
    }

    if (this.dryRun) {
      return commissionIds.length;
    }

    let linkedCount = 0;
    for (const commissionId of commissionIds) {
      try {
        await this.db.execute(
          `INSERT INTO formation_competence_commission (competence_id, commission_id, created_at)
           VALUES (?, ?, NOW())
           ON DUPLICATE KEY UPDATE created_at = created_at`,
          [competenceId, commissionId]
        );
        linkedCount++;
      } catch (error: any) {
        if (!error.message.includes('Duplicate entry')) {
          console.error(`Erreur liaison compétence ${competenceId} → commission ${commissionId}:`, error.message);
        }
      }
    }

    return linkedCount;
  }

  /**
   * Lie un brevet aux commissions correspondantes
   *
   * Utilise le pattern matching pour associer les codes de brevet aux commissions
   * Ex: "BF1-ESC" matche le pattern "BF%-ESC%" → Commission Escalade
   *
   * @param brevetId - ID du brevet dans formation_brevet_referentiel
   * @param codeBrevet - Code du brevet (ex: "BF1-ESC", "PSC1")
   */
  async linkBrevetToCommissions(
    brevetId: number,
    codeBrevet: string
  ): Promise<number> {
    try {
      // Rechercher les commissions via pattern matching
      // Note: SQLite utilise LIKE, MySQL aussi - compatible
      const [rows] = await this.db.execute(
        `SELECT DISTINCT commission_id, priorite
         FROM formation_brevet_pattern_commission_mapping
         WHERE actif = 1
           AND ? LIKE code_pattern
           AND (
             exclude_pattern IS NULL
             OR ? NOT LIKE exclude_pattern
           )
         ORDER BY priorite DESC, commission_id ASC`,
        [codeBrevet, codeBrevet]
      );

      if (rows.length === 0) {
        // Brevet transversal ou non mappé (PSC1, PSE1, etc.)
        return 0;
      }

      const commissionIds = rows.map((row: any) => row.commission_id);

      if (this.dryRun) {
        return commissionIds.length;
      }

      let linkedCount = 0;
      for (const commissionId of commissionIds) {
        try {
          await this.db.execute(
            `INSERT INTO formation_brevet_commission (brevet_id, commission_id, created_at)
             VALUES (?, ?, NOW())
             ON DUPLICATE KEY UPDATE created_at = created_at`,
            [brevetId, commissionId]
          );
          linkedCount++;
        } catch (error: any) {
          if (!error.message.includes('Duplicate entry')) {
            console.error(`Erreur liaison brevet ${brevetId} (${codeBrevet}) → commission ${commissionId}:`, error.message);
          }
        }
      }

      return linkedCount;
    } catch (error: any) {
      console.error(`Erreur mapping brevet ${codeBrevet}:`, error.message);
      return 0;
    }
  }

}

export default CommissionMapper;
