/**
 * Classe de base pour tous les importeurs
 * Factorise le code commun (constructeur, boucle d'import, gestion des stats)
 */
import { DatabaseAdapter, Logger } from '../types';

abstract class BaseImporter<T> {
  protected db: DatabaseAdapter;
  protected logger: Logger;
  protected dryRun: boolean;

  constructor(db: DatabaseAdapter, logger: Logger, dryRun: boolean = false) {
    this.db = db;
    this.logger = logger;
    this.dryRun = dryRun;
  }

  /**
   * Méthodes abstraites à implémenter par les classes filles
   */
  protected abstract getDataKey(): 'formations' | 'brevets' | 'niveaux' | 'competences';
  protected abstract getSectionTitle(): string;
  protected abstract getReferentielKey(item: T): string;
  protected abstract validateItem(item: T): void;
  protected abstract importItemToDb(item: T, ...args: any[]): Promise<void>;
  protected abstract printReport(dryRun: boolean): void;

  /**
   * Template method pour l'import de données
   * Implémente la boucle commune à tous les importeurs
   * @param items - Les items à importer
   * @param _metadata - Métadonnées optionnelles (utilisées par certains importers comme niveaux)
   */
  async import(items: T[], _metadata?: any): Promise<void> {
    const dataKey = this.getDataKey();
    this.logger.section(this.getSectionTitle());

    for (const item of items) {
      // @ts-ignore - accès dynamique aux stats
      this.logger.stats[dataKey].total++;

      // Validation des données
      this.validateItem(item);

      // Alimenter le référentiel
      const refKey = this.getReferentielKey(item);
      // @ts-ignore - accès dynamique aux stats
      this.logger.stats.referentiels[dataKey].add(refKey);

      if (!this.dryRun) {
        await this.importItemToDb(item);
      } else {
        // En mode dry-run, simuler l'import
        // @ts-ignore - accès dynamique aux stats
        this.logger.stats[dataKey].imported++;
      }

      // Afficher la progression
      // @ts-ignore - accès dynamique aux stats
      this.logger.progress(
        this.logger.stats[dataKey].imported,
        this.logger.stats[dataKey].total
      );
    }

    this.printReport(this.dryRun);
  }
}

export default BaseImporter;
