# ADR 0001 — Un programme pour plusieurs clubs, lancé automatiquement

Date : 2026-09-18 · Statut : accepté, complété le 2026-09-29

> Un ADR (*Architecture Decision Record*) raconte une décision importante et ses raisons. Les mots techniques sont expliqués dans le [glossaire](../glossaire.md).

## En bref

- Le programme se connecte seul à la FFCAM, avec l'e-mail et le mot de passe d'un compte du club.
- Un club est identifié par son code FFCAM à 4 chiffres (`CLUB_CODE`) et par un nom court (`CLUB`).
- `npm run check` vérifie tout, sans rien écrire, avant chaque import.
- GitHub Actions lance l'import chaque lundi, avec un environment GitHub par base.
- Depuis le 2026-09-29, le rangement des groupes de compétences est commun à tous les clubs, et chaque club a un fichier de correspondance de ses codes de commission.

## Contexte

Au départ, le programme ne servait qu'à Lyon :

- les débuts des numéros d'adhérent de Lyon étaient écrits en dur dans le code ;
- le rangement des groupes de compétences n'était pas versionné ;
- la session extranet (le `sid`) se copiait à la main depuis un navigateur, et expirait en quelques heures.

Chambéry voulait l'utiliser, et l'import devait tourner chaque semaine sans intervention.

## Décisions

### Connexion automatique au lieu du `sid` copié à la main

Le portail FFCAM (`portail.ffcam.fr`) ouvre une session extranet en 4 requêtes : connexion, choix de l'application Extranet, choix du profil, puis `login_sso.php`, qui renvoie le `sid`. `FFCAM_EMAIL` et `FFCAM_PASSWORD` remplacent donc l'ancienne variable `FFCAM_SESSION_ID`, supprimée.

L'API n'est pas officielle : chaque étape vérifie la réponse reçue, et échoue en nommant l'étape en cause. Le détail est dans [FFCAM-API.md](../FFCAM-API.md).

### Le club est identifié par son code FFCAM

Un numéro d'adhérent (cafnum) commence par les 4 chiffres du code du club (`CLUB_CODE`). Le programme garde les lignes dont le cafnum commence par ce code. Ce tri reste nécessaire, car la grille des brevets est nationale : environ 50 000 lignes, tous clubs confondus.

Les grilles des compétences et des niveaux indiquent aussi le code du club dans chaque ligne. Cela permet de vérifier que le profil extranet utilisé est bien celui du club configuré. Sinon, l'import refuse de tourner.

### Un dossier par club

Chaque club a son dossier `config/clubs/<CLUB>/`. `CLUB` n'a pas de valeur par défaut : on ne doit jamais charger, par erreur, la configuration d'un autre club.

Au départ, ce dossier contenait le rangement des groupes de compétences du club. Il contient désormais sa correspondance de codes (voir la mise à jour ci-dessous).

### Le rangement des codes FFCAM reste dans le code

Les référentiels de brevets, de formations et d'activités sont nationaux. Leur rangement par commission est donc écrit une seule fois, dans le code, pour tous les clubs.

À l'origine, on prévoyait d'ajouter un mécanisme pour traduire les codes de commission d'un club seulement si le besoin apparaissait. Il est apparu avec Chambéry : c'est la correspondance de la mise à jour du 2026-09-29.

### `npm run check` avant tout import

Cette vérification, en lecture seule, contrôle les variables, les fichiers du club, la connexion à la FFCAM et le club du profil, la présence des commissions attendues dans `caf_commission` et des adhérents du club dans `caf_user`.

L'import à blanc va plus loin : il range chaque élément sans rien écrire, pour faire remonter les alertes.

### GitHub Actions plutôt qu'une tâche planifiée chez l'hébergeur

Un environment GitHub par base cible (`lyon-staging`, `lyon-prod`, `chambery-prod`…) garde ses mots de passe. Chaque lundi, le `check` puis l'import tournent pour chaque environment.

GitHub désactive les tâches planifiées après 60 jours sans commit : un petit job, `keepalive`, les réactive à chaque run.

Avantages : aucun serveur à entretenir, des logs et des rapports conservés 90 jours, un e-mail en cas d'échec.

## Conséquences

- Ajouter un club, c'est un dossier `config/clubs/<club>/` et un environment GitHub, sans toucher au code. Voir [Ajouter un club](../ajouter-un-club.md).
- Si la FFCAM modifie son portail, l'import échoue au run suivant, en nommant l'étape en cause.
- Une page illisible après 4 essais, ou une erreur d'écriture en base, fait terminer l'import en échec. Un import incomplet ne doit jamais passer pour un succès.
- Écarté tant que le besoin n'est pas prouvé : la création automatique du tableau des groupes de compétences, l'ouverture automatique d'une issue en cas d'échec, et le tri de la grille des brevets par la FFCAM elle-même.

## Mise à jour du 2026-09-29

Chambéry range les groupes de compétences comme Lyon, mais ses commissions ont d'autres codes (`escalade-adulte`, `ski-alpinisme`…).

- Le tableau des groupes de compétences devient **commun** à tous les clubs : `config/groupes-competences-commissions.csv`.
- Chaque club déclare ses codes dans `config/clubs/<club>/correspondance-commissions.csv`. Ce fichier est obligatoire, même vide : un `CLUB` mal orthographié est ainsi refusé.
- Un club qui voudrait répartir les groupes de compétences autrement demanderait un tableau propre à son club. Ce n'est pas fait, tant que personne ne l'a demandé.
