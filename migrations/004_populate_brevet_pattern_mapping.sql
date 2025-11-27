-- ============================================================================
-- Mapping initial: Patterns de code brevet → Commissions CAF Lyon
-- ============================================================================
-- Basé sur la PR #1471 du projet plateforme-club-alpin
-- Format: BF%-{code_commission}% (excluant BFM-* dans certains cas)
--
-- Règles de priorité:
-- - 20: Pattern très spécifique (avec exclusion)
-- - 10: Pattern standard
-- ============================================================================

INSERT INTO formation_brevet_pattern_commission_mapping
(code_pattern, exclude_pattern, commission_id, priorite, actif)
VALUES

-- ============================================================================
-- ESCALADE (BF%-ESC%)
-- ============================================================================
('BF%-ESC%', 'BFM-%',
  (SELECT id_commission FROM caf_commission WHERE slug = 'escalade' LIMIT 1),
  20, 1),

-- Pattern secondaire sans exclusion (fallback si nécessaire)
('BF%-ESC%', NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'escalade' LIMIT 1),
  10, 1),

-- ============================================================================
-- ALPINISME (BF%-ALP%)
-- ============================================================================
('BF%-ALP%', 'BFM-%',
  (SELECT id_commission FROM caf_commission WHERE slug = 'alpinisme' LIMIT 1),
  20, 1),

('BF%-ALP%', NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'alpinisme' LIMIT 1),
  10, 1),

-- Cascade de glace → Alpinisme
('BF-CASCADE%', NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'alpinisme' LIMIT 1),
  10, 1),

('BF%-CASCADE%', NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'alpinisme' LIMIT 1),
  10, 1),

-- ============================================================================
-- RANDONNEE (BF%-RAND%)
-- ============================================================================
('BF%-RAND%', 'BFM-%',
  (SELECT id_commission FROM caf_commission WHERE slug = 'randonnee' LIMIT 1),
  20, 1),

('BF%-RAND%', NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'randonnee' LIMIT 1),
  10, 1),

-- ============================================================================
-- CANYON (BF%-CANYON%)
-- ============================================================================
('BF%-CANYON%', 'BFM-%',
  (SELECT id_commission FROM caf_commission WHERE slug = 'canyon' LIMIT 1),
  20, 1),

('BF%-CANYON%', NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'canyon' LIMIT 1),
  10, 1),

-- ============================================================================
-- SKI DE RANDONNEE (BF%-SKI%)
-- ============================================================================
('BF%-SKI%', 'BFM-%',
  (SELECT id_commission FROM caf_commission WHERE slug = 'ski-de-randonnee' LIMIT 1),
  20, 1),

('BF%-SKI%', NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'ski-de-randonnee' LIMIT 1),
  10, 1),

-- Nivo (nivologie) → Ski de randonnée
('BF%-NIVO%', NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'ski-de-randonnee' LIMIT 1),
  10, 1),

('BRV-NIVO%', NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'ski-de-randonnee' LIMIT 1),
  10, 1),

-- ============================================================================
-- VTT (BF%-VTT%)
-- ============================================================================
('BF%-VTT%', 'BFM-%',
  (SELECT id_commission FROM caf_commission WHERE slug = 'vtt' LIMIT 1),
  20, 1),

('BF%-VTT%', NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'vtt' LIMIT 1),
  10, 1),

-- ============================================================================
-- TRAIL (BF%-TRAIL%)
-- ============================================================================
('BF%-TRAIL%', 'BFM-%',
  (SELECT id_commission FROM caf_commission WHERE slug = 'trail' LIMIT 1),
  20, 1),

('BF%-TRAIL%', NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'trail' LIMIT 1),
  10, 1),

-- ============================================================================
-- VIA FERRATA (BF%-VIA%)
-- ============================================================================
('BF%-VIA%', 'BFM-%',
  (SELECT id_commission FROM caf_commission WHERE slug = 'via-ferrata' LIMIT 1),
  20, 1),

('BF%-VIA%', NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'via-ferrata' LIMIT 1),
  10, 1),

-- ============================================================================
-- SKI DE PISTE (si code distinct existe)
-- ============================================================================
('BF%-PISTE%', NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'ski-de-piste' LIMIT 1),
  10, 1),

-- ============================================================================
-- SKI DE FOND (si code distinct existe)
-- ============================================================================
('BF%-FOND%', NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'ski-de-fond' LIMIT 1),
  10, 1),

-- ============================================================================
-- RAQUETTE (si code distinct existe)
-- ============================================================================
('BF%-RAQUETTE%', NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'raquette' LIMIT 1),
  10, 1),

('BF%-RAQ%', NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'raquette' LIMIT 1),
  10, 1),

-- ============================================================================
-- SNOWBOARD (si code distinct existe)
-- ============================================================================
('BF%-SNOW%', NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'snowboard-rando' LIMIT 1),
  10, 1),

-- ============================================================================
-- MARCHE NORDIQUE (si code distinct existe)
-- ============================================================================
('BF%-NORDIC%', NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'marche-nordique' LIMIT 1),
  10, 1),

('BF%-MARCHE%', NULL,
  (SELECT id_commission FROM caf_commission WHERE slug = 'marche-nordique' LIMIT 1),
  10, 1);

-- ============================================================================
-- Note: Les brevets "transversaux" (PSC1, PSE1, BRV-SECU, BRV-JEUNE, etc.)
-- ne sont pas mappés et resteront sans commission.
-- Seuls les brevets techniques spécifiques à une activité sont mappés.
-- ============================================================================
