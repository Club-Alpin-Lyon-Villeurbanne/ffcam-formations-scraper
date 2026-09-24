/**
 * Liaison des référentiels aux commissions du club : CSV du club pour les groupes de compétences,
 * patterns du code pour brevets, niveaux et formations. Les liaisons ne sont jamais supprimées.
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
  private commissionCache: Map<string, number | null> = new Map();

  private gcMapping: GcCommissionMapping | null = null;

  private warnings: MappingWarning[] = [];

  private stats = {
    competences: { total: 0, linked: 0, skipped: 0, lowCertainty: 0 },
    niveaux: { total: 0, linked: 0, skipped: 0, lowCertainty: 0 }
  };

  constructor(db: DatabaseAdapter, dryRun: boolean = false) {
    this.db = db;
    this.dryRun = dryRun;
  }

  initGcMapping(csvPath?: string): void {
    this.gcMapping = loadGcMapping(csvPath);
    console.log(`📂 Mapping GC chargé: ${this.gcMapping.size} groupes de compétences`);
  }

  getWarnings(): MappingWarning[] {
    return this.warnings;
  }

  /** Slugs demandés par les mappings mais absents de caf_commission */
  getMissingCommissions(): string[] {
    return [...this.commissionCache.entries()].filter(([, id]) => id === null).map(([slug]) => slug).sort();
  }

  printWarningsReport(): void {
    const missing = this.getMissingCommissions();
    if (missing.length > 0) {
      console.log(`\n⚠️  ${missing.length} COMMISSION(S) ABSENTE(S) de caf_commission : ${missing.join(', ')}`);
      console.log('   👉 Créez-les dans la plateforme avec ce code_commission (les liaisons correspondantes ont été ignorées).');
    }
    if (this.warnings.length === 0) {
      console.log('\n✅ Aucune alerte de mapping');
      return;
    }

    console.log(`\n⚠️  ${this.warnings.length} ALERTES DE MAPPING (certitude faible)\n`);

    const byType = this.warnings.reduce((acc, w) => {
      acc[w.type] = acc[w.type] || [];
      acc[w.type].push(w);
      return acc;
    }, {} as Record<string, MappingWarning[]>);

    for (const [type, warnings] of Object.entries(byType)) {
      console.log(`  ${type.toUpperCase()} (${warnings.length}):`);
      for (const w of warnings) {
        console.log(`    - "${w.intitule.substring(0, 50)}..." (${w.activite})`);
        console.log(`      → ${w.warning}`);
        if (w.suggestedCommission) {
          console.log(`      💡 Suggestion: ${w.suggestedCommission} (${w.certainty}%)`);
        }
      }
    }

    console.log('\n📊 Statistiques:');
    console.log(`   Compétences: ${this.stats.competences.linked}/${this.stats.competences.total} liées, ${this.stats.competences.lowCertainty} certitude faible`);
    console.log(`   Niveaux: ${this.stats.niveaux.linked}/${this.stats.niveaux.total} liés, ${this.stats.niveaux.lowCertainty} certitude faible`);
  }

  private async getCommissionId(code: string): Promise<number | null> {
    if (this.commissionCache.has(code)) {
      return this.commissionCache.get(code) ?? null;
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

      // Mémoriser l'absence pour éviter de relancer la requête
      this.commissionCache.set(code, null);
      return null;
    } catch (error: any) {
      // Table n'existe peut-être pas (SQLite dev) - ne pas cacher comme absente
      if (!error.message.includes('no such table')) {
        console.error(`Erreur recherche commission ${code}:`, error.message);
      }
      return null;
    }
  }

  /** @returns nombre de liaisons créées (un brevet peut relever de plusieurs commissions) */
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

  /** La discipline des métadonnées prime ; à défaut, elle est déduite de l'intitulé du niveau (avec une certitude). */
  async linkNiveau(
    niveauId: number,
    activite: string,
    discipline?: string | null,
    intituleNiveau?: string
  ): Promise<MappingResult> {
    this.stats.niveaux.total++;

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

    const result = getCommissionFromIntitule(intituleNiveau || '', activite);

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

  /** @returns nombre de liaisons créées d'après le CSV du club */
  async linkCompetenceFromCsv(
    competenceId: number,
    intitule: string
  ): Promise<number> {
    this.stats.competences.total++;

    if (!this.gcMapping) {
      throw new Error('Le mapping GC doit être initialisé avec initGcMapping() avant utilisation');
    }

    const commissions = getCommissionsForGc(this.gcMapping, intitule);

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

  /** @returns nombre de liaisons créées */
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
