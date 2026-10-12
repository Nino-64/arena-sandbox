Tu travailles sur mon logiciel local, un hub central qui fait déjà tourner un « Agent Mail IA ». Cet agent trie mes mails dans des casiers thématiques (banque, factures, voyages, etc.) et a un tableau de bord avec un journal d'événements en temps réel des requêtes API.

Je veux le transformer en système d'exploitation personnel. L'architecture cible est décrite dans `docs/architecture-agents.md` : cinq nouveaux agents (ARGENTIER, SISMOGRAPHE, SOURCIER, PRÉCEPTEUR, FORGE), un bus d'événements commun, des manifestes d'agent, une boîte d'Approbations, un Brief, des niveaux d'autonomie, et un ordre de construction au §7. Lis ce document en entier avant de commencer : c'est la référence.

En plus de ce document, j'ai une exigence qui n'y figure pas : **je veux pouvoir modifier tous les prompts des agents depuis l'interface du logiciel, sans jamais ouvrir le code.**

## Étape 1 : comprendre l'existant, puis me proposer un plan (n'écris pas encore de code)

1. Explore le dépôt et résume-moi :
   - la stack (langage, framework UI, base de données, planificateur) ;
   - comment l'Agent Mail est structuré ;
   - où vivent aujourd'hui ses prompts, et comment il appelle le LLM ;
   - comment fonctionnent le journal d'événements et le tableau de bord ;
   - comment on lance l'application et les tests.
2. Le document suppose Python + SQLite. Si ma stack est différente, adapte l'architecture à ma stack plutôt que l'inverse, et dis-moi ce que tu changes.
3. Propose un plan découpé en lots livrables, dans l'ordre du §7 du document, avec l'éditeur de prompts dans le lot 0. Pour chaque lot, donne :
   - les fichiers créés ou modifiés ;
   - un critère de fin vérifiable.
4. Pose-moi tes questions s'il te manque une information : quelle banque, quel courtier, quelle plateforme de cours, quelle offre B2B, PC ou NAS. N'invente pas mes réponses.

Attends que je valide le plan avant de coder.

## Lot 0 : le noyau, dont l'éditeur de prompts

### Noyau (voir §6 du document)

- Le journal d'événements actuel devient le bus unique : table `events` au format CloudEvents (§6.1), avec les règles de lecture par `seq`, d'idempotence et de rétention.
- L'Agent Mail est migré sur ce bus, sans perdre aucune fonction existante.
- Mise en place des manifestes d'agent (§6.7), de la boîte d'Approbations, du bouton « Tout suspendre », des niveaux d'autonomie N0 à N3 (§6.6) et des secrets dans le trousseau du système (`keyring`).
- Création des cinq nouveaux casiers de l'Agent Mail, et de ses capacités de recherche à la demande et d'envoi soumis à la politique.

### Registre de prompts

1. Sors **tous** les prompts du code, y compris ceux de l'Agent Mail existant, vers un registre stocké en base. Chaque prompt a :
   - un identifiant stable (ex. `argentier.categorisation_marchand`) ;
   - l'agent auquel il appartient ;
   - une description de son rôle ;
   - le modèle et les paramètres utilisés (température, nombre maximal de tokens) ;
   - la liste de ses variables (ex. `{libelle}`, `{montant}`) ;
   - un numéro de version.
2. Le code ne contient plus aucun texte de prompt, seulement un appel du type `prompts.render("argentier.categorisation_marchand", libelle=..., montant=...)`.
3. Sépare chaque prompt en deux parties :
   - **les instructions**, que je peux modifier librement ;
   - **le contrat de sortie** (format JSON attendu, schéma Pydantic ou équivalent), verrouillé et lié au code.

   Ainsi, une modification de ma part ne peut pas casser le parsing. Le contrat est affiché en lecture seule sous l'éditeur.
4. Les valeurs par défaut restent livrées avec le code, dans un fichier de seed versionné. Un bouton « Revenir au défaut » les restaure.

### Interface « Prompts » dans le logiciel

1. **Liste** : un nouvel onglet ou module « Prompts » affiche les prompts groupés par agent, avec une recherche, la date de dernière modification et un badge « modifié » pour ceux qui diffèrent du défaut.
2. **Éditeur**, par prompt :
   - zone de texte avec coloration des variables ;
   - la liste des variables disponibles, insérables en un clic ;
   - les réglages de modèle (modèle, température, tokens maximum).
3. **Validation à l'enregistrement** : refuser une variable inconnue, signaler une variable obligatoire manquante, et refuser un texte vide.
4. **Bouton « Tester »** :
   - j'exécute le prompt modifié sur un exemple réel tiré du journal (ex. un des 10 derniers mails classés) ou sur une entrée saisie à la main ;
   - j'obtiens la sortie brute, le résultat de la validation du schéma, la durée et le coût estimé ;
   - je compare côte à côte avec la version actuellement en service ;
   - le test ne déclenche jamais d'action réelle (aucun envoi, aucune écriture).
5. **Historique** : chaque enregistrement crée une nouvelle version, avec la date, un commentaire optionnel, le diff avec la version précédente et un bouton « Restaurer cette version ».
6. **Prise en compte à chaud** : le prompt enregistré est utilisé dès le prochain appel, sans redémarrage.
7. **Traçabilité** :
   - chaque modification publie un événement `prompt.updated` sur le bus, visible dans le journal ;
   - chaque appel LLM journalise l'identifiant et la version du prompt utilisés, pour que je puisse relier un mauvais résultat à la version qui l'a produit.
8. **Sécurité** : les prompts qui lisent du contenu non fiable (web, mails, PDF) restent sans outils, comme l'exige le §6.6. L'éditeur ne permet pas d'en ajouter.

### Critères de fin du lot 0

- L'Agent Mail fonctionne exactement comme avant : 7 jours sans écart entre les mails traités et les événements `mail.classified`, ou à défaut un test de non-régression sur un échantillon de mails.
- `grep` ne trouve plus aucun texte de prompt dans le code des agents.
- Je modifie un prompt de l'Agent Mail dans l'interface, je le teste, je l'enregistre, et le mail suivant est classé avec la nouvelle version, sans redémarrage.
- Une version invalide est refusée à l'enregistrement, et « Restaurer » ramène la précédente.

## Lots suivants : un agent à la fois, dans l'ordre du §7

1. Implémente les agents dans l'ordre ARGENTIER, FORGE, SISMOGRAPHE, SOURCIER, PRÉCEPTEUR, sauf si je te dis qu'un examen tombe dans les 8 semaines : le PRÉCEPTEUR passe alors en premier.
2. Pour chaque agent :
   - suis la section du document : scripts, accès fichiers, requêtes réseau, règles exactes, intégration UI ;
   - enregistre tous ses prompts dans le registre, avec leur contrat de sortie ;
   - écris son manifeste ;
   - livre-le en mode Ombre (N0) ;
   - écris des tests, dont les « cas piégés » listés au §7 ;
   - vérifie le critère de passage du §7 avant de passer à l'agent suivant.
3. Avant de coder une intégration externe (Enable Banking, EODHD, GDELT, France Travail, Moodle, AnkiConnect, OSV, etc.), vérifie dans la documentation officielle actuelle :
   - les endpoints ;
   - les quotas ;
   - les conditions d'inscription ;
   - les règles fiscales citées.

   Le document peut contenir des informations périmées. Signale-moi chaque écart.

## Règles permanentes

- Ne casse jamais l'Agent Mail existant. Lance les tests après chaque modification.
- Interdits d'automatisation, sans exception : passer un ordre de bourse, payer, signer, supprimer définitivement, écrire à un destinataire hors campagne validée, déposer un devoir.
- Les données bancaires et personnelles ne partent jamais vers un modèle cloud : utilise un modèle local.
- Les secrets vont dans le trousseau du système, jamais dans le code ni dans un `.env` versionné.
- Fais un commit par étape cohérente, avec un message clair.
- À la fin de chaque lot, donne-moi :
  - ce qui a été fait ;
  - comment le tester moi-même ;
  - ce qui reste incertain.
