# Glossaire

Les mots qui reviennent dans cette documentation, du plus général au plus technique.

## La FFCAM et le club

**FFCAM** : Fédération française des clubs alpins et de montagne. Elle tient le dossier de chaque adhérent : ses stages, ses diplômes, ses niveaux.

**Portail FFCAM** (`portail.ffcam.fr`) : la porte d'entrée. On s'y connecte avec son e-mail et son mot de passe, puis on choisit l'application Extranet.

**Extranet FFCAM** (`extranet-clubalpin.com`) : le site réservé aux clubs. On y consulte les formations, brevets et niveaux des adhérents. Le programme le **lit** et n'y écrit jamais.

**Profil extranet** : le rôle d'un compte dans un club, par exemple « CLUB - WEBMASTER ». Un compte peut avoir plusieurs profils, dans plusieurs clubs. Le profil choisi détermine le club dont on voit les données.

**Cafnum** : le numéro d'adhérent FFCAM, sur 12 chiffres : le code du club (4), une année (4) et un numéro (4). Par exemple `6900 2024 0123` (fictif) pour un adhérent de Lyon.

**Code club** (`CLUB_CODE`) : les 4 premiers chiffres des cafnum d'un club. Lyon : `6900`, Chambéry : `7300`, Clermont-Ferrand : `6300`.

**Commission** : une activité du club, avec ses encadrants et ses sorties : escalade, alpinisme, canyon… Chaque club a sa propre liste, rangée dans la table `caf_commission` de son site.

**Code de commission** : l'identifiant technique d'une commission, en minuscules et sans accent, par exemple `escalade` ou `ski-alpin`. Deux clubs peuvent appeler la même activité différemment : le ski de randonnée s'appelle `ski-de-randonnee` à Lyon et `ski-alpinisme` à Chambéry.

## Les quatre types de données importées

| Type | Ce que c'est | Exemple |
|---|---|---|
| **Formation** | Un stage suivi, avec ses dates, son lieu et son formateur | `STG-FES10` « INITIATEUR Escalade Sites naturels Sportifs SNE FFCAM » |
| **Brevet** | Un diplôme d'encadrant | `BF1-ES-SAE` « INITIATEUR 1er degré Escalade SAE » (SAE : structure artificielle, le mur d'escalade) |
| **Niveau de pratique** | Le niveau validé dans une activité | « INITIE en escalade sur SAE » |
| **Groupe de compétences** (GC) | Un ensemble de savoir-faire validés | « 2.2 Progression sur glacier 1 » |

## Ce que le programme écrit en base

**Référentiel** : le catalogue de ce qui existe, un code et un intitulé par ligne. Exemple : « `BF1-ES-SAE` = INITIATEUR 1er degré Escalade SAE ». Il est le même pour tous les adhérents.

**Validation** : le fait qu'un adhérent ait obtenu un élément du référentiel, avec ses dates. Exemple : « tel adhérent a le brevet `BF1-ES-SAE` depuis juin 2023 ».

**Liaison**, ou **rattachement** : le lien entre un élément du référentiel et une commission. Exemple : « `BF1-ES-SAE` relève de la commission escalade ».

**Adhérent ignoré** : une ligne de l'extranet dont l'adhérent n'existe pas dans la base du site (ancien adhérent, adhésion pas encore reportée). Le programme ne l'écrit pas et la compte « ignorée ».

## Le rangement par commission

**Mapping** : l'ensemble des règles qui disent à quelle commission va chaque code FFCAM. Il est commun à tous les clubs et écrit avec les codes de commission de Lyon.

**Pattern** : une règle du mapping, qui reconnaît une famille de codes par leur début. Exemple : tout code de formation qui commence par `STG-FCA` va en `canyon`.

**Correspondance** : le petit fichier propre à chaque club (`config/clubs/<club>/correspondance-commissions.csv`) qui traduit les codes de Lyon vers ceux du club.

**Code sans commission** : un code FFCAM qu'aucun pattern ne reconnaît. Il est importé, mais rattaché à aucune commission, et le rapport d'import le signale.

## L'exécution

**Import** : une exécution complète. Le programme lit l'extranet et écrit dans la base.

**Import à blanc** (*dry-run*) : un import qui lit tout et vérifie tout, mais n'écrit rien en base. On s'en sert pour tester sans risque.

**`check`** : la vérification lancée juste avant chaque import, en lecture seule. Elle contrôle les réglages, la connexion à la FFCAM et à la base, et la présence des commissions attendues.

**Rapport** : le compte rendu affiché à la fin de chaque import : combien de lignes importées ou ignorées, et les alertes.

**SSO** (*single sign-on*) et **sid** : le programme se connecte au portail (SSO), qui lui ouvre une session sur l'extranet. Cette session est identifiée par un code, le `sid`.

## GitHub

**Dépôt** : le projet sur GitHub, avec son code et sa documentation. Il est public.

**GitHub Actions** : le service de GitHub qui exécute le programme tout seul, chaque lundi, sur ses propres machines.

**Workflow** et **run** : un workflow est une tâche automatique décrite dans `.github/workflows/`. Un run est une de ses exécutions.

**Environment** : un coffre de réglages pour une base cible : `lyon-staging`, `lyon-prod`, `chambery-prod`, `clermont-prod`. Il contient les mots de passe de cette base et les réglages du club.

**Secret** et **variable** : les deux sortes de réglages d'un environment. Un secret (mot de passe) devient illisible une fois saisi, même pour les administrateurs. Une variable (`CLUB`, `CLUB_CODE`) reste visible.

**Staging** et **prod** : `lyon-staging` est une base de test de Lyon, où l'on essaie sans risque. Les environments `-prod` sont les bases réelles des sites.

**PR** (*pull request*) : une proposition de modification du dépôt, relue puis acceptée (« mergée ») dans la branche principale `main`.

**ADR** (*Architecture Decision Record*) : une page qui raconte une décision importante et pourquoi on l'a prise. Ils sont dans [docs/adr/](adr/).
