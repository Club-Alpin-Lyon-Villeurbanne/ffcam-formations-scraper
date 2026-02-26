/**
 * Service de liaison entre référentiels FFCAM et commissions CAF
 *
 * Utilise le CSV pour les groupes de compétences (source de vérité)
 * et les patterns hardcodés pour les brevets/niveaux/formations.
 */

import { DatabaseAdapter } from '../types';
import {
  getCommissionsForBrevet,
  getCommissionsForFormation,
  getCommissionForActivite,
  getCommissionFromIntitule,
  MappingResult,
  CERTAINTY_THRESHOLD
} from '../utils/commission-mapping';
import {
  loadGcMapping,
  getCommissionsForGc,
  GcCommissionMapping,
} from '../utils/gc-csv-mapping';

/**
 * Alerte de mapping avec certitude faible
 */
export interface MappingWarning {
  type: 'competence' | 'niveau' | 'brevet' | 'formation';
  id: number;
  intitule: string;
  activite: string;
  certainty: number;
  warning: string;
  suggestedCommission?: string;
}

export class CommissionLinker {
  private db: DatabaseAdapter;
  private dryRun: boolean;
  private commissionCache: Map<string, number> = new Map();

  /** Mapping GC → Commissions chargé depuis le CSV */
  private gcMapping: GcCommissionMapping | null = null;

  /** Alertes collectées pendant le processus */
  private warnings: MappingWarning[] = [];

  /** Statistiques de mapping */
  private stats = {
    competences: { total: 0, linked: 0, skipped: 0, lowCertainty: 0 },
    niveaux: { total: 0, linked: 0, skipped: 0, lowCertainty: 0 }
  };

  constructor(db: DatabaseAdapter, dryRun: boolean = false) {
    this.db = db;
    this.dryRun = dryRun;
  }

  /**
   * Initialise le mapping GC depuis le fichier CSV
   *
   * @param csvPath - Chemin optionnel vers le CSV (par défaut: data/groupes-competences-commissions.csv)
   */
  initGcMapping(csvPath?: string): void {
    this.gcMapping = loadGcMapping(csvPath);
    console.log(`📂 Mapping GC chargé: ${this.gcMapping.size} groupes de compétences`);
  }

  /**
   * Récupère les alertes collectées
   */
  getWarnings(): MappingWarning[] {
    return this.warnings;
  }

  /**
   * Récupère les statistiques de mapping
   */
  getStats() {
    return this.stats;
  }

  /**
   * Réinitialise les alertes et statistiques
   */
  reset(): void {
    this.warnings = [];
    this.stats = {
      competences: { total: 0, linked: 0, skipped: 0, lowCertainty: 0 },
      niveaux: { total: 0, linked: 0, skipped: 0, lowCertainty: 0 }
    };
  }

  /**
   * Affiche un rapport des alertes
   */
  printWarningsReport(): void {
    if (this.warnings.length === 0) {
      console.log('\n✅ Aucune alerte de mapping');
      return;
    }

    console.log(`\n⚠️  ${this.warnings.length} ALERTES DE MAPPING (certitude faible)\n`);

    // Grouper par type
    const byType = this.warnings.reduce((acc, w) => {
      acc[w.type] = acc[w.type] || [];
      acc[w.type].push(w);
      return acc;
    }, {} as Record<string, MappingWarning[]>);

    for (const [type, warnings] of Object.entries(byType)) {
      console.log(`  ${type.toUpperCase()} (${warnings.length}):`);
      // Afficher les 5 premières
      for (const w of warnings.slice(0, 5)) {
        console.log(`    - "${w.intitule.substring(0, 50)}..." (${w.activite})`);
        console.log(`      → ${w.warning}`);
        if (w.suggestedCommission) {
          console.log(`      💡 Suggestion: ${w.suggestedCommission} (${w.certainty}%)`);
        }
      }
      if (warnings.length > 5) {
        console.log(`    ... et ${warnings.length - 5} autres`);
      }
    }

    console.log('\n📊 Statistiques:');
    console.log(`   Compétences: ${this.stats.competences.linked}/${this.stats.competences.total} liées, ${this.stats.competences.lowCertainty} certitude faible`);
    console.log(`   Niveaux: ${this.stats.niveaux.linked}/${this.stats.niveaux.total} liés, ${this.stats.niveaux.lowCertainty} certitude faible`);
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
   * Pour les SPORTS DE NEIGE, utilise d'abord la discipline si disponible,
   * sinon analyse l'intitulé du niveau pour déterminer la discipline.
   *
   * @param niveauId - ID du niveau dans formation_referentiel_niveau_pratique
   * @param activite - Activité FFCAM (ex: "ESCALADE", "SPORTS DE NEIGE")
   * @param discipline - Discipline optionnelle depuis les métadonnées (ex: "Randonnée")
   * @param intituleNiveau - Intitulé complet du niveau (ex: "PERFECTIONNE en snowboard de randonnée")
   * @returns MappingResult avec commission, certitude et éventuelles alertes
   */
  async linkNiveau(
    niveauId: number,
    activite: string,
    discipline?: string | null,
    intituleNiveau?: string
  ): Promise<MappingResult> {
    this.stats.niveaux.total++;

    // D'abord essayer avec la discipline si disponible
    if (discipline) {
      const slugFromDiscipline = getCommissionForActivite(activite, discipline);
      if (slugFromDiscipline) {
        const result: MappingResult = {
          commission: slugFromDiscipline,
          certainty: 100,
          source: 'discipline_field',
          matchedPattern: discipline
        };

        if (!this.dryRun) {
          const commissionId = await this.getCommissionId(slugFromDiscipline);
          if (commissionId) {
            try {
              await this.db.execute(
                `INSERT IGNORE INTO formation_commission_niveau_pratique (niveau_id, commission_id)
                 VALUES (?, ?)`,
                [niveauId, commissionId]
              );
              this.stats.niveaux.linked++;
            } catch (error: any) {
              if (!error.message.includes('Duplicate entry') && !error.message.includes('no such table')) {
                console.error(`Erreur liaison niveau → ${slugFromDiscipline}:`, error.message);
              }
            }
          }
        } else {
          this.stats.niveaux.linked++;
        }
        return result;
      }
    }

    // Sinon utiliser l'intitulé du niveau pour analyser la discipline
    const result = getCommissionFromIntitule(intituleNiveau || '', activite);

    // Collecter les alertes
    if (result.warning) {
      this.warnings.push({
        type: 'niveau',
        id: niveauId,
        intitule: intituleNiveau || '',
        activite: activite,
        certainty: result.certainty,
        warning: result.warning,
        suggestedCommission: result.matchedPattern ? result.commission || undefined : undefined
      });

      if (result.certainty > 0 && result.certainty < CERTAINTY_THRESHOLD) {
        this.stats.niveaux.lowCertainty++;
      }
    }

    if (!result.commission) {
      this.stats.niveaux.skipped++;
      return result;
    }

    if (this.dryRun) {
      this.stats.niveaux.linked++;
      return result;
    }

    const commissionId = await this.getCommissionId(result.commission);
    if (!commissionId) {
      this.stats.niveaux.skipped++;
      return result;
    }

    try {
      await this.db.execute(
        `INSERT IGNORE INTO formation_commission_niveau_pratique (niveau_id, commission_id)
         VALUES (?, ?)`,
        [niveauId, commissionId]
      );
      this.stats.niveaux.linked++;
      return result;
    } catch (error: any) {
      if (!error.message.includes('Duplicate entry') && !error.message.includes('no such table')) {
        console.error(`Erreur liaison niveau → ${result.commission}:`, error.message);
      }
      this.stats.niveaux.skipped++;
      return result;
    }
  }

  /**
   * Lie une compétence à ses commissions depuis le mapping CSV (many-to-many)
   *
   * Utilise le fichier CSV comme source de vérité pour le mapping GC → Commissions.
   * Un GC peut appartenir à plusieurs commissions.
   *
   * @param competenceId - ID de la compétence dans formation_referentiel_groupe_competence
   * @param intitule - Intitulé de la compétence (ex: "3.1 Mon matériel en snowboard de randonnée")
   * @returns Nombre de liaisons créées
   */
  async linkCompetenceFromCsv(
    competenceId: number,
    intitule: string
  ): Promise<number> {
    this.stats.competences.total++;

    if (!this.gcMapping) {
      throw new Error('Le mapping GC doit être initialisé avec initGcMapping() avant utilisation');
    }

    const commissions = getCommissionsForGc(this.gcMapping, intitule);

    // GC non trouvé dans le CSV
    if (commissions.length === 0) {
      this.warnings.push({
        type: 'competence',
        id: competenceId,
        intitule: intitule,
        activite: '',
        certainty: 0,
        warning: `GC non trouvé dans le CSV: "${intitule}"`,
      });
      this.stats.competences.skipped++;
      return 0;
    }

    // Mode dry-run
    if (this.dryRun) {
      this.stats.competences.linked++;
      return commissions.length;
    }

    let linked = 0;

    for (const slug of commissions) {
      const commissionId = await this.getCommissionId(slug);
      if (!commissionId) {
        console.warn(`Commission non trouvée en base: ${slug}`);
        continue;
      }

      try {
        await this.db.execute(
          `INSERT IGNORE INTO formation_commission_groupe_competence (groupe_competence_id, commission_id)
           VALUES (?, ?)`,
          [competenceId, commissionId]
        );
        linked++;
      } catch (error: any) {
        if (!error.message.includes('Duplicate entry') && !error.message.includes('no such table')) {
          console.error(`Erreur liaison compétence → ${slug}:`, error.message);
        }
      }
    }

    if (linked > 0) {
      this.stats.competences.linked++;
    } else {
      this.stats.competences.skipped++;
    }

    return linked;
  }

  /**
   * @deprecated Utiliser linkCompetenceFromCsv() qui utilise le CSV comme source de vérité
   *
   * Lie une compétence à sa commission correspondante (ancienne méthode basée sur patterns)
   *
   * Utilise l'intitulé pour déterminer la commission avec un degré de certitude.
   * Pour les SPORTS DE NEIGE, analyse l'intitulé pour distinguer ski, snowboard, raquette, etc.
   *
   * @param competenceId - ID de la compétence dans formation_referentiel_groupe_competence
   * @param activite - Activité FFCAM (ex: "ESCALADE", "SPORTS DE NEIGE")
   * @param intitule - Intitulé de la compétence (ex: "3.1 Mon matériel en snowboard de randonnée")
   * @returns MappingResult avec commission, certitude et éventuelles alertes
   */
  async linkCompetence(
    competenceId: number,
    activite: string | null,
    intitule?: string
  ): Promise<MappingResult> {
    this.stats.competences.total++;

    // Utiliser getCommissionFromIntitule qui gère aussi les activités NULL
    // en analysant l'intitulé pour identifier la commission
    const result = getCommissionFromIntitule(intitule || '', activite || '');

    // Collecter les alertes si certitude faible ou pas de mapping
    if (result.warning) {
      this.warnings.push({
        type: 'competence',
        id: competenceId,
        intitule: intitule || '',
        activite: activite || '',
        certainty: result.certainty,
        warning: result.warning,
        suggestedCommission: result.matchedPattern ? result.commission || undefined : undefined
      });

      if (result.certainty > 0 && result.certainty < CERTAINTY_THRESHOLD) {
        this.stats.competences.lowCertainty++;
      }
    }

    // Pas de commission identifiée
    if (!result.commission) {
      this.stats.competences.skipped++;
      return result;
    }

    // Mode dry-run
    if (this.dryRun) {
      this.stats.competences.linked++;
      return result;
    }

    // Créer la liaison en base
    const commissionId = await this.getCommissionId(result.commission);
    if (!commissionId) {
      this.stats.competences.skipped++;
      return {
        ...result,
        warning: `Commission non trouvée en base: ${result.commission}`
      };
    }

    try {
      await this.db.execute(
        `INSERT IGNORE INTO formation_commission_groupe_competence (groupe_competence_id, commission_id)
         VALUES (?, ?)`,
        [competenceId, commissionId]
      );
      this.stats.competences.linked++;
      return result;
    } catch (error: any) {
      if (!error.message.includes('Duplicate entry') && !error.message.includes('no such table')) {
        console.error(`Erreur liaison compétence → ${result.commission}:`, error.message);
      }
      this.stats.competences.skipped++;
      return {
        ...result,
        warning: `Erreur DB: ${error.message}`
      };
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
