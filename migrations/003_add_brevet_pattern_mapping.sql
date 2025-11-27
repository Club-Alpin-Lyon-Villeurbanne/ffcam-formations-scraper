-- ============================================================================
-- Migration: Ajout de la table de mapping patterns de brevets → Commissions
-- ============================================================================
-- Cette table permet de lier les brevets aux commissions en fonction de
-- patterns de code (ex: "BF%-ESC%" pour l'escalade)
-- Inspiré de la PR #1471 du projet plateforme-club-alpin
-- ============================================================================

-- Table de configuration des patterns de code brevet → Commissions
CREATE TABLE IF NOT EXISTS formation_brevet_pattern_commission_mapping (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code_pattern VARCHAR(50) NOT NULL COMMENT 'Pattern SQL LIKE pour matcher les codes brevet (ex: BF%-ESC%)',
  exclude_pattern VARCHAR(50) DEFAULT NULL COMMENT 'Pattern d''exclusion optionnel (ex: BFM-%)',
  commission_id INT NOT NULL COMMENT 'ID de la commission CAF cible',
  priorite INT DEFAULT 10 COMMENT 'Priorité du mapping (plus élevé = plus prioritaire)',
  actif TINYINT(1) DEFAULT 1 COMMENT 'Permet de désactiver un mapping sans le supprimer',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_pattern_lookup (code_pattern, actif),
  INDEX idx_commission (commission_id),
  CONSTRAINT fk_brevet_pattern_commission
    FOREIGN KEY (commission_id)
    REFERENCES caf_commission(id_commission)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Mapping par pattern entre codes de brevets FFCAM et commissions CAF';
