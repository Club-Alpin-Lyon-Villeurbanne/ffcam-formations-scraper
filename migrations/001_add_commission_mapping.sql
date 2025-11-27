-- ============================================================================
-- Migration: Ajout des tables de mapping Activités FFCAM ↔ Commissions CAF
-- ============================================================================

-- Table de configuration du mapping Activités FFCAM → Commissions
CREATE TABLE IF NOT EXISTS formation_activite_commission_mapping (
  id INT AUTO_INCREMENT PRIMARY KEY,
  activite_ffcam VARCHAR(100) NOT NULL COMMENT 'Activité FFCAM en MAJUSCULES (ex: SPORTS DE NEIGE, ESCALADE)',
  code_activite VARCHAR(10) DEFAULT NULL COMMENT 'Code activité optionnel pour affiner le mapping (ex: SKI, ESC)',
  discipline VARCHAR(100) DEFAULT NULL COMMENT 'Discipline optionnelle pour affiner (ex: Randonnée, Piste)',
  commission_id INT NOT NULL COMMENT 'ID de la commission CAF cible',
  priorite INT DEFAULT 0 COMMENT 'Priorité du mapping (plus élevé = plus prioritaire)',
  actif TINYINT(1) DEFAULT 1 COMMENT 'Permet de désactiver un mapping sans le supprimer',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_activite_lookup (activite_ffcam, code_activite, discipline),
  INDEX idx_commission (commission_id),
  CONSTRAINT fk_mapping_commission
    FOREIGN KEY (commission_id)
    REFERENCES caf_commission(id_commission)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Mapping configurable entre activités FFCAM et commissions CAF';

-- ============================================================================
-- Tables de liaison Many-to-Many (Référentiels ↔ Commissions)
-- ============================================================================

-- Lien Niveaux de pratique ↔ Commissions
CREATE TABLE IF NOT EXISTS formation_niveau_commission (
  niveau_id INT NOT NULL COMMENT 'ID du niveau dans formation_niveau_referentiel',
  commission_id INT NOT NULL COMMENT 'ID de la commission CAF',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (niveau_id, commission_id),
  INDEX idx_niveau (niveau_id),
  INDEX idx_commission (commission_id),

  CONSTRAINT fk_niveau_comm_niveau
    FOREIGN KEY (niveau_id)
    REFERENCES formation_niveau_referentiel(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_niveau_comm_commission
    FOREIGN KEY (commission_id)
    REFERENCES caf_commission(id_commission)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Liaison entre niveaux de pratique et commissions';

-- Lien Compétences ↔ Commissions
CREATE TABLE IF NOT EXISTS formation_competence_commission (
  competence_id INT NOT NULL COMMENT 'ID de la compétence dans formation_competence_referentiel',
  commission_id INT NOT NULL COMMENT 'ID de la commission CAF',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (competence_id, commission_id),
  INDEX idx_competence (competence_id),
  INDEX idx_commission (commission_id),

  CONSTRAINT fk_comp_comm_competence
    FOREIGN KEY (competence_id)
    REFERENCES formation_competence_referentiel(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_comp_comm_commission
    FOREIGN KEY (commission_id)
    REFERENCES caf_commission(id_commission)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Liaison entre compétences et commissions';

-- Lien Brevets ↔ Commissions
CREATE TABLE IF NOT EXISTS formation_brevet_commission (
  brevet_id INT NOT NULL COMMENT 'ID du brevet dans formation_brevet_referentiel',
  commission_id INT NOT NULL COMMENT 'ID de la commission CAF',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (brevet_id, commission_id),
  INDEX idx_brevet (brevet_id),
  INDEX idx_commission (commission_id),

  CONSTRAINT fk_brevet_comm_brevet
    FOREIGN KEY (brevet_id)
    REFERENCES formation_brevet_referentiel(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_brevet_comm_commission
    FOREIGN KEY (commission_id)
    REFERENCES caf_commission(id_commission)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Liaison entre brevets et commissions';
