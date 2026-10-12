# Cinq agents pour faire de ton hub un système d'exploitation personnel

## La cible, décrite comme si elle tournait déjà

**Lundi 2 novembre 2026, 07:00.** Ton tableau de bord ne s'ouvre plus sur des casiers de mails : il s'ouvre sur un **Brief**, c'est-à-dire quelques cartes classées par impact, à côté d'une boîte d'**Approbations**. Le journal temps réel que tu connais est devenu le bus de six agents. Pendant la nuit, sans toi :

- **02:10 — SISMOGRAPHE** a porté ton scénario « détroit de Taïwan » au niveau 3. Le signal est corroboré par 9 sources indépendantes, dont 2 officielles, et par une rafale de modifications sur Wikipédia en 3 langues. Il l'a chiffré sur ton patrimoine : 2,8 % du portefeuille est exposé, et un stress test à −30 % donne −0,8 %. Le push est retenu jusqu'à 07:30, fin des heures calmes, soit 1 h 30 avant l'ouverture de la Bourse de Paris.
- **03:20 — FORGE** a réparé un collecteur de veille cassé par la refonte d'un site. Il lui a fallu 8 minutes : les tests sont verts, la nouvelle collecte prolonge bien la précédente, et la modification s'annule en un clic.
- **04:15 — ARGENTIER** a clôturé octobre :
  - 139 opérations sur 142 sont justifiées par leur facture, et les 3 pièces manquantes sont listées ;
  - une hausse d'abonnement a été repérée ;
  - ton versement de novembre est préparé pour ramener la poche « Émergents » dans sa bande, sans rien vendre.
- **PRÉCEPTEUR et SOURCIER** tournent en fond. Le plan de révision a été recalculé à 05:30, et les signaux de prospection seront relevés dès 08:00.

Ce qui te reste ce matin : lire 3 cartes, et décider si tu passes l'ordre préparé.

La suite décrit les cinq agents qui produisent cette matinée, le câblage qui les fait coopérer, puis le chemin à rebours jusqu'à ton hub actuel.

*Tous les montants, noms et dates des scénarios sont des exemples.*

## Hypothèses

Ton logiciel n'est pas visible d'ici. Voici ce que je suppose ; si un point est faux, corrige-le, l'architecture reste valable.

1. **Stack inconnue.** Je donne des contrats indépendants du langage (format d'événement, manifeste d'agent). Les implémentations sont en Python + SQLite, puisque tes agents exécuteront des scripts Python. Chaque script déclare ses dépendances en tête de fichier (PEP 723) et se lance avec `uv run --script`.
2. **Tu es en France.** J'utilise donc les sources de données, les règles CNIL, la DSP2 et la fiscalité françaises.
3. **Tes « études »** sont un cursus en cours (université, école ou certification) sur une plateforme de type Moodle. **Ta « prospection B2B »** consiste à vendre un service à des entreprises françaises.
4. **Tes ETF** sont en PEA et/ou en compte-titres, chez un courtier sans API publique, ce qui est fréquent chez les courtiers grand public. Si le tien en a une, elle remplace simplement l'extraction des PDF (voir ARGENTIER).
5. **Où tourne le hub.** Deux montages sont prévus.
   - *Sur ton PC*, fixe ou portable, tout fonctionne tel que décrit. Sur un portable, les tâches de nuit s'exécutent au réveil grâce à l'option de rattrapage du planificateur (ex. `misfire_grace_time` dans APScheduler).
   - *Sur une machine sans écran* allumée en permanence (NAS, mini-PC serveur), les alertes passent par ntfy et par ton tableau de bord. Trois composants supposent ton écran ou tes fichiers, et sont adaptés :
     - Anki tourne sur un affichage virtuel (§4) ;
     - ActivityWatch, qui mesure l'écran de ton PC, n'est pas utilisé (§4) ;
     - FORGE analyse des clones de tes dépôts (§5).
6. **« Sans mon intervention »** s'entend en régime de croisière. Quatre gestes restent humains par construction :
   - renouveler l'accès bancaire, au plus tous les 180 jours, comme l'impose la réglementation ;
   - valider une fois chaque campagne de prospection ;
   - tout acte financier irréversible (passer un ordre, payer) ;
   - déposer tes devoirs.

## Les cinq agents en un coup d'œil

| Agent | Domaine | Ce qu'il fait sans toi | Ce qui reste à toi |
|---|---|---|---|
| ARGENTIER | Finances, ETF, tableaux de bord | rapproche banque et factures, clôture le mois, radiographie tes ETF, prépare le versement qui corrige la dérive | renouveler l'accès bancaire, passer l'ordre |
| SISMOGRAPHE | Veille géopolitique, agrégation web | suit tes scénarios, corrobore les signaux, chiffre ton exposition | définir les scénarios |
| SOURCIER | Prospection B2B, CRM | repère les entreprises qui expriment un besoin, écrit, relance, prend les RDV | valider une campagne, mener le RDV |
| PRÉCEPTEUR | Études | récupère les cours, crée les cartes Anki, planifie à rebours, surveille les rendus | réviser, rendre tes devoirs |
| FORGE | Dev, santé du hub | répare les agents, prépare et teste les correctifs de CVE, surveille expirations et sauvegardes | approuver ce qui sort de son périmètre |

---

## 1. ARGENTIER — finances, ETF, tableaux de bord

### Nom de code et mission principale

**ARGENTIER.** Sa mission : tenir, sans saisie de ta part, une comptabilité personnelle exacte au centime et un portefeuille dont tu connais l'exposition réelle. Il transforme ensuite ces chiffres en décisions déjà préparées.

Ce qui le rend inédit :
- **Rapprochement à trois voies.** Chaque ligne bancaire est reliée à la facture du casier « factures » et à une catégorie de budget. Tout euro dépensé a sa pièce justificative ; sinon, il devient une alerte.
- **Radiographie (look-through) des ETF.** L'exposition est agrégée par entreprise, pays, secteur et devise. Les chevauchements entre ETF sont mis en évidence, et les frais annuels sont exprimés en euros.
- **Rééquilibrage sans vente.** C'est le prochain versement qui corrige la dérive : aucune cession, donc aucune plus-value imposable.

### Capacités techniques requises

**Scripts** (planifiés par le noyau, voir §6)

| Script | Rôle | Déclenchement |
|---|---|---|
| `banque_import.py` | import bancaire | chaque jour, 05:00 |
| `cloture.py` | clôture du mois | 1er jour ouvré du mois, 04:00 |
| `positions.py` | positions du portefeuille | à chaque avis d'opéré ou d'opération sur titres ; valorisation chaque jour ouvré à 21:00 |
| `lookthrough.py` | radiographie des ETF | chaque dimanche, 03:00 |
| `fiscal.py` | rapprochement fiscal | à réception de l'IFU |

Règles de calcul :
- Tous les calculs se font en Python, jamais par un LLM : XIRR (`pyxirr`), dérive par rapport aux bandes, plus-values du compte-titres au prix moyen pondéré d'acquisition (règle française, art. 150-0 D du CGI).
- Quantités et montants sont des `decimal.Decimal`, jamais des flottants : avec une tolérance nulle, une erreur d'arrondi binaire (`0.1 + 0.2 != 0.3`) suffirait à créer un faux écart.
- Les paramètres fiscaux sont dans un fichier daté, jamais en dur. Chaque taux y est rangé par catégorie de revenu, avec sa date d'effet, car une même loi peut traiter les catégories différemment. Exemple :
  - la LFSS 2026 (loi n° 2025-1403 du 30 décembre 2025, art. 12) a porté la CSG sur les revenus du capital de 9,2 % à 10,6 % (art. L136-8 du Code de la sécurité sociale) ;
  - les prélèvements sociaux passent donc de 17,2 % à 18,6 % (CSG 10,6 + CRDS 0,5 + prélèvement de solidarité 7,5), et le PFU de 30 % à 31,4 % (12,8 + 18,6) ;
  - le nouveau taux s'applique aux gains de PEA et aux revenus de placement (dividendes, intérêts) depuis le 1er janvier 2026, et aux plus-values de cession du compte-titres dès celles de 2025, imposées en 2026 ;
  - l'assurance-vie, les revenus fonciers et les plus-values immobilières restent à 17,2 %.

**Accès fichiers**
- *Lecture* :
  - les casiers « factures » et « banque », plus un nouveau casier « bourse » (avis d'opéré, avis d'opérations sur titres, relevés, IFU), tous remplis par l'Agent Mail ;
  - un dossier de secours `~/HubOS/inbox/banque/`, surveillé avec `watchdog`, pour déposer des exports CSV ou OFX.
- *Écriture* :
  - les pièces dans `~/Documents/Finances/AAAA/MM/`, renommées `AAAA-MM-JJ_Marchand_Montant.pdf` ;
  - le classeur `Tableau_de_bord_AAAA.xlsx` (via openpyxl, une feuille par mois) ;
  - la base `finances.sqlite`.

**Requêtes réseau**
- **Comptes de paiement** : API Enable Banking (`https://api.enablebanking.com`).
  - Son mode « restricted » est gratuit pour un usage individuel non commercial. Il ne donne accès qu'aux comptes que tu as liés dans son Control Panel.
  - L'authentification se fait par un JWT signé en RS256 avec la clé de ton application.
  - Le consentement dure jusqu'à 180 jours, selon la banque.
  - Sans ta présence, la réglementation limite l'accès à 4 fois par 24 h (RTS DSP2, règlement délégué (UE) 2018/389, art. 36(5)). Un import quotidien suffit : la banque ne publie de toute façon pas les opérations en temps réel.
  - Seules les opérations comptabilisées (`status` = `BOOK`) entrent dans le grand livre. Les opérations en attente (`PDNG`) sont affichées à part et jamais rapprochées, car elles réapparaissent ensuite comptabilisées, souvent sous un autre identifiant.
  - Clé d'import : `entry_reference`, l'identifiant que la banque attribue à l'opération, unique et stable pour un compte donné. S'il manque, l'agent prend une empreinte (compte, date, montant, libellé) complétée d'un rang d'occurrence : deux cafés identiques le même jour restent deux lignes, et un réimport n'en ajoute pas une troisième.
  - *À éviter* : GoCardless Bank Account Data (ex-Nordigen), souvent cité, n'accepte plus de nouvelles inscriptions depuis 2025.
- **PEA, compte-titres, assurance-vie** : ces comptes ne relèvent pas de la DSP2, donc il n'existe pas d'API bancaire standard.
  - Les positions sont reconstruites à partir des PDF du casier « bourse », avec `pdfplumber` et une règle d'extraction par courtier. Deux types de pièces comptent : les avis d'opéré (achats, ventes) et les avis d'opérations sur titres, ou OST (division, regroupement, fusion de fonds, changement d'ISIN). Une OST change la quantité détenue sans achat ni vente.
  - Chaque mois, les positions sont rapprochées quantité par quantité avec le relevé du courtier. La tolérance est nulle sur l'écart **inexpliqué**. Deux motifs d'écart sont reconnus :
    - même ISIN, un rapport relevé / reconstruction égal à une fraction p/q d'entiers inférieurs ou égaux à 20 (4/1, 1/10, 3/2…), *et* un cours, tel que l'agent l'enregistre chaque soir, divisé par ce même rapport d'une séance à l'autre, à 5 % près : c'est une division ou un regroupement. Sans ce saut de cours, un rapport de 2 peut tout aussi bien venir d'un achat dont l'avis manque, et l'écart reste inexpliqué ;
    - un ISIN qui disparaît et un autre qui apparaît à la même date : c'est une fusion de fonds ou un changement de part.
  - Pour un motif reconnu, l'agent propose dans les Approbations une écriture d'OST au rapport constaté. Le coût total ne change pas, et le prix moyen d'acquisition unitaire est divisé par le rapport. L'écart reste « expliqué, en attente » (*warning*) jusqu'à ton clic. Si l'avis d'OST du courtier est déjà dans le casier, l'écriture est passée d'office.
  - Tout autre écart est inexpliqué (*error*).
  - Si ton courtier a une API (ex. Flex Web Service chez Interactive Brokers), elle remplace l'extraction PDF.
- **Prix** : EODHD (`https://eodhd.com/api/eod/{TICKER}.PA?api_token=…&fmt=json`).
  - L'offre gratuite donne 20 appels par jour et 1 an d'historique, ce qui suffit jusqu'à une quinzaine de lignes.
  - Chaque prix est comparé à la valeur liquidative (VL) publiée par l'émetteur. Au-delà d'un écart paramétrable (1 % par défaut), la donnée est mise en quarantaine. Ce seuil est à relever pour les ETF obligataires, car un ETF peut s'écarter de sa VL quand le marché est tendu.
- **Taux de change** : BCE, sans clé (`https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=csvdata`).
- **Correspondance ISIN → ticker** : OpenFIGI (`POST https://api.openfigi.com/v3/mapping`), 25 requêtes par minute sans clé.
- **Compositions d'ETF** : fichiers CSV ou XLSX publiés par chaque émetteur.
  - *Piège traité* : un ETF **synthétique** publie son panier de substitution, pas l'indice qu'il réplique. C'est le cas des ETF « Monde » éligibles au PEA, dont le panier est composé d'actions européennes. L'agent prend alors la composition d'un ETF physique qui réplique le même indice.
  - À défaut, il utilise la répartition pays et secteur de la fiche mensuelle de l'indice, moins détaillée.
  - L'exposition « pays » est le pays de rattachement des sociétés (siège ou cotation) indiqué dans les fichiers, pas l'origine de leur chiffre d'affaires.

**Rapprochement — règles exactes**
- **Facture.** Une ligne correspond à une facture si trois conditions sont réunies :
  - le montant est identique à ±0,01 € ; une facture en devise est convertie au taux BCE du jour de l'opération, à ±3 % près pour les frais de change de la carte ;
  - la date est à ±5 jours ;
  - le libellé est proche : similarité d'au moins 60 sur 100 (`rapidfuzz`, `token_set_ratio`) entre le libellé bancaire normalisé et le nom du marchand, ou domaine de l'expéditeur de la facture présent dans le libellé.
- **Abonnement.** Au moins 3 débits du même marchand et du même montant, chacun tombant à la date du précédent plus 1 mois civil (`relativedelta`), à ±4 jours près pour les week-ends, jours fériés et fins de mois ; ou 2 débits de même montant à 1 an d'écart, à ±7 jours. Un débit attendu qui arrive avec un autre montant est une hausse, ou une baisse, d'abonnement.
- **Double débit suspect** : *warning*, ou *error* à partir de 300 €, jamais *critical*. Le délai légal de contestation est de 13 mois (art. L133-24 du Code monétaire et financier) : rien ne se joue donc à l'heure près. Ce n'est pas le doublon d'import, que la clé `entry_reference` élimine déjà, mais deux débits comptabilisés distincts, du même marchand et du même montant, à moins de 48 h d'écart. Ils ne sont signalés que si trois conditions sont réunies :
  - le montant atteint 20 € (seuil réglable) : deux cafés à 3,20 € ne sont même pas examinés ;
  - le couple (marchand, montant) est inhabituel, avec moins de 3 occurrences sur les 90 jours précédents : tes recharges de transport habituelles ne sont donc pas signalées. Exception : un abonnement reconnu débité deux fois dans la même période est toujours suspect ;
  - l'Agent Mail ne retrouve pas deux reçus ou confirmations distincts.
- **Débit inconnu** : *error* avec push, retenu jusqu'à 07:30 s'il tombe la nuit (§6.4). C'est un débit d'au moins 300 € (seuil réglable) qui réunit trois conditions : son bénéficiaire n'apparaît nulle part dans l'historique disponible (jusqu'à 24 mois) ; ce n'est pas un virement entre tes comptes ; l'Agent Mail ne retrouve ni facture ni confirmation de commande à ±3 jours.

**IA**
- Elle ne sert qu'à catégoriser un marchand inconnu, avec un modèle **local** (Ollama) : aucune donnée bancaire ne part vers un modèle cloud.
- Le modèle rend un JSON validé par Pydantic, avec un score de confiance. En dessous de 0,8, la ligne va dans « à vérifier ».
- Chacune de tes corrections devient une règle déterministe.

### Scénario d'usage (« Day in the life ») — la clôture d'octobre, lundi 2 novembre, 04:00 → 04:15

1. **04:00** — Import Enable Banking des 35 derniers jours. Ce chevauchement capte les opérations comptabilisées en retard, et la clé `entry_reference` empêche qu'il crée des doublons. Octobre compte 142 opérations comptabilisées.
2. **04:03** — 131 opérations trouvent immédiatement leur facture ou une règle (virement interne, salaire). Pour les 11 autres, l'agent publie `mail.search.requested`. L'Agent Mail fouille alors toute la boîte (même domaine que le marchand, ±7 jours) et retrouve 8 factures.
3. **04:05** — Bilan : 139 opérations sur 142 sont justifiées. Les 3 restantes déclenchent chacune un événement `finance.document.missing` de gravité *warning*. Les PDF rapprochés sont renommés et archivés dans `~/Documents/Finances/2026/10/`.
4. **04:08** — Anomalies :
   - un abonnement est passé de 10,99 € à 13,49 €, soit +2,50 € par mois (+22,7 %). L'agent publie `finance.anomaly.detected`, avec en lien le dernier e-mail du marchand ;
   - aucun double débit suspect : les deux débits de 3,20 € à la même boulangerie, à 26 h d'écart, sont sous le seuil de 20 €.
5. **04:10** — Portefeuille :
   - l'avis d'opéré du versement d'octobre est intégré ;
   - les 3 cours de clôture du vendredi 30/10, récupérés vendredi à 21:00 (3 appels sur 20), concordent avec les VL ;
   - valeur totale : 40 000 €, soit Monde 29 000 € (72,5 %), Émergents 5 840 € (14,6 %), Obligations 5 160 € (12,9 %) ;
   - les cibles sont 70 / 20 / 10 avec des bandes de ±5 points : la poche Émergents est donc sous sa bande (15 %).
6. **04:12** — Rééquilibrage sans vente :
   - les 500 € du versement de novembre vont entièrement aux Émergents ;
   - sur 40 500 €, on obtient Émergents 15,7 %, Monde 71,6 %, Obligations 12,7 % : tout est dans les bandes ;
   - une carte « Ordre préparé » est créée, mais l'agent ne passe jamais l'ordre lui-même ;
   - il publie `finance.exposure.updated`, que SISMOGRAPHE utilise.
7. **04:15** — Clôture du mois :
   - calcul du budget réel par rapport au prévu, par catégorie, de l'épargne nette et du patrimoine net ;
   - ajout d'une feuille `2026-10` dans `Tableau_de_bord_2026.xlsx` et archivage de `Cloture_2026-10.pdf` ;
   - publication de `finance.close.completed`.

### Intégration UI

- **Nouveau module « Finances »**, avec quatre vues :
  - *Clôture* : une jauge (139/142) et la liste des pièces manquantes, où tu peux glisser-déposer la pièce ;
  - *Budget* : réel par rapport au prévu, sur 12 mois ;
  - *Portefeuille* : allocation avec ses bandes, treemap du look-through (pays, secteur, entreprise), matrice de chevauchement entre ETF, frais en €/an, rapprochement mensuel avec le relevé du courtier ;
  - *Trésorerie* : solde projeté à 90 jours avec un seuil d'alerte, et revenus pondérés du SOURCIER en pointillé.
- **Widgets d'accueil** : « Clôture du mois », « Dérive » (barres avec bandes), « Ordre préparé ».
- **Casiers**, sur la même métaphore que l'Agent Mail : « À justifier », « À vérifier », « Abonnements », « Anomalies », « Fiscal 2026 ».
- **Notifications**
  - *warning* : hausse d'abonnement, dérive hors bande, pièce manquante depuis plus de 30 jours, double débit suspect sous 300 €, écart de position expliqué en attente de ton clic ;
  - *error* : consentement bancaire qui expire dans 14 jours (carte avec lien de ré-authentification), source de prix en panne, écart de position inexpliqué, double débit suspect à partir de 300 €, débit inconnu (avec push) ;
  - pas de *critical* : ces détections reposent sur des heuristiques, qui peuvent se tromper (critère au §6.4). Si tu préfères être réveillé pour un débit inconnu, une ligne du manifeste suffit.

---

## 2. SISMOGRAPHE — veille géopolitique et agrégation web

### Nom de code et mission principale

**SISMOGRAPHE.** Sa mission : transformer le flux mondial (presse, sources officielles, données) en un brief court et sourcé, classé selon ce qui **te** touche — ton portefeuille, tes prospects, tes voyages. Il suit aussi des scénarios que tu définis, à l'aide d'indicateurs mesurables.

Ce qui le rend inédit :
- **La pertinence se calcule** : gravité × exposition. L'exposition vient du look-through d'ARGENTIER, des entreprises suivies par le SOURCIER et des voyages du casier « voyages ».
- **Il suit des scénarios avec la méthode « indicateurs et alertes »** du renseignement, plutôt qu'un fil d'actualité. Chaque indicateur porte sa latence : une crise soudaine monte aussi vite que ses indicateurs rapides le permettent, et les données lentes la confirment ensuite.
- **Chaque information affiche son niveau de confirmation**, et des **données physiques** (transits maritimes, listes de sanctions) complètent le texte.

### Capacités techniques requises

**Scripts**

| Script | Rôle | Déclenchement |
|---|---|---|
| `gdelt_scan.py` | volumes et articles GDELT | toutes les 15 min |
| `officiel_sync.py` | sources officielles | sanctions chaque jour à 06:00 ; flux RSS toutes les heures |
| `wiki_modifs.py` | modifications Wikipédia des articles suivis | toutes les 5 min |
| `portwatch_sync.py` | transits maritimes | le mercredi à 06:00 |
| `pages_vues.py` | pages vues Wikipédia (indicateur lent) | chaque jour à 12:00, une fois les chiffres de la veille publiés |
| `brief.py` | rédaction du Brief | 06:45 |

**Requêtes réseau** (lecture seule, sur une liste blanche de domaines)
- **Presse mondiale : GDELT DOC 2.0**, via la bibliothèque `gdeltdoc`.
  - `timeline_search("timelinevolraw", f)` donne les volumes ; `article_search(f)` donne les articles, 250 au maximum.
  - Résolution des volumes : tranches de 15 min pour une fenêtre de moins de 72 h, d'une heure jusqu'à une semaine, d'un jour au-delà.
  - La fenêtre officielle couvre les 3 derniers mois.
  - La limite est d'environ une requête toutes les 5 s par adresse IP, et elle est plus stricte en pratique. Toutes les requêtes passent donc par une file unique, à raison d'une toutes les 10 s, avec une attente de 1, puis 2, puis 4 min après une erreur 429.
- **Texte des articles** :
  - extraction avec `trafilatura` ;
  - dédoublonnage par embeddings multilingues locaux (`intfloat/multilingual-e5-small`), stockés dans `sqlite-vec`.
- **Sources officielles**
  - France Diplomatie : flux RSS « Conseils aux voyageurs », et pages « Dernières minutes et alertes » des pays où tu te rends.
  - Sanctions de l'UE : liste consolidée (`https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw`, jeton public).
  - Sanctions des États-Unis : liste SDN de l'OFAC (`https://sanctionslistservice.ofac.treas.gov/api/download/sdn.xml`, avec un en-tête User-Agent explicite). L'adresse renvoie vers une URL signée de courte durée, à suivre à chaque téléchargement.
  - Les deux listes de sanctions sont comparées chaque jour à la version de la veille.
  - API Légifrance (plateforme PISTE, gratuite, authentification OAuth) : textes du Journal officiel qui touchent tes secteurs.
- **Données**
  - **IMF PortWatch** : transits quotidiens de 28 détroits et canaux, dont Taïwan, Bab el-Mandeb et Ormuz. La mise à jour est **hebdomadaire** (le mardi), avec plusieurs jours de décalage : ces données servent donc à corroborer, pas à alerter en temps réel.
  - **Modifications Wikipédia**, mesure rapide de l'attention.
    - Source : API MediaWiki, `list=recentchanges` avec `rctitle` (un article par requête) et `rcshow=!bot` (robots exclus), relevée toutes les 5 min pour chaque article suivi.
    - Articles suivis : ceux que l'identifiant Wikidata du scénario relie dans chaque langue.
    - Wikimedia conserve 30 jours de modifications récentes, ce qui suffit à amorcer la référence.
    - Les rafales de modifications simultanées dans plusieurs langues sont un détecteur connu d'actualité de rupture (Steiner, van Hooland et Summers, WWW 2013).
    - Chaque requête porte un User-Agent qui identifie le hub, comme l'exige Wikimedia.
  - **Pages vues Wikipédia**, mesure lente de l'attention, car les chiffres d'une journée ne sont publiés que le lendemain : `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/{projet}/all-access/user/{article}/daily/{début}/{fin}`.
- **Pages sans flux** : changedetection.io auto-hébergé (Docker, avec rendu Playwright), piloté par son API (`/api/v1/watch`, en-tête `x-api-key`). L'agent récupère les différences et les résume.
- **Listes d'articles sans flux** : des collecteurs à sélecteurs CSS (`selectors.yaml`) les lisent. À chaque passage, ils vérifient que leur collecte prolonge la précédente (règle au §5).

**Détection d'un signal de presse**
- **Volume** : x est le nombre d'articles des 60 dernières minutes, soit la somme des quatre dernières tranches complètes de 15 min. À chaque passage, `gdelt_scan.py` relit les dernières 24 h (donc en tranches de 15 min) et stocke chaque tranche dans SQLite.
- **Référence** : moyenne μ et écart-type σ des 720 volumes horaires des 30 jours précédents. Pour un nouveau scénario, elle est amorcée par 5 requêtes de 6 jours, que GDELT rend à la résolution horaire.
- **Score** : z = (x − μ) / σ*, avec σ* = max(σ, √μ, 1).
  - √μ est l'écart-type d'un comptage purement aléatoire (loi de Poisson) : une série anormalement régulière ne rend donc pas le détecteur hypersensible.
  - Le plancher 1 rend le score défini même pour une série vide (σ = 0).
- **Candidat** si z ≥ 3 **et** x ≥ 5 articles. Cas limite : 30 jours sans aucun article, puis 1 article, donnent σ* = 1, z = 1 et x = 1, donc rien ne se déclenche.
- **Coût borné**, en deux étages :
  1. *contrôle bon marché* : une seule requête `article_search`. Si les articles viennent de moins de 3 domaines distincts, l'agent s'arrête là, car la confirmation ci-dessous serait impossible ;
  2. *analyse coûteuse* (texte, embeddings, LLM) : 3 au plus par scénario et par jour. Un même épisode n'est réanalysé qu'après 6 h, ou plus tôt si son volume horaire a doublé.

  Au pire, un scénario coûte donc 2 requêtes GDELT par quart d'heure (volumes, puis articles) et 3 analyses par jour. La file, à une requête toutes les 10 s, en absorbe 90 par quart d'heure : 45 scénarios tiennent même dans ce pire cas, hors attentes après une erreur 429.
- **Confirmé** : au moins 3 domaines indépendants reprennent le signal, dont au moins une source primaire ou officielle. Des quasi-copies (une dépêche d'agence reprise telle quelle, même traduite) comptent pour un seul domaine. Le dédoublonnage par embeddings les repère, avec un seuil réglé sur un échantillon de reprises connues.

**Niveau d'un scénario**
- Un scénario compte 5 indicateurs. Chacun hérite de la **latence** de sa source :

| Source | Fraîcheur de la donnée | Classe |
|---|---|---|
| Modifications Wikipédia | 5 min | rapide |
| GDELT (volume d'articles) | 15 min | rapide |
| Communiqués officiels (flux RSS, pages surveillées) | 1 h au plus | rapide |
| Listes de sanctions UE et OFAC | 1 jour ; de plus, les décisions suivent les faits de plusieurs jours ou semaines | lente |
| Pages vues Wikipédia | 1 jour, publiées le lendemain | lente |
| IMF PortWatch | 1 semaine, publiée le mardi avec plusieurs jours de décalage | lente |

- **Règle de base**, selon le nombre d'indicateurs actifs :

| Indicateurs actifs | 0 | 1 | 2 ou 3 | 4 | 5 |
|---|---|---|---|---|---|
| Niveau du scénario | 0 | 1 | 2 | 3 | 4 |

- **Voie rapide** : si au moins 3 indicateurs rapides sont actifs et que le signal de presse est confirmé, le niveau vaut au moins 3. Sans elle, une crise soudaine plafonnerait au niveau 2 pendant des jours, puisqu'un indicateur lent ne peut pas s'allumer avant sa prochaine donnée. La règle de base garde son rôle pour les crises lentes : deux indicateurs rapides et deux lents donnent aussi le niveau 3.
- **En attente** : un indicateur dont la dernière donnée précède le début de l'épisode n'est pas « inactif » mais « en attente », avec la date de sa prochaine donnée. Un épisode commence quand un premier indicateur s'active, et se termine quand aucun ne l'est plus.
- **Durée** : un indicateur rapide reste actif 72 h après son dernier déclenchement ; un indicateur lent, jusqu'à sa donnée suivante. Le niveau est recalculé à chaque changement. Une alerte n'est publiée que lorsque le niveau dépasse le plus haut atteint dans l'épisode : un niveau qui oscille entre 2 et 3 ne sonne qu'une fois.
- **Contrôle à la création** : l'éditeur refuse un scénario qui compte moins de 3 indicateurs rapides, et affiche le délai minimal pour atteindre chaque niveau. Pour le scénario ci-dessous :
  - niveau 3 en moins d'une heure, la cadence des flux officiels ;
  - niveau 4 pas avant la publication PortWatch qui couvre l'épisode, soit une à deux semaines, et seulement si des sanctions suivent.

**IA**
- Le LLM qui lit les articles n'a **aucun outil**, car ce contenu n'est pas fiable.
- Il rend un JSON de la forme `{affirmations[], sources[]}`.
- Une affirmation dont la citation est introuvable dans le texte extrait est supprimée.

**Accès fichiers** : écriture uniquement dans `~/HubOS/data/sismographe/` (captures de pages, index, briefs en Markdown).

### Scénario d'usage (« Day in the life ») — nuit du 1er au 2 novembre

Tu as défini une seule fois le scénario « Tensions dans le détroit de Taïwan », avec cinq indicateurs :

| Indicateur | Ce qu'il mesure | Classe |
|---|---|---|
| I1 | volume GDELT de « Taiwan Strait » (détecteur ci-dessus) | rapide |
| I2 | communiqués officiels datés de l'épisode : ministères de la Défense et des Affaires étrangères de Taïwan, de la Chine et des États-Unis, France Diplomatie | rapide |
| I3 | rafale de modifications humaines des articles du détroit : même calcul que I1, avec en plus au moins 3 contributeurs et au moins 2 langues, ce qui écarte un vandale isolé ou une guerre d'édition | rapide |
| I4 | transits maritimes du détroit (PortWatch) | lente |
| I5 | ajouts aux listes de sanctions liés à la zone | lente |

1. **01:45** (08:45 à Taipei) — I1 compte 30 articles dans la dernière heure, pour une référence de μ = 6,4 et σ = 5,6 articles par heure. Comme σ* = max(5,6 ; 2,5 ; 1) = 5,6, on a z = (30 − 6,4) / 5,6 = 4,2. Avec x ≥ 5, le signal devient candidat et I1 s'active.
2. **01:46** — Contrôle bon marché : ces 30 articles viennent de 19 domaines distincts, donc au moins 3. L'analyse coûteuse est lancée, la première des 3 permises ce jour-là.
3. **01:46–02:05** — Les 212 articles des 24 dernières heures sont récupérés, leur texte extrait, puis regroupés par sujet. Le groupe principal couvre 9 domaines indépendants en 4 langues, dont 2 sources officielles. Le signal est **confirmé**, et I2 s'active.
4. **02:06** — Résumé structuré : sur 5 affirmations proposées, 4 sont conservées, avec chacune au moins 2 citations. La cinquième est supprimée, faute de citation vérifiable.
5. **02:07** — Les autres indicateurs :
   - I3 : 23 modifications humaines dans l'heure, par 11 contributeurs, en anglais, en chinois et en français. La référence est de 0,2 modification par heure, avec σ = 0,5, donc σ* = 1 et z = (23 − 0,2) / 1 = 22,8 : I3 s'active ;
   - I4 : en attente. La dernière publication PortWatch, celle du mardi 27 octobre, précède l'épisode ;
   - I5 : en attente jusqu'à la comparaison des listes, à 06:00.

   Trois indicateurs rapides sont actifs et le signal est confirmé : par la voie rapide, le scénario passe au **niveau 3**. La règle de base seule, avec 3 indicateurs actifs, l'aurait laissé au niveau 2.
6. **02:09** — Calcul de l'exposition, à partir du dernier look-through publié par ARGENTIER :
   - 2,8 % du portefeuille (≈ 1 110 €) est investi dans des sociétés taïwanaises ;
   - cette exposition passe entièrement par l'ETF Émergents, car le MSCI World ne contient pas Taïwan, que MSCI classe parmi les marchés émergents ;
   - aucun prospect ni voyage n'est concerné.

   L'agent publie `watch.alert.raised`, de gravité *warning*, avec le push que son manifeste déclare pour le niveau 3.
7. **02:10** — ARGENTIER, abonné à cet événement, lance un stress test : une baisse de 30 % sur ces lignes coûterait 333 €, soit −0,8 % du portefeuille. Il annote la ligne « Émergents ».
8. **06:00** — Les listes de sanctions du jour ne contiennent aucun ajout lié à la zone : I5 passe d'« en attente » à « inactif ». Le niveau reste 3.
9. **07:00** — Le Brief affiche une carte : niveau 3, 9 sources, 4 affirmations citées, exposition 2,8 %, stress test −0,8 %, I4 en attente.
10. **07:30** — Fin des heures calmes : le push « Taïwan : niveau 3, exposition 2,8 % », retenu depuis 02:09, part (§6.4). C'est 1 h 30 avant l'ouverture d'Euronext Paris, à 09:00, le premier moment où tu pourrais agir sur ta ligne Émergents.

### Intégration UI

- **Module « Veille »**
  - *Revue du jour* : 5 cartes au plus, qui alimentent le Brief général. Chacune indique le niveau, la confirmation (nombre de sources indépendantes, présence ou non d'une source primaire), l'exposition en € et en %, et les liens.
  - *Scénarios* : une ligne par scénario.
    - Chaque indicateur y figure en pastille : actif, inactif, ou en attente (hachurée, avec la date de sa prochaine donnée). Un symbole le marque rapide ou lent.
    - Le niveau, de 0 à 4, est affiché avec la règle qui l'a fixé (base ou voie rapide) et son historique.
    - À la création d'un scénario, l'éditeur montre le délai minimal pour atteindre chaque niveau.
  - *Carte d'exposition* : un graphe qui relie tes lignes d'ETF, tes prospects et tes voyages aux pays et entreprises concernés.
  - *Différences* : les pages surveillées, avec l'avant et l'après surlignés.
  - *Sources* : la date du dernier succès de chaque source, le quota GDELT consommé, et les analyses coûteuses du jour par scénario (sur 3).
- **Widget d'accueil « Le monde et toi »** : 3 lignes au plus.
- **Casier Mail « veille »** : l'Agent Mail y range les newsletters. SISMOGRAPHE les lit et les dédoublonne avec le web, si bien que tu n'as plus à les ouvrir.
- **Notifications** : notification système et push uniquement dans ces cas :
  - scénario qui atteint le niveau 3 ou 4 : *warning* avec push, retenu pendant les heures calmes (§6.4) ;
  - exposition touchée supérieure à 5 % du portefeuille ;
  - alerte voyage sur un pays où tu te rends dans les 30 jours.

  En dessous, rien ne sonne : le niveau 1 reste dans le module Veille, et le niveau 2 donne une carte dans le Brief (*notice*).
- **Sanctions** : une entité de ton CRM ajoutée à une liste de sanctions donne une carte « Action requise » (*error*), sans push. Le SOURCIER a déjà bloqué tout envoi, et une correspondance par nom peut viser un homonyme.
- **Boutons « pertinent / pas pertinent »** sur chaque carte : ils ajustent le poids des sources et des requêtes.

---

## 3. SOURCIER — prospection B2B et CRM

### Nom de code et mission principale

**SOURCIER.** Sa mission : repérer, dans les données publiques françaises, les entreprises qui viennent d'exprimer un besoin que tu sais traiter, puis les mener jusqu'au rendez-vous. Le CRM se met à jour à partir des faits (e-mails, agenda), sans saisie de ta part.

Ce qui le rend inédit :
- **Une prospection déclenchée par des événements datés** : offre d'emploi, annonce au BODACC, marché public. Tu écris au moment où le besoin existe, avec la preuve du « pourquoi maintenant ».
- **Une boucle fermée par ton Agent Mail existant** : chaque réponse classée fait avancer le CRM.
- **Une conformité CNIL inscrite dans le code**, et non laissée à ta mémoire.
- **Un pipeline pondéré qui alimente la trésorerie** d'ARGENTIER.

### Capacités techniques requises

**Scripts**

| Script | Rôle | Déclenchement |
|---|---|---|
| `signaux.py` | détection des signaux | toutes les heures, de 08:00 à 20:00 |
| `enrichir.py` | enrichissement des entreprises | à chaque nouveau signal |
| `sequences.py` | envois et relances | toutes les 15 min, jours ouvrés seulement ; jours fériés exclus avec la bibliothèque `holidays` |
| `reponses.py` | traitement des réponses | à chaque `mail.classified` du casier « prospection » |
| `dossier_rdv.py` | dossier de préparation | la veille de chaque RDV, à 10:00 |
| `purge_rgpd.py` | purge des données | chaque semaine |

**Requêtes réseau**
- **Déclencheurs**
  - **API « Offres d'emploi v2 » de France Travail.** Elle est gratuite après création d'un compte sur francetravail.io. L'authentification passe par OAuth2 (client credentials) et le quota par défaut est de 3 appels par seconde. L'agent filtre par mots-clés de ton offre et par départements cibles. Les offres sans nom d'entreprise sont ignorées.
  - **BODACC**, sans clé : `https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records`. Il couvre les immatriculations, modifications, ventes et cessions, ainsi que les dépôts des comptes.
  - **BOAMP** (`https://boamp-datadila.opendatasoft.com`, même API, jeu de données `boamp`, Licence Ouverte 2.0), si tu réponds aux marchés publics.
  - **Les alertes `watch.alert.raised` du SISMOGRAPHE**, quand un événement touche un secteur cible.
- **Enrichissement**
  - **API Recherche d'entreprises** : `https://recherche-entreprises.api.gouv.fr/search?q=<nom>&departement=69`. Elle fonctionne sans clé, jusqu'à 7 appels par seconde. Elle accepte aussi des filtres comme `section_activite_principale`, et renvoie le SIREN, le code NAF, les établissements, les dirigeants et les finances publiées.
  - **API Sirene de l'INSEE** (clé gratuite, 30 requêtes par minute), pour les mises à jour.
  - **DNS public**, via `dnspython`. L'enregistrement MX révèle Microsoft 365 ou Google Workspace, et l'enregistrement SPF les outils d'e-mailing utilisés : ce sont des indices sur la stack de l'entreprise.
  - **Pages « contact » et « mentions légales » du site**, via `httpx` et `trafilatura`.
- **Envoi** : délégué à l'Agent Mail, qui reçoit une capacité d'envoi soumise à la politique (SMTP, API Gmail ou Microsoft Graph).
- **Agenda** : lecture des disponibilités (`freeBusy` de Google Calendar, `getSchedule` de Microsoft Graph, ou CalDAV). Les blocs posés par le PRÉCEPTEUR et les voyages sont exclus.

**Accès fichiers**
- `crm.sqlite` : entreprises, contacts, opportunités, interactions et liste d'opposition.
- `~/HubOS/data/sourcier/` : dossiers de RDV en PDF.

**Score** — calcul déterministe et explicable

> Score = adéquation à ta cible (taille, NAF, zone) × force du déclencheur × fraîcheur

La fraîcheur est divisée par 2 tous les 14 jours. Une opportunité est créée dès que le score atteint 0,6.

**Conformité — règles codées**
- Les adresses génériques (contact@…) passent en priorité : elles relèvent de la personne morale. Pour une adresse nominative, l'objet du message doit être en rapport avec la fonction de la personne.
- Le premier message contient l'information RGPD exigée par l'article 14 (source des données, finalité, droit d'opposition), ainsi qu'un lien de désinscription.
- La liste d'opposition est vérifiée avant chaque envoi.
- Les données sont purgées 3 ans après le dernier contact **venant du prospect**. Une simple ouverture d'e-mail ne compte pas comme contact.
- Aucune collecte sur LinkedIn. En décembre 2024, la CNIL a sanctionné KASPR de 240 000 €, notamment pour avoir aspiré sur LinkedIn les coordonnées d'utilisateurs qui en avaient restreint la visibilité.
- Chaque nouvelle entreprise et ses dirigeants sont confrontés aux listes de sanctions tenues par SISMOGRAPHE.

**IA**
- Le premier message est rédigé à partir d'un modèle que tu as validé, enrichi de faits sourcés. Chaque fait cité est vérifié automatiquement dans sa source.
- L'Agent Mail classe les réponses en cinq catégories :
  - intéressé ;
  - plus tard (avec une date) ;
  - non ;
  - désinscription ;
  - absent (avec la date de retour).

### Scénario d'usage (« Day in the life ») — du signal au rendez-vous

**Prérequis, fait une seule fois** : tu as validé la campagne « Automatisation pour PME ».
- Cible : entreprises de 10 à 249 salariés, dans les départements 69, 38 et 42.
- Un modèle de message, avec 2 relances au maximum.
- 10 envois par jour au maximum.

1. **Mardi 3 novembre, 08:00** — Sur France Travail, une PME de Villeurbanne publie l'offre « Développeur Python — automatisation des flux de facturation ».
2. **08:01** — Enrichissement :
   - SIREN retrouvé à partir du nom et de la commune ;
   - effectif dans la tranche 20 à 49 salariés ;
   - finances publiées ;
   - au BODACC, une augmentation de capital 3 mois plus tôt, qui constitue un second déclencheur ;
   - l'enregistrement MX indique Microsoft 365.
3. **08:02** — Score de 0,855 (adéquation 0,9 × déclencheur 0,95 × fraîcheur 1,0), au-dessus du seuil de 0,6. Le contrôle des sanctions est négatif. L'agent crée l'opportunité, avec en « Pourquoi maintenant » : « offre du 03/11 + augmentation de capital ».
4. **08:05** — Rédaction du brouillon à partir du modèle, en citant l'offre ; chaque fait cité est vérifié dans sa source. Le destinataire est l'adresse générique des mentions légales. L'envoi est planifié pour 09:30.
5. **09:30** — L'Agent Mail envoie le message, 3e envoi de la journée sur 10, et publie `mail.sent`.
6. **Lundi 9 novembre, 09:30** — Toujours pas de réponse après 4 jours ouvrés : l'agent envoie la relance 1.
7. **Mardi 10 novembre, 14:12** — Le prospect répond : « Pouvez-vous nous proposer un créneau la semaine prochaine ? ». L'Agent Mail classe la réponse en « prospection / intéressé ».
8. **14:13** — Le SOURCIER calcule tes disponibilités de la semaine du 16, en excluant les blocs de révision, et répond en proposant 3 créneaux. Cette action est autonome parce que le modèle « proposition de créneaux » a été validé.
9. **16:40** — Le prospect choisit le mardi 17 novembre à 10:00. L'agent :
   - crée l'événement avec un lien de visio ;
   - fait passer l'opportunité à l'étape « RDV » ;
   - publie `crm.meeting.booked` (le PRÉCEPTEUR vérifie alors son plan) et `crm.pipeline.forecast` (4 000 € × 20 % = 800 € attendus en décembre, qu'ARGENTIER intègre à la trésorerie).
10. **Lundi 16 novembre, 10:00** — Le dossier de RDV d'une page est prêt :
    - fiche de l'entreprise ;
    - déclencheurs, avec leurs sources ;
    - historique des échanges ;
    - actualités du secteur ;
    - 3 questions de découverte.

*Limite volontaire* : si une réponse pose une question hors modèle (prix, conditions), l'agent n'improvise pas. Il prépare un brouillon et crée une carte « Action requise ».

### Intégration UI

- **Module « Pipeline »**
  - *Kanban* : Signal → Qualifié → Contacté → Répondu → RDV → Proposition → Gagné/Perdu.
  - *Fiche opportunité* :
    - un bloc « Pourquoi maintenant » (déclencheurs datés, avec liens) ;
    - le fil des e-mails, rattachés automatiquement par l'Agent Mail ;
    - le détail du score ;
    - la prochaine action, avec sa date.
  - *Vue « Campagnes »* : envois du jour par rapport au plafond, taux de réponse, désinscriptions, bouton « Suspendre ».
  - *Vue « Conformité »* : liste d'opposition et purges à venir.
- **Widgets d'accueil** : « Signaux du jour », « Relances dues », « Prochain RDV + dossier ».
- **Casier Mail « prospection »**, avec un sous-casier par type de réponse.
- **Notifications**
  - réponse « intéressé » : notification système et push ;
  - RDV réservé : simple mention (*notice*) dans le Brief ;
  - réponse hors modèle : carte dans les Approbations.

---

## 4. PRÉCEPTEUR — études

### Nom de code et mission principale

**PRÉCEPTEUR.** Sa mission : transformer tout ce que publient tes cours (fichiers, devoirs, annonces, enregistrements) en un plan de révision.
- Le plan part de la date d'examen et remonte jusqu'à aujourd'hui.
- Il est recalculé chaque nuit selon ce que tu as **réellement** retenu et fait.
- Aucun rendu n'est oublié.

Ce qui le rend inédit :
- **Un rétro-planning fondé sur des faits**, pas sur des intentions : ce qui reste à faire se lit dans Anki (cartes nouvelles et dues, taux de réussite par chapitre) et dans Moodle (statut de chaque rendu). Le temps d'écran peut confirmer un bloc de travail, jamais conclure que tu n'as pas travaillé.
- **Des cartes qui citent leur diapo ou leur page** : une carte est rejetée si sa réponse ne figure pas dans la source citée.
- **La détection des conflits avec ta vie réelle** : tes voyages et les RDV pris par le SOURCIER.

### Capacités techniques requises

**Scripts**

| Script | Rôle | Déclenchement |
|---|---|---|
| `lms_sync.py` | synchronisation Moodle | 06:00 et 18:00 |
| `cartes.py` | création des cartes Anki | à chaque nouveau support |
| `plan.py` | calcul du plan de révision | 05:30, et à chaque nouveau devoir, `crm.meeting.booked`, changement d'agenda ou bloc déclaré « À moitié » ou « Pas fait » |
| `bilan.py` | bilan de chaque bloc (journal d'Anki, temps d'écran) | à la fin de chaque bloc |
| `rendus.py` | vérification des rendus | toutes les heures de E − 72 h jusqu'au dépôt (E : échéance effective, voir plus bas), et juste avant chaque palier d'alerte |

**Requêtes réseau**
- **Moodle Web Services**
  - Obtention du jeton : `/login/token.php?service=moodle_mobile_app`.
  - Appels : `/webservice/rest/server.php?wstoken=…&wsfunction=…&moodlewsrestformat=json`.
  - Fonctions utilisées :
    - `core_course_get_contents` (fichiers) ;
    - `mod_assign_get_assignments` (devoirs) ;
    - `mod_assign_get_submission_status` (statut de dépôt : champ `lastattempt.submission.status`, qui vaut `new`, `draft`, `submitted` ou `reopened` ; prolongation éventuelle dans `lastattempt.extensionduedate`) ;
    - `core_calendar_get_action_events_by_timesort` (échéances, 50 par page).
  - Si ton établissement passe par un SSO ou désactive le service mobile : export iCal du calendrier Moodle pour les échéances, et Playwright avec ta session pour les fichiers.
- **AnkiConnect** (`POST http://<hôte d'Anki>:8765`, version 6)
  - `addNotes` pour ajouter les cartes ;
  - `cardReviews` pour le journal des révisions d'un paquet depuis un instant donné : horodatage, carte, bouton pressé (`ease` = 1 pour « Again ») et type de révision. L'action ne descend pas dans les sous-paquets : il faut un appel par sous-paquet ;
  - `sync` avant chaque lecture du journal et après chaque ajout de cartes. Les révisions faites sur ton téléphone (AnkiDroid, AnkiMobile) arrivent ainsi par AnkiWeb. Une révision pas encore synchronisée laisse sa carte due : le plan surestime alors la charge jusqu'à la synchronisation suivante, jamais l'inverse.
- **Où tourne Anki.** AnkiConnect est un module d'Anki Desktop, une application graphique (Qt) sans mode « sans interface » : il ne répond que si Anki tourne sur un affichage.
  - *Hub sur ton PC* : l'agent démarre Anki s'il est fermé.
  - *Hub sans écran (NAS, serveur)* : Anki Desktop tourne dans un conteneur, sur un affichage virtuel (Xvfb), et Docker le relance s'il s'arrête (`restart: unless-stopped`). Dans le conteneur, AnkiConnect écoute toutes les interfaces (`webBindAddress` à `0.0.0.0`), mais son port n'est ouvert qu'au hub, et chaque requête doit porter une clé (`apiKey`). Le conteneur est connecté une seule fois à ton compte AnkiWeb, par un accès VNC.
  - Dans les deux cas, l'agent n'ajoute que des notes et des paquets. Le type de note est créé une fois, depuis ton PC. Modifier une structure imposerait une synchronisation complète, pour laquelle Anki demande de choisir le sens de la copie : l'agent ne le fait donc jamais.
  - Si AnkiConnect ne répond pas, c'est une erreur transitoire (§6.3). Les cartes attendent dans une file, et le plan part du dernier état connu, signalé comme tel.
- **ActivityWatch**, facultatif (`http://localhost:5600/api/0/query/`) : temps actif à l'écran dans Anki, le lecteur PDF et l'IDE. C'est une mesure à sens unique (voir « Mesure du réalisé »).
  - Il tourne sur le PC où tu travailles, et son serveur n'écoute par défaut que ce PC : il ne sert donc que si le hub tourne sur ce même PC.
  - Sur un hub sans écran, le PRÉCEPTEUR s'en passe. Comme l'écran ne peut jamais infirmer un bloc, la seule conséquence est que tes blocs restent « faits, non vérifiés ».
- **Agenda** : lecture des disponibilités, comme pour le SOURCIER. L'écriture se fait uniquement dans un calendrier dédié « Révisions (PRÉCEPTEUR) ».

**Accès fichiers**
- Lecture du casier Mail « études » (changements de salle, annonces).
- Écriture dans `~/Études/<cours>/` : supports, transcriptions, index.

**Traitement des supports**
- Conversion des PDF et PPTX avec Docling, qui conserve le numéro de page de chaque élément.
- Transcription locale des enregistrements avec `faster-whisper`.
- Un index par cours, stocké dans `sqlite-vec`.

**Cartes**
- Le LLM produit un JSON `{question, réponse, fichier, page}`.
- Une carte est rejetée si sa réponse n'apparaît pas dans le passage cité (vérifié par un second appel), ou si elle double une carte existante (similarité cosinus ≥ 0,9).

**Plan — algorithme déterministe**
- La charge restante se calcule sur des faits :
  - les cartes nouvelles et les révisions dues projetées, lues dans Anki ;
  - pour chaque devoir non déposé, son temps estimé moins les blocs de devoir déjà faits.
- Rien n'est « reporté en minutes » : une révision non faite reste due dans Anki, et revient d'elle-même dans le calcul de la nuit suivante.
- La charge est répartie à rebours à partir de J−2, J−1 restant léger, dans tes créneaux libres et selon tes règles (ex. 2 h par soir au maximum en semaine, rien après 22:00).
- Les chapitres dont le taux de réussite est sous la cible passent en priorité. Le taux de réussite d'un chapitre est la part des révisions de cartes déjà apprises (type `review` du journal d'Anki), sur 30 jours, où tu n'as pas répondu « Again ». Pour mémoire, Anki propose l'algorithme FSRS depuis sa version 23.10 (à activer dans les options), avec une rétention visée de 90 % par défaut.
- **Échéance effective** E d'un devoir : c'est l'échéance Moodle M (prolongation comprise), avancée quand un conflit (voyage, RDV) rend indisponibles les jours qui la précèdent.

**Mesure du réalisé — règle exacte**
- Le journal d'Anki, lu après `sync`, mesure exactement le travail sur cartes, sur tous tes appareils : chaque révision y est horodatée, avec le bouton pressé.
- ActivityWatch ne voit que l'écran. Il peut **confirmer** un bloc (au moins 80 % du bloc en temps actif dans les applications d'étude), jamais l'**infirmer** : des exercices sur papier, un polycopié ou un tableau lui donnent 0 minute.
- Un bloc non confirmé est donc compté **fait, non vérifié**. Une question discrète, « Fait / À moitié / Pas fait », l'accompagne dans le module Études ; sans réponse, rien ne change et rien ne te relance.
- « À moitié » ou « Pas fait » sur un bloc de devoir ajoute le temps manquant au devoir et relance le plan. Sur un bloc de cartes, la question est inutile : les révisions non faites restent dues dans Anki.
- Si un bloc de devoir a été sauté sans que tu le dises, le filet de sécurité reste le statut Moodle, surveillé par l'échelle ci-dessous.

**Échelle d'alerte d'un rendu**, tant que le statut n'est pas `submitted` :

| Palier | Instant | Gravité | Canal |
|---|---|---|---|
| P1 | E − 24 h | *warning* | badge et Brief |
| P2 | E − 4 h | *error* | carte « Action requise », notification système et push |
| P3 | M − 2 h | *critical* | push urgent |

- Le statut est revérifié juste avant chaque palier ; dès qu'il vaut `submitted`, l'échelle s'arrête.
- `draft` compte comme non déposé. C'est le piège classique du fichier téléversé mais jamais « envoyé pour évaluation », quand le cours exige ce clic.
- Un palier prévu entre 21:30 et 07:30 est avancé au 21:30 le plus récent. Une alerte d'échéance arrive donc en avance, jamais pendant tes heures calmes ni en retard. Deux paliers ramenés au même instant fusionnent au plus grave.
- L'ordre est garanti : comme E ≤ M, on a E − 24 h < E − 4 h < M − 2 h, et l'avancement peut rapprocher deux paliers, jamais les inverser.
- Un palier déjà dépassé quand l'échelle est calculée (devoir publié tard) part aussitôt ; s'il y en a plusieurs, seul le plus grave est envoyé.

**Limites voulues** : l'agent ne rédige pas tes devoirs et ne dépose rien à ta place.

### Scénario d'usage (« Day in the life ») — semaine du 16 novembre, examen de statistiques le mardi 15 décembre

1. **Lundi 16 novembre, 06:00** — Moodle publie « CM7_Regression.pdf » (42 diapos) et le devoir DM3, à rendre le vendredi 20 novembre à 23:59. L'agent télécharge le fichier, constate à son empreinte qu'il est nouveau, le convertit et l'indexe.
2. **06:04** — 23 cartes sont proposées. 4 sont rejetées : 2 doublons et 2 dont la réponse est absente de la diapo citée. Les 19 autres sont ajoutées au paquet `Stats::CM7`.
3. **06:05** — Conflit détecté : le casier « voyages » contient un train Paris → Lyon le jeudi 19 novembre à 07:58, avec retour le samedi 21. L'agent avance l'échéance effective E du DM3 au mercredi 18 novembre à 22:00 ; l'échéance Moodle M reste le vendredi 20 à 23:59.
4. **06:06** — Le plan est recalculé sur les 29 jours qui restent avant l'examen. Le chapitre 4 est à 72 % de réussite pour une cible de 85 % : il passe en priorité. Blocs posés :
   - lundi 16 et mardi 17, de 18:00 à 19:30 : DM3 et chapitre 4 ;
   - mercredi 18, de 14:00 à 17:00 : finalisation du DM3 ;
   - rien du 19 au 21 ;
   - reprise le dimanche 22 à 10:00.

   Le RDV du SOURCIER, le mardi 17 à 10:00, ne chevauche aucun bloc.
5. **Mardi 17 novembre, 19:30** — Fin du bloc 18:00–19:30 :
   - le journal d'Anki, lu après `sync`, compte 35 révisions de cartes déjà apprises du chapitre 4, dont 29 réussies. Sur 30 jours, le taux du chapitre passe de 72 % (36 sur 50) à 76 % (65 sur 85) ;
   - ActivityWatch (le hub tourne ici sur ton PC) ne voit que 38 minutes d'écran : tu as passé le reste du bloc sur le DM3, sur papier ;
   - l'écran ne pouvant pas infirmer un bloc, celui-ci est compté fait, marqué « non vérifié ». Rien n'est reporté.
6. **Mardi 17 novembre, 21:30** — Palier P1 : E − 24 h tombe à 22:00, il est donc avancé à 21:30. Le statut est `new` : rien n'est déposé. Alerte *warning* : badge sur le module, et carte dans le Brief du lendemain.
7. **Mercredi 18 novembre, 18:00** — Palier P2 (E − 4 h). Le statut est `draft` : tu as téléversé le DM3 à 17:10, mais le cours exige de cliquer sur « Envoyer le devoir », et ce clic manque. Alerte *error* avec push : « DM3 téléversé, mais pas envoyé pour évaluation ».
8. **Mercredi 18 novembre, 19:00** — Le contrôle horaire lit `submitted` : tu as cliqué à 18:40. L'échelle s'arrête : le palier P3 (vendredi 20, M − 2 h = 21:59, avancé à 21:30) est annulé, et une *notice* confirme le dépôt dans le Brief.

De toute la semaine, tu n'as rien eu à saisir dans le PRÉCEPTEUR. Ton seul geste a été le dépôt, qui t'appartient par construction.

### Intégration UI

- **Module « Études »**
  - *Carte par cours* : compte à rebours, couverture du programme, bandeau du taux de réussite par chapitre, prochain bloc.
  - *Vue « Plan »* : le prévu comparé au réalisé (révisions Anki, statut des rendus, blocs confirmés ou « non vérifiés », avec la question Fait / À moitié / Pas fait).
  - *Vue « Rendus »* : échéances E et M, statut de dépôt (`new`, `draft`, `submitted`) et prochains paliers d'alerte.
  - *Vue « Sources »* : fichiers récupérés, cartes créées et cartes rejetées avec leur motif.
- **Widgets d'accueil**
  - « Aujourd'hui : 2 blocs » ;
  - « Rendus à 7 jours » ;
  - « Examen dans 29 j — préparation 64 % ». La préparation est la moyenne, pondérée par le nombre de cartes de chaque chapitre, de la couverture (part des cartes déjà révisées au moins une fois) multipliée par le taux de réussite. Elle ne dépend que d'Anki, pas du temps d'écran.
- **Casier Mail « études »**.
- **Notifications**
  - nouveau support : mention dans le Brief (*notice*) ;
  - plan modifié : *notice* ;
  - rendu non déposé : P1 *warning*, P2 *error* avec push, P3 *critical* (échelle ci-dessus) ; dépôt constaté : *notice* ;
  - chapitre sous 70 % de réussite à J−14 : *warning* ;
  - bloc non confirmé : aucune notification, seulement la question dans le module.

---

## 5. FORGE — environnement de développement et santé du hub

### Nom de code et mission principale

**FORGE.** Sa mission : garder sains, à jour et sûrs ton environnement de développement et le hub lui-même. Surtout, il répare les autres agents quand ils cassent, avec des tests et une traçabilité complète, pour que le système ne dépende pas de ta disponibilité.

Ce qui le rend inédit :
- **Le système se répare lui-même.** Quand la refonte d'un site casse un collecteur, FORGE le diagnostique, le corrige, vérifie que la nouvelle collecte prolonge bien l'ancienne, puis le redéploie sans toi, à l'intérieur d'un périmètre de fichiers autorisé.
- **Une veille CVE sur tous tes dépôts locaux**, avec des branches de mise à jour déjà testées.
- **La chasse aux pannes programmées** : jetons, certificats et domaines qui expirent, sauvegardes jamais restaurées.

### Capacités techniques requises

**Scripts**

| Script | Rôle | Déclenchement |
|---|---|---|
| `incidents.py` | gestion des incidents | à chaque `agent.error` |
| `deps_scan.py` | analyse des dépendances | 02:00 |
| `secrets_scan.py` | détection de secrets | hook pre-push, et 02:30 |
| `expirations.py` | suivi des expirations | 06:30 |
| `backup.py` | sauvegarde | 01:00 |
| `restore_test.py` | test de restauration | 1er dimanche du mois |
| `dev_brief.py` | brief développement | 06:45 |

**Exécution**
- Les tests tournent dans un conteneur Docker lancé avec `--network none --read-only`, jamais directement sur ta machine.
- Les vérifications en ligne (page brute, page rendue, 3 pages d'articles : 5 requêtes au plus par incident) passent par le proxy de sortie du noyau, limitées au domaine concerné.

**Réparation**
- Le LLM reçoit l'ancien sélecteur, ainsi que l'ancienne et la nouvelle structure HTML (élaguées). Il renvoie un patch.
- Ce LLM n'a aucun outil, puisque le HTML qu'il lit n'est pas fiable. Le périmètre automatique est volontairement limité aux sélecteurs : un sélecteur CSS est une donnée lue par le collecteur, pas du code exécutable.
- Le patch n'est fusionné sans toi que s'il passe trois contrôles :
  1. **Forme** : tests verts sur l'ancienne fixture et sur la nouvelle capture ; titre, date lisible et URL du même domaine pour chaque élément ; nombre d'éléments à ±20 % de la moyenne des 7 derniers jours ; diff limité à `agents/*/selectors.yaml`.
  2. **Continuité**, c'est-à-dire le sens et pas seulement la forme. Soit L la dernière collecte réussie, X la nouvelle extraction, et N les éléments de X datés après le plus récent de L. Il faut |X ∩ L| ≥ ½ × min(|L|, |X| − |N|) : au moins la moitié de ce qui devait encore être affiché est retrouvée. Un encart « Les plus lus » ou une liste d'archives échoue, car ses éléments ne viennent pas de L. Si |X| − |N| < 3, le contrôle n'est pas concluant.
  3. **Dates vérifiées à la source** : pour 3 éléments tirés au hasard, la date extraite doit être celle que déclare la page de l'article elle-même (`datePublished` en JSON-LD, ou `article:published_time`).
- FORGE compare aussi la page brute à la page rendue par un navigateur (Playwright). Si les URL de L n'apparaissent que dans la page rendue, le site est passé au rendu JavaScript. Il faut alors changer de mode de collecte, ce qui sort du périmètre des sélecteurs.
- Dans tous les autres cas (contrôle échoué ou non concluant, passage au JavaScript), FORGE ouvre une PR et une demande d'approbation.
- Côté Git : branche `forge/<incident>`, fusion, tag, puis rechargement de l'agent. Le bouton « Annuler » fait un `git revert`.
- **Probation de 24 h** : après une fusion automatique, chaque collecte repasse le contrôle de continuité. Au premier échec, FORGE annule lui-même la fusion (`git revert`) et repasse en mode proposition.
- Le contrôle de continuité tourne en fait à **chaque** collecte, pas seulement après une réparation. Un échec y vaut dérive de format (§6.3) : un sélecteur qui trouve encore « quelque chose » sur une page devenue autre chose est donc détecté. Un résultat non concluant, comme une page entièrement renouvelée après une longue panne, est accepté. Une page dont la liste change par nature d'un passage à l'autre (sélection « à la une ») est déclarée « continuité non applicable » : elle n'est jamais réparée sans toi.

**Dépendances**
- `osv-scanner scan source -r ~/dev` analyse les fichiers de verrouillage (Python, JS, Go, Rust, etc.).
- L'API OSV (`POST https://api.osv.dev/v1/querybatch`, jusqu'à 1 000 requêtes par lot) renvoie des identifiants de vulnérabilités. Le détail de chacune s'obtient via `/v1/vulns/{id}`.
- Chaque vulnérabilité est croisée, via ses alias CVE, avec le catalogue des vulnérabilités activement exploitées de la CISA (KEV : `https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json`).
- Pour chaque correctif disponible, FORGE crée une branche de mise à jour, lance les tests du projet en conteneur et rédige un rapport. Il travaille dans un `git worktree` séparé, sous `~/HubOS/data/forge/`, sans jamais toucher à ta copie de travail.

**Secrets**
- Analyse avec `gitleaks git <dépôt>` et `gitleaks dir <dossier>`.
- Un secret bloqué par le hook avant l'envoi n'a pas fui. Un secret à format vérifiable (jeton GitHub, clé AWS…) trouvé dans un commit déjà présent sur un dépôt distant (`git branch -r --contains <commit>`, après un `git fetch`) a fui : il faut le révoquer.
- Les secrets des agents restent dans le trousseau du système (bibliothèque `keyring`), jamais dans un `.env` versionné.

**Expirations**
- Jetons GitHub : en-tête `github-authentication-token-expiration` des réponses de l'API, à recouper avec la date notée à la création du jeton.
- Certificats TLS : module `ssl`.
- Noms de domaine : RDAP.

**Machine**
- Surveillance du disque et de la mémoire (`psutil`), de l'espace Docker (`docker system df`) et des caches.
- Au-delà d'un seuil, le nettoyage s'exécute avec un délai de veto de 2 h (voir §6.6).

**Sauvegardes**
- `restic`, chiffré, vers un stockage cloud.
- Chaque mois, un test de restauration sur un échantillon de fichiers, avec comparaison des empreintes.

**Accès fichiers**
- Lecture de `~/dev` et du dépôt du hub. Sur un hub sans écran, FORGE lit des clones de tes dépôts, mis à jour chaque nuit par `git fetch`. Le hook pre-push, lui, tourne toujours sur ton PC.
- Écriture uniquement sur les branches `forge/*` et dans `~/HubOS/data/forge/`.

### Scénario d'usage (« Day in the life ») — nuit du 1er au 2 novembre

1. **02:42, 02:57 puis 03:12** — Le collecteur d'un think tank américain lit une page sans flux RSS, avec le sélecteur `article.post-item`. Sa dernière collecte réussie, à 02:27, comptait 14 articles. Trois fois de suite, il reçoit une réponse HTTP 200 mais 0 article. Il publie alors un `agent.error` de classe « dérive de format », avec la capture HTML de la page.
2. **03:12** — FORGE ouvre l'incident INC-0042. Il rejoue la fixture de la veille (résultat correct), puis la capture du jour (0 élément) : la structure de la page a changé.
3. **03:13** — La page brute et la page rendue contiennent toutes deux les URL de la collecte de 02:27 : le contenu est toujours servi en HTML, seul le balisage a changé.
4. **03:14** — L'analyse montre que `article.post-item` est devenu `div.c-card`, avec un titre en `h3.c-card__title`. FORGE propose un patch de `agents/sismographe/selectors.yaml`, qui garde l'ancien sélecteur en repli.
5. **03:16** — Les trois contrôles passent :
   - forme : 14 articles, titres, dates et URL valides, volume habituel ;
   - continuité : 13 des 14 URL de 02:27 sont retrouvées. La 14e a été poussée hors de la page par un article publié à 02:51 (20:51 à Washington), seul élément de N. Il en fallait au moins ½ × min(14, 14 − 1) = 6,5, soit 7 ;
   - dates : pour 3 articles tirés au hasard, la date de la liste est bien celle de leur `datePublished`.
6. **03:18** — Le diff ne touche que le fichier autorisé. FORGE fusionne, pose le tag `sismographe-1.4.3`, recharge le collecteur, rattrape l'article de 02:51 et ouvre la probation de 24 h.
7. **03:20** — Publication de `forge.incident.resolved` : l'incident a duré 8 minutes. La capture du jour devient une fixture de test.
8. **07:00** — Le Brief affiche « 1 incident résolu automatiquement » (*notice*), avec le diff, le résultat des trois contrôles et un bouton « Annuler ».

### Intégration UI

- **Module « Atelier »**
  - *Incidents* : ouverts et résolus, durée, chaîne d'événements, diff, résultat des contrôles (forme, continuité, dates), bouton « Annuler » ;
  - *Dépendances* : CVE par dépôt et par gravité, branches de correction testées ;
  - *Expirations* : jours restants pour chaque jeton, certificat ou domaine ;
  - *Machine* ;
  - *Sauvegardes* : dernière sauvegarde et dernier test de restauration.
- **Widgets d'accueil**
  - « Santé des agents » : pour chaque agent, une pastille verte, orange ou rouge, et son mode (Ombre, Proposition ou Autonome) ;
  - « Incidents ouverts » ;
  - « Prochaine expiration ».
- **Casier Mail « dev »** : notifications GitHub et CI.
- **Notifications**
  - incident résolu automatiquement : *notice* ;
  - réparation refusée par un contrôle, ou impossible : *error*, avec une carte d'approbation qui contient la PR et le contrôle en échec ;
  - annulation automatique pendant la probation : *error* ;
  - secret bloqué par le hook avant l'envoi : *warning* ; secret présent sur un dépôt distant : *critical*, avec push ;
  - CVE du catalogue KEV sur un projet que tu as déclaré exposé à Internet : *critical* ; autre CVE critique : *error*.

---

## 6. Synergie : comment les agents coopèrent et remontent leurs alertes

### 6.1 Un seul bus : ton journal d'événements, généralisé

Ton journal temps réel affiche déjà les requêtes API de l'Agent Mail. Il devient le **bus unique** du système :
- chaque agent y publie ses événements et s'abonne à ceux des autres ;
- le tableau de bord se contente de lire ce bus.

**Format** : CloudEvents 1.0, plus quatre extensions. La spécification impose des noms d'attribut composés uniquement de minuscules ASCII et de chiffres, d'où les noms ci-dessous.

**Compatibilité** : tes entrées actuelles deviennent des événements `net.request`. La vue existante continue de fonctionner et gagne le coût et le quota par agent.

Exemple d'événement :

```json
{
  "specversion": "1.0",
  "id": "01M6D3GHVGBGF9MDXJ1X2D33KB",
  "source": "agent://argentier",
  "type": "finance.document.missing",
  "time": "2026-11-02T04:05:42+01:00",
  "subject": "txn/2026-10-27/-64.90",
  "severity": "warning",
  "correlationid": "01M6D363W01DYKX4E4M9FP11YH",
  "causationid": "01M6D3GFX0KS2C18EKFE7J5HGN",
  "dedupkey": "missing-doc/2026-10-27/-64.90",
  "datacontenttype": "application/json",
  "data": { "date": "2026-10-27", "amount_eur": -64.90, "label": "CB QUINCAILLERIE MARTIN", "mailbox_search": "no_match" }
}
```

Table de stockage (SQLite) :

```sql
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS events (
  seq           INTEGER PRIMARY KEY AUTOINCREMENT,  -- ordre d'insertion = curseur des consommateurs
  id            TEXT NOT NULL UNIQUE,               -- ULID
  time          TEXT NOT NULL,                      -- ISO 8601 avec fuseau
  source        TEXT NOT NULL,
  type          TEXT NOT NULL,
  subject       TEXT,
  severity      TEXT NOT NULL CHECK (severity IN ('debug','info','notice','warning','error','critical')),
  correlationid TEXT,                               -- même valeur pour toute une chaîne inter-agents
  causationid   TEXT,                               -- l'événement qui a directement causé celui-ci
  dedupkey      TEXT,
  data          TEXT NOT NULL CHECK (json_valid(data))
);
CREATE INDEX IF NOT EXISTS ix_events_type_time ON events(type, time);
CREATE INDEX IF NOT EXISTS ix_events_corr ON events(correlationid);
CREATE TABLE IF NOT EXISTS consumer_offsets (consumer TEXT PRIMARY KEY, last_seq INTEGER NOT NULL);
```

**Règles du bus**
- **Ordre de lecture** : les consommateurs suivent `seq`, pas l'ULID. Un ULID reflète l'heure de création, pas l'ordre d'écriture : un événement créé plus tôt peut être écrit plus tard, et deux ULID générés dans la même milliseconde par deux processus ne sont pas ordonnés. `seq`, lui, suit toujours l'ordre d'écriture, car SQLite n'accepte qu'un écrivain à la fois.
- **Idempotence** : chaque action porte une clé naturelle (identifiant de transaction, empreinte de fichier, identifiant d'offre). Rejouer le bus ne crée donc aucun doublon.
- **Fuseaux** : les horodatages sont stockés avec leur fuseau et affichés en heure de Paris.
- **Rétention** : les événements `debug` et `info` sont gardés 30 jours, les autres 2 ans.

### 6.2 Qui parle à qui

| Émetteur | Événement | Consommateur → usage |
|---|---|---|
| Agent Mail | `mail.classified` (avec le casier) | ARGENTIER ← factures, banque, bourse · PRÉCEPTEUR ← études · SOURCIER ← prospection · SISMOGRAPHE ← veille, voyages · FORGE ← dev |
| Agent Mail | `mail.sent` | SOURCIER : historique de l'opportunité |
| ARGENTIER | `mail.search.requested` | Agent Mail : recherche ciblée d'une pièce manquante |
| ARGENTIER | `finance.exposure.updated` | SISMOGRAPHE : poids par pays, secteur et entreprise |
| SISMOGRAPHE | `watch.alert.raised` | ARGENTIER : stress test · SOURCIER : annotation des opportunités du secteur |
| SISMOGRAPHE | `watch.sanctions.match` | SOURCIER : blocage du prospect · ARGENTIER : signalement de la ligne |
| SOURCIER | `crm.email.requested` | Agent Mail : envoi soumis à la politique |
| SOURCIER | `crm.meeting.booked` | PRÉCEPTEUR : replanification |
| SOURCIER | `crm.pipeline.forecast` | ARGENTIER : revenus pondérés dans la trésorerie |
| PRÉCEPTEUR | `study.blocks.scheduled` | SOURCIER : créneaux exclus des propositions de RDV |
| Tous | `agent.error`, `agent.heartbeat` | FORGE : incidents · barre d'état : santé des agents |
| FORGE | `forge.incident.opened`, `forge.incident.resolved` | agent concerné : pause, puis reprise et rattrapage · Brief |

L'Agent Mail devient à la fois le capteur et l'actionneur de tous les agents. Il gagne :
- cinq casiers : « bourse », « études », « prospection », « veille » et « dev » ;
- deux capacités : la recherche à la demande et l'envoi soumis à la politique.

**Registre d'entités commun** (`entities.sqlite`) : chaque entreprise, pays, titre ou personne reçoit un identifiant interne, relié à ses identifiants publics (ISIN, LEI, SIREN, code ISO 3166, QID Wikidata). C'est ce qui permet de savoir que la société d'un article, une ligne de ton ETF et un prospect sont la même entité.
- La résolution se fait d'abord par identifiant exact.
- À défaut, elle se fait par nom et pays, avec un score de similarité.
- En dessous de 0,9, la fusion de deux entités est proposée dans les Approbations, jamais faite d'office.

Deux règles de coordination complètent le tableau :
- **Une carte par chaîne.** Le Brief regroupe les événements par `correlationid`. Un signal qui touche à la fois ARGENTIER et le SOURCIER ne produit donc qu'une seule carte.
- **Un seul agent écrit dans l'agenda à la fois.** Le noyau tient un verrou, ce qui empêche le SOURCIER et le PRÉCEPTEUR de réserver le même créneau.

### 6.3 Erreurs : de l'exception au tableau de bord

| Classe | Détection | Réponse automatique | Ce que tu vois |
|---|---|---|---|
| Transitoire | délai dépassé, HTTP 5xx | 3 essais avec attente exponentielle et aléa (1, 4, 16 min), puis disjoncteur pendant 2 h | rien ; un *warning* si le disjoncteur s'ouvre |
| Quota | HTTP 429, plafond journalier atteint | pause jusqu'à la remise à zéro du quota, ou attente progressive propre à l'API (ex. GDELT) ; les requêtes prioritaires passent d'abord | jauge de quota orange |
| Authentification | HTTP 401 ou 403, consentement expiré | aucun nouvel essai | carte « Action requise » avec lien de ré-authentification (*error*) |
| Dérive de format | 0 élément extrait, schéma JSON invalide, ou contrôle de continuité en échec (la page renvoie encore des éléments, mais plus les bons) | capture de la page, brute et rendue, et incident FORGE | *error*, rétrogradé en *notice* si FORGE répare |
| Qualité de données | contrôle croisé en échec (ex. prix et VL écartés de plus de 1 %) | quarantaine ; la dernière valeur valide est conservée | *warning* |
| Agent muet | aucun signe de vie depuis 2 intervalles | incident FORGE | pastille rouge (*error*) |
| Bogue | exception non gérée | incident FORGE, avec la trace et l'entrée en cause | *error* |

### 6.4 Alertes : qui te dérange, et quand

Un *critical* que l'on finit par ignorer ne protège plus rien. Ce niveau est donc réservé aux événements qui réunissent trois conditions :
1. une action humaine dans les heures qui viennent évite ou limite une perte ;
2. le système ne peut pas faire cette action lui-même (permissions ou interdits, §6.6) ;
3. le déclencheur est un fait vérifié, pas une heuristique qui peut se tromper.

| Gravité | Exemples | Où elle apparaît |
|---|---|---|
| `debug`, `info` | requête API, exécution réussie | journal seulement |
| `notice` | clôture terminée, incident résolu automatiquement, RDV réservé, nouveau support de cours, devoir déposé | Brief de 07:00 |
| `warning` | hausse d'abonnement, dérive hors bande, double débit suspect, rendu à E − 24 h, scénario SISMOGRAPHE au niveau 3 ou 4 (avec push) | badge sur le module, Brief, bandeau si l'application est ouverte |
| `error` | consentement bancaire à renouveler, débit inconnu, réparation refusée, rendu à E − 4 h, entité du CRM sur une liste de sanctions | carte « Action requise » et notification système sur la machine qui affiche ton tableau de bord (notify-send, osascript ou toast Windows) ; push en plus si le manifeste le déclare |
| `critical` | secret présent sur un dépôt distant, CVE activement exploitée (catalogue KEV) sur un service exposé, rendu non déposé à M − 2 h | push mobile via ntfy (priorité `urgent`), à toute heure |

Ce qui n'est pas *critical*, et pourquoi :
- un débit inconnu ou un double débit reposent sur des heuristiques (condition 3), et se contestent pendant 13 mois ;
- une entité du CRM sur une liste de sanctions est déjà bloquée par le SOURCIER (condition 2), et une correspondance par nom peut viser un homonyme (condition 3) ;
- un scénario géopolitique, même au niveau 4, repose sur des indicateurs statistiques (condition 3). De plus, ses push de nuit partent à 07:30, avant l'ouverture d'Euronext Paris à 09:00 : te réveiller ne t'ouvrirait aucune possibilité d'agir sur tes ETF (condition 1).

Règles de routage :
- **Déduplication** : deux alertes de même `dedupkey` à moins de 24 h d'intervalle n'en font qu'une, sauf si la seconde est plus grave. Une escalade n'est jamais absorbée.
- **Heures calmes** : de 22:00 à 07:30. Les notifications système et les push non *critical* y sont retenus, jamais supprimés, et partent à 07:30.
- **Échéances** : un agent qui connaît une échéance avance ses paliers d'alerte hors des heures calmes (règle des 21:30, §4). Même le *critical* d'un rendu n'a donc jamais besoin de te réveiller. Dans le tableau, E est l'échéance effective d'un devoir et M son échéance Moodle (§4).
- **Plafond** : 3 push par jour au maximum pour les exceptions déclarées dans un manifeste sous la gravité *error*, par exemple la réponse « intéressé » d'un prospect ou un scénario SISMOGRAPHE passé au niveau 3. Les *error* déclarées avec push et les *critical* n'y sont pas soumis. Ce qui n'est pas poussé attend le Brief.

### 6.5 Ce qui change dans ton interface actuelle (commun aux cinq agents)

- **Navigation** : Brief · Approbations · Journal · Mail · Finances · Veille · Pipeline · Études · Atelier.
- **Widgets déclaratifs** : chaque agent déclare ses widgets dans son manifeste (type, plus requête sur le bus ou sur sa base). Ton tableau de bord n'a donc besoin que de sept composants génériques : carte, jauge, liste, série temporelle, kanban, treemap et graphe.
- **Brief (07:00)**
  - 7 cartes au plus, triées par gravité × exposition × fraîcheur, avec une seule carte par chaîne ;
  - chaque carte a un lien « Pourquoi ? » qui ouvre la chaîne d'événements correspondante.
- **Approbations**
  - chaque carte montre l'action proposée, la chaîne qui l'a déclenchée et un aperçu (diff, e-mail ou ordre) ;
  - boutons : Approuver · Modifier · Refuser ;
  - après 20 approbations consécutives sans modification, un bouton « Toujours autoriser cette classe » apparaît.
- **Journal** : ta vue actuelle, plus des filtres par agent, gravité et type, et une vue **Chaîne** qui suit un `correlationid` d'un agent à l'autre.
- **Barre d'état** : santé de chaque agent, mode d'autonomie, jauges de budget (appels API, coût LLM) et un bouton **Tout suspendre**.

### 6.6 Autonomie et garde-fous

| Niveau | Comportement | Appliqué par défaut à |
|---|---|---|
| N0 — Ombre | calcule et journalise ce qu'il aurait fait, sans agir | tout nouvel agent, pendant 14 jours |
| N1 — Proposition | prépare l'action et attend ton clic | validation d'une campagne, réponse hors modèle, code hors `selectors.yaml`, patch de sélecteur qui échoue à un contrôle ou suppose un passage au JavaScript, écriture d'OST déduite d'un écart, mise à jour majeure d'une dépendance |
| N2 — Veto | agit après un délai (2 h), sauf si tu annules | nettoyage des caches au-delà du seuil, fusion d'une mise à jour mineure testée |
| N3 — Autonome | agit et journalise | rapprochement, archivage, cartes Anki, blocs du calendrier dédié, envois et relances d'une campagne validée, patch de sélecteur qui passe les contrôles de forme, de continuité et de dates (puis 24 h de probation), écriture d'OST appuyée sur l'avis du courtier |
| Interdit | jamais automatisé | passer un ordre, payer, signer, supprimer définitivement, écrire à un nouveau destinataire hors campagne, déposer un devoir |

Règles de sécurité :
- **Moindre privilège.** L'accès complet à ta machine appartient au système, pas à chaque agent. Un agent qui lit le web avec tous les droits peut être détourné par une instruction cachée dans une page : c'est l'injection de prompt indirecte, risque n° 1 du Top 10 OWASP des applications LLM (édition 2025). Chaque manifeste déclare donc ses dossiers, ses domaines réseau et ses actions.
- **Contenus non fiables.** Pages web, e-mails et PDF sont traités comme des données. Les LLM qui les lisent n'ont aucun outil et ne rendent que du JSON validé ; ce sont des règles écrites en code qui décident des actions.
- **Données sensibles** (banque, fichiers personnels) : modèle local uniquement.
- **Code généré** : exécuté uniquement en conteneur.
- **Secrets** : uniquement dans le trousseau du système.

### 6.7 Manifeste d'agent (exemple complet pour ARGENTIER)

```yaml
# agents/argentier/manifest.yaml
id: argentier
version: 1.0.0
run: uv run --script agents/argentier/main.py   # dépendances déclarées en tête du script (PEP 723)
schedule:
  - { job: banque_import, cron: "0 5 * * *" }    # 1 des 4 accès quotidiens permis sans ta présence
  - { job: cloture, cron: "0 4 * * 1-5" }        # le job sort aussitôt si ce n'est pas le 1er jour ouvré du mois
  - { job: valorisation, cron: "0 21 * * 1-5" }
  - { job: lookthrough, cron: "0 3 * * 0" }
subscribes: [mail.classified, watch.alert.raised, crm.pipeline.forecast]
emits: [finance.close.completed, finance.anomaly.detected, finance.document.missing, finance.exposure.updated, mail.search.requested]
permissions:
  files:
    read: ["~/HubOS/casiers/factures", "~/HubOS/casiers/banque", "~/HubOS/casiers/bourse", "~/HubOS/inbox/banque"]
    write: ["~/Documents/Finances", "~/HubOS/data/argentier"]
  network: [api.enablebanking.com, eodhd.com, data-api.ecb.europa.eu, api.openfigi.com]  # + domaines des émetteurs de tes ETF
  llm: local_only
secrets: [hub/enablebanking_private_key, hub/eodhd_token]   # noms d'entrées dans le trousseau (keyring)
actions:
  archive_document: N3
  write_ledger: N3
  prepare_order: N3
  book_corporate_action_with_notice: N3   # OST appuyée sur l'avis du courtier
  book_corporate_action_inferred: N1      # OST déduite d'un écart : ton clic
  place_order: interdit
alerts:                                   # gravité et push par classe d'alerte (§6.4)
  unknown_debit:        { severity: error, push: true, min_eur: 300 }
  double_debit_suspect: { severity: warning, min_eur: 20, error_from_eur: 300 }
  position_mismatch:    { severity: error }   # warning si une OST l'explique
budgets: { eodhd_calls_per_day: 20 }
health: { heartbeat: 15m, alert_if_no_success_for: 36h }
ui:
  module: Finances
  widgets:
    - { id: cloture, type: jauge, source: "event:finance.close.completed" }
    - { id: derive, type: liste, source: "db:argentier.allocation" }
    - { id: ordre, type: carte, source: "db:argentier.prepared_orders" }
```

---

## 7. Le chemin à rebours : de cette cible à ton hub actuel

**Raisonnement à rebours** — chaque condition permet la précédente :
1. Pour obtenir un **Brief unique**, tous les agents doivent publier au même format, et l'interface doit lire des événements plutôt que du code propre à chaque agent (§6.1).
2. Pour qu'une alerte se chiffre en exposition (Taïwan → 2,8 %), il faut un **registre d'entités commun**, avec des identifiants stables : ISIN, LEI, SIREN, code pays ISO 3166 et identifiant Wikidata. Wikidata relie déjà ces identifiants (propriétés ISIN P946, LEI P1278, SIREN P1616).
3. Pour que les **réparations se fassent sans toi**, chaque agent doit être livré avec des tests, des fixtures, des erreurs typées et un contrôle de continuité de ses collectes. Il faut donc un gabarit d'agent commun.
4. Pour une **autonomie sans danger**, il faut les manifestes, la politique d'autonomie, la boîte d'Approbations, le mode ombre, et des alertes calibrées : un *critical* rare, donc cru.
5. **Tout cela se branche sur ce que tu as déjà** :
   - ton journal temps réel devient le bus ;
   - ton Agent Mail devient le capteur et l'actionneur de tous les agents ;
   - tes casiers deviennent la métaphore commune à tous les agents.

**Ordre de construction**, de ton hub actuel vers la cible :

| Étape | Livrable | Dépend de | Critère de passage (mesurable) |
|---|---|---|---|
| 0. Noyau | table `events` et schéma v1 ; Agent Mail migré ; manifestes ; `keyring` ; Approbations ; « Tout suspendre » ; gabarit d'agent ; 5 nouveaux casiers, recherche et envoi soumis à la politique dans l'Agent Mail | — | 7 jours sans écart entre les mails traités et les `mail.classified` ; « Tout suspendre » testé |
| 1. ARGENTIER | DSP2, avis d'opéré et d'OST, clôture, look-through | 0 | sur 3 mois rejoués : 0 écart de position inexpliqué, ≥ 95 % des opérations justifiées ; cas piégés : deux achats identiques réels à 26 h d'écart ne déclenchent rien, un split 4:1 simulé est reconnu et proposé |
| 2. FORGE | incidents, CVE, sauvegardes | 0, et au moins un agent en service | une panne simulée (sélecteur cassé sur une fixture) réparée en mode ombre ; une fausse réparation simulée (encart « Les plus lus » de 12 cartes) rejetée par le contrôle de continuité ; une restauration de test réussie |
| 3. SISMOGRAPHE | sources, scénarios, exposition | 1 (exposition) | 14 jours de Brief, avec moins de 20 % de cartes jugées « pas pertinent » ; cas piégés : une crise soudaine rejouée (fixture) atteint le niveau 3 en moins d'une heure, PortWatch restant « en attente » ; une série vide suivie d'un article ne lance aucune analyse ; un scénario de moins de 3 indicateurs rapides est refusé |
| 4. SOURCIER | déclencheurs, CRM, séquences d'envoi | 0 (envoi par l'Agent Mail) | une campagne validée ; à l'audit : 0 envoi hors politique, liste d'opposition respectée |
| 5. PRÉCEPTEUR | Moodle, Anki, plan | 0 | 100 % des échéances Moodle présentes dans le plan ; sur un échantillon de 20 cartes, 20 avec une citation exacte ; cas piégés : un bloc fait sur papier n'entraîne aucun report, un devoir laissé en `draft` déclenche bien P2, une révision faite sur le téléphone apparaît dans le journal lu après `sync` ; sur un hub sans écran, Anki relancé par Docker répond de nouveau à AnkiConnect |

Le PRÉCEPTEUR ne dépend que du noyau : si un examen tombe dans les 8 semaines, place-le en étape 1. Pour chaque agent, la règle est la même : 14 jours en mode ombre, puis promotion action par action, depuis la boîte d'Approbations.
