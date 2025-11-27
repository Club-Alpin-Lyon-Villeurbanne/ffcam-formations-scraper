-- ============================================================================
-- Mapping initial: Activités FFCAM → Commissions CAF Lyon
-- ============================================================================
-- Basé sur l'analyse des données existantes et la structure des commissions
--
-- Règles de priorité:
-- - 10: Mapping exact et sans ambiguïté
-- -  8: Mapping avec discipline mais sans code
-- -  5: Mapping avec code mais sans discipline (fallback)
-- -  3: Mapping générique (activité seule)
-- ============================================================================

INSERT INTO formation_activite_commission_mapping
(activite_ffcam, code_activite, discipline, commission_id, priorite, actif)
VALUES
-- ============================================================================
-- ESCALADE
-- ============================================================================
('ESCALADE', NULL, NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'escalade' LIMIT 1),
  10, 1),

-- Cas particuliers escalade
('ESCALADE', NULL, 'SAE',
  (SELECT id_commission FROM caf_commission WHERE slug = 'escalade' LIMIT 1),
  10, 1),

('ESCALADE', NULL, 'Falaise',
  (SELECT id_commission FROM caf_commission WHERE slug = 'escalade' LIMIT 1),
  10, 1),

-- ============================================================================
-- ALPINISME
-- ============================================================================
('ALPINISME', NULL, NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'alpinisme' LIMIT 1),
  10, 1),

-- Alpinisme avec spécialisations
('ALPINISME', NULL, 'Rocher',
  (SELECT id_commission FROM caf_commission WHERE slug = 'alpinisme' LIMIT 1),
  10, 1),

('ALPINISME', NULL, 'Mixte',
  (SELECT id_commission FROM caf_commission WHERE slug = 'alpinisme' LIMIT 1),
  10, 1),

('ALPINISME', NULL, 'Glace',
  (SELECT id_commission FROM caf_commission WHERE slug = 'alpinisme' LIMIT 1),
  10, 1),

-- Cascade de glace → Alpinisme
('CASCADE DE GLACE', NULL, NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'alpinisme' LIMIT 1),
  10, 1),

-- ============================================================================
-- RANDONNEE
-- ============================================================================
('RANDONNEE', NULL, NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'randonnee' LIMIT 1),
  10, 1),

('RANDONNEE MONTAGNE', NULL, NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'randonnee' LIMIT 1),
  10, 1),

-- Randonnée avec glacier peut aussi être Alpinisme (priorité moindre)
('RANDONNEE', NULL, 'Glacier',
  (SELECT id_commission FROM caf_commission WHERE slug = 'randonnee' LIMIT 1),
  8, 1),

('RANDONNEE', NULL, 'Glacier',
  (SELECT id_commission FROM caf_commission WHERE slug = 'alpinisme' LIMIT 1),
  5, 1),

-- Trail
('TRAIL', NULL, NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'trail' LIMIT 1),
  10, 1),

-- ============================================================================
-- DESCENTE DE CANYON
-- ============================================================================
('DESCENTE DE CANYON', NULL, NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'canyon' LIMIT 1),
  10, 1),

('CANYON', NULL, NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'canyon' LIMIT 1),
  10, 1),

-- ============================================================================
-- VELO DE MONTAGNE
-- ============================================================================
('VELO DE MONTAGNE', NULL, NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'vtt' LIMIT 1),
  10, 1),

('VTT', NULL, NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'vtt' LIMIT 1),
  10, 1),

-- ============================================================================
-- SPORTS DE NEIGE (cas complexe - plusieurs commissions possibles)
-- ============================================================================

-- Ski de randonnée (priorité la plus haute pour SKI + Randonnée)
('SPORTS DE NEIGE', 'SKI', 'Randonnée',
  (SELECT id_commission FROM caf_commission WHERE slug = 'ski-de-randonnee' LIMIT 1),
  10, 1),

('SPORTS DE NEIGE', 'SKI', 'Alpinisme',
  (SELECT id_commission FROM caf_commission WHERE slug = 'ski-de-randonnee' LIMIT 1),
  10, 1),

-- Fallback SKI sans discipline → Ski de randonnée
('SPORTS DE NEIGE', 'SKI', NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'ski-de-randonnee' LIMIT 1),
  5, 1),

-- Raquette
('SPORTS DE NEIGE', 'RAQUETTE', NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'raquette' LIMIT 1),
  10, 1),

('SPORTS DE NEIGE', NULL, 'Raquette',
  (SELECT id_commission FROM caf_commission WHERE slug = 'raquette' LIMIT 1),
  8, 1),

-- Ski de piste
('SPORTS DE NEIGE', NULL, 'Piste',
  (SELECT id_commission FROM caf_commission WHERE slug = 'ski-de-piste' LIMIT 1),
  8, 1),

('SPORTS DE NEIGE', 'SKI', 'Piste',
  (SELECT id_commission FROM caf_commission WHERE slug = 'ski-de-piste' LIMIT 1),
  10, 1),

-- Ski de fond
('SPORTS DE NEIGE', NULL, 'Fond',
  (SELECT id_commission FROM caf_commission WHERE slug = 'ski-de-fond' LIMIT 1),
  8, 1),

('SPORTS DE NEIGE', 'SKI', 'Fond',
  (SELECT id_commission FROM caf_commission WHERE slug = 'ski-de-fond' LIMIT 1),
  10, 1),

-- Snowboard
('SPORTS DE NEIGE', 'SNOWBOARD', 'Randonnée',
  (SELECT id_commission FROM caf_commission WHERE slug = 'snowboard-rando' LIMIT 1),
  10, 1),

('SPORTS DE NEIGE', 'SNOWBOARD', 'Alpin',
  (SELECT id_commission FROM caf_commission WHERE slug = 'snowboard-alpin' LIMIT 1),
  10, 1),

-- Fallback générique SPORTS DE NEIGE → Ski de randonnée (le plus courant)
('SPORTS DE NEIGE', NULL, NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'ski-de-randonnee' LIMIT 1),
  3, 1),

-- ============================================================================
-- VIA FERRATA
-- ============================================================================
('VIA FERRATA', NULL, NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'via-ferrata' LIMIT 1),
  10, 1),

-- ============================================================================
-- MARCHE NORDIQUE
-- ============================================================================
('MARCHE NORDIQUE', NULL, NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'marche-nordique' LIMIT 1),
  10, 1),

-- ============================================================================
-- FORMATION / SECURITE
-- ============================================================================
('FORMATION', NULL, NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'formation' LIMIT 1),
  10, 1),

('SECURITE', NULL, NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'formation' LIMIT 1),
  10, 1);

-- ============================================================================
-- Note: Les activités "transversales" (sans code ni activité spécifique)
-- ne seront pas mappées automatiquement et resteront sans commission.
-- Exemples: "Gestion de groupe", "Premiers secours" etc.
-- ============================================================================
