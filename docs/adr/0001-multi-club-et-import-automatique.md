# ADR 0001 — Scraper multi-club et import automatique

Date : 2026-09-18 · Statut : accepté

## Contexte

Le scraper n'était utilisable que par Lyon : préfixes de cafnum hardcodés, mapping des groupes de compétences non versionné, et une session extranet (`sid`) copiée à la main depuis le navigateur, qui expire en quelques heures. Chambéry veut l'utiliser, et l'import doit tourner chaque semaine sans intervention.

## Décisions

**Login SSO au lieu du `sid` manuel.** Le portail FFCAM (`portail.ffcam.fr`) s'authentifie en 4 requêtes (login → application Extranet → profil → `login_sso.php`) qui rendent un `sid`. `FFCAM_EMAIL` / `FFCAM_PASSWORD` remplacent `FFCAM_SESSION_ID`, supprimé. API non officielle : chaque étape vérifie la réponse et échoue en nommant l'étape. Flux documenté dans `FFCAM-API.md`.

**Le club est identifié par son code FFCAM (`CLUB_CODE`, 4 chiffres).** Un cafnum = code club + année + numéro. Le filtre par code reste nécessaire : la grille des brevets est nationale (~49 000 lignes, tous clubs). Les grilles compétences et niveaux exposent le code club dans chaque ligne, ce qui permet de vérifier que le profil extranet est bien celui du club configuré ; `import` refuse de tourner sinon.

**Un dossier par club : `config/clubs/<CLUB>/`.** Le rattachement des groupes de compétences aux commissions dépend de l'organisation de chaque club ; le CSV y est versionné. `CLUB` n'a pas de valeur par défaut pour ne jamais charger le mapping d'un autre club.

**Le mapping FFCAM → slug de commission reste dans le code.** Les référentiels (brevets, formations, activités) sont nationaux. Si les slugs d'un club diffèrent de ceux du code, `npm run check` les liste ; un mécanisme d'alias sera ajouté seulement si le besoin apparaît.

**`npm run check` avant tout import.** Lecture seule : variables, CSV du club, login SSO + bon club, commissions attendues présentes dans `caf_commission`, adhérents du club dans `caf_user`. Le dry-run résout les mappings sans écrire pour remonter les alertes.

**GitHub Actions plutôt qu'un cron Clever Cloud.** Un environment GitHub par base cible (`lyon-staging`, `lyon`, `chambery`…) porte les secrets ; `check` puis `import` chaque lundi ; un job keepalive contourne la désactivation des crons après 60 jours sans commit. Zéro infrastructure, logs et rapports conservés 90 jours, e-mail en cas d'échec.

## Conséquences

- Onboarder un club = un `.env`, un dossier `config/clubs/<club>/` et un environment GitHub. Voir README.
- Une modification de l'API du portail casse l'import ; on le saura au run suivant, avec l'étape en cause.
- Une page injoignable après 4 tentatives ou une erreur d'écriture en base fait terminer l'import en erreur (rapport + code 1) : un import incomplet ne doit jamais passer pour un succès.
- Écarté tant que le besoin n'est pas prouvé : alias de slugs, génération automatique du CSV des GC, issue GitHub automatique en cas d'échec, filtrage côté serveur de la grille des brevets.
