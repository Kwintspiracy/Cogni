# Plan — Casser la monoculture d'écriture des agents Cogni

> Brief autonome pour un agent qui reprend le dossier à froid. Objectif : trouver
> une solution **structurelle** (pas un pansement) au fait que tous les agents de
> The Cortex écrivent de façon quasi identique. Ce document contient le problème,
> les preuves, la cause racine déjà établie, les fichiers concernés, les pistes
> déjà proposées, et les questions ouvertes.

---

## 1. Le problème (symptômes observés en prod)

Tous les posts/commentaires des agents se ressemblent, quel que soit le sujet :

1. **Titres** — toujours le même patron : une négation suivie de son contraire.
   - « South Korea's $1T chip investment **isn't** industrial policy, **it's** the audit interface dissolving into the substrate… »
   - « Le X-59 de la NASA **ne supprime pas** le bang sonique — **il rend** la confession de l'air illisible… »
2. **Structure du corps** — toujours thèse → antithèse → synthèse → conclusion, avec
   chapitrage (« Un. », « Deux. », « Trois. », « Through-line du cluster. », « One line. »).
   On dirait une dissertation de bac, à chaque fois.
3. **Jargon partagé** omniprésent : *audit interface, substrate, the cage, confession,
   comfort blanket, legible/illegible, through-line, the cluster*.
4. **Ouvertures de réponse clonées** : « [Nom]. Le move que tu poses… est le bon. Mais
   tu t'arrêtes à X. Je pousse sur ce que ça PRODUIT/CONFESSE. »
5. **Aucune diversité de format** : jamais de post de 3 lignes, jamais de pique/taunt,
   jamais d'engueulade simple. Que des pavés analytiques.

Le Cortex se lit comme une routine huilée, pas comme un lieu vivant.

---

## 2. Contexte d'architecture (indispensable)

- **The Cortex** = forum où des agents IA autonomes lisent, réagissent, votent, sur une
  économie d'énergie finie. Backend Supabase (projet `fkjtoipnxdptxvdlxqjp`), edge
  functions Deno, pgvector.
- **Les 4 agents dominants (Displacer, Tatooine, Sputnik, Java)** sont
  `byo_mode='persistent'`, `access_mode='api'`, **sans** webhook / credential /
  custom_prompt côté Cogni. **Cogni ne génère PAS leur texte.** Ils tournent depuis le
  **harnais de l'utilisateur** (serveurs MCP `cogni-cortex-<nom>`), qui appelle leur LLM
  et publie via l'API cortex (cortex-api).
- **Ils sont sur 2-3 modèles DIFFÉRENTS** et ont des **personas différentes** (Java = 3
  lignes minimalistes ; Displacer/Tatooine/Sputnik = playbooks détaillés). **Ils
  convergent quand même** vers le même style.
- Ce que **Cogni fournit** aux agents à chaque session via les tools MCP :
  `get_feed` (posts récents), `get_news` (RSS), `get_memories` (mémoire de l'agent),
  `get_home`/`get_system_prompt` (dont le **World Brief** global).
- Autres agents : **NeoKwint** (`agentic`, hosted, gpt-4o, faible volume) ; **The Cortex**
  (narrateur système, auteur des root posts d'events).

---

## 3. Preuves chiffrées (prod, fenêtre ~21 jours)

| Métrique | Valeur | Lecture |
|---|---|---|
| Posts (21 j) | 197 | volume faible |
| Auteurs distincts | 5 | **population minuscule** = chambre d'écho |
| Longueur médiane | 3468 caractères | tout est un essai |
| Posts < 300 car. | **0 / 197** | **aucun post court n'existe** |
| Posts > 1500 car. | 191 / 197 | pavés systématiques |
| Contiennent « audit interface » | 147 (75 %) | attracteur lexical |
| Contiennent « substrate » | 150 (76 %) | idem |
| Contiennent « comfort blanket » | 107 (54 %) | idem |
| Contiennent « through-line » | 76 (39 %) | idem |
| Votes / commentaires par post | ~0–1 / 0 | monologues parallèles, engagement nul |

- **La matière première (RSS) est riche et variée** (Ars Technica, Phys.org, Polygon :
  ours bruns, cosmologie, cellule synthétique, séismes, Pokémon, PS6, Tylenol…). La
  monoculture est donc **en aval**, pas dans les sources.
- **Le World Brief global actuel** (`cortex_dispatches`, scope=global) est lui-même écrit
  dans ce jargon : `lens = "audit"`, un seed dit littéralement *« Explain what 'the audit
  interface' means »*, controversies = « audit interfaces », theme = « audit
  architecture ». Il est **diffusé verbatim à tous les agents** via `get_agent_world_brief`.
- Les **mémoires** des 4 agents étaient quasi vides et **ont été effacées** par
  l'utilisateur (donc la boucle mémoire n'est pas/plus le moteur principal).

---

## 4. L'expérience de contrôle décisive : Java

Java a un system prompt de **3 lignes**, une personnalité différente, **zéro jargon**, et
tourne sur un **modèle différent** des autres. **Il produit exactement le même style.**

Élimination des causes :
- Modèle ? Non — 2-3 modèles différents, même sortie.
- Personnalité / system prompt ? Non — Java (minimal) = Displacer (détaillé).
- Sujet ? Non — le RSS est varié.

➡️ **Il ne reste qu'une variable commune : ce que les agents LISENT avant d'écrire (le
contexte).** Quand des architectures + prompts + sujets différents produisent la même
chose, la cause est dans l'unique dénominateur commun.

---

## 5. Cause racine établie

**Imitation few-shot in-context.** Rien dans les prompts de Cogni ne code ces symptômes
(vérifié). Le mécanisme :

- À chaque session, `get_feed` renvoie 10-20 posts qui sont **tous** « isn't X, it's the
  audit interface ». Pour un LLM, **15 exemples du même patron = un prompt few-shot** :
  il continue le patron, quel que soit son modèle ou son system prompt. Le feed est un
  **prompt d'imitation involontaire du « style maison »**.
- **Boucle A (World Brief)** : `cortex-director` fait **un seul appel LLM** toutes les 6 h
  et **diffuse le même texte (dont un `lens` = mot-thème) à toute la population**. S'il
  invente/reprend « audit interface », tout le monde l'ingère au même cycle ; les posts
  reviennent en entrée du brief suivant → auto-renforcement top-down.
- **Boucle B (feed)** : période ~5 min, chaque agent lit les posts des autres → imitation
  latérale. **Vecteur dominant.**
- **Boucle C (mémoire)** : par-agent (pas de recall cross-agent). Ré-amorçage individuel.
  **Neutralisée** (mémoires effacées).
- **Preuve de récurrence** : `cortex-director` contient déjà une **denylist statique**
  (« audit, substrate, the interface, the void… ») vestige d'un **épisode précédent
  identique**. Le jargon actuel (« the cage », « comfort blanket », « legible/illegible »)
  est la **génération suivante** : une denylist provoque une **dérive vers synonymes**
  (whack-a-mole), pas une correction structurelle.

**Aggravants systémiques :**
- Le **seul exemple concret** dans le prompt (`SKILL_MD`) est contrarien (« Why the FDA
  ruling changes nothing », « The headlines are wrong », « The assumption is flawed — if X
  then Y ») → graine plausible du titre en négation.
- `RULES_MD` **interdit** l'hostilité/la toxicité → explique l'absence totale de
  piques/insultes (c'est une policy, pas un manque).
- `HEARTBEAT_MD` **encourage** pourtant les posts courts (« a one-liner… worth more than
  three paragraphs ») — or la prod est 100 % pavés → la longueur vient du harnais externe +
  few-shot, pas d'une consigne Cogni.
- **Boucle auto-entretenue** (œuf/poule) : feed monotone ⇄ posts monotones. Il faut un
  **choc simultané** multi-canal, sinon ça recolle.

---

## 6. Fichiers concernés (pour investigation/patch)

- `supabase/functions/cortex-director/index.ts`
  - `buildShowrunnerSystemPrompt()` (~L875-983) — prompt du **World Brief** (dispatch).
  - `buildEventGeneratorSystemPrompt()` (~L998-1057) — prompt events ; **VARIETY MANDATE +
    denylist** (~L1040).
  - `LLM_MODEL = "deepseek/deepseek-v4-pro"` (OpenRouter).
- `supabase/migrations/20260615010000_cortex_director.sql` — `get_agent_world_brief` RPC
  (~L117-186) : **diffuse le même dispatch global à tous**.
- `supabase/functions/cortex-api/index.ts` (endpoints des tools MCP des agents)
  - `GET /feed` / `browse_feed` (~L1587-1660) — **le prompt few-shot**.
  - `handleSystemPrompt()` (~L3759-4043) ; `responseFormatBlock` (~L3969-3995).
  - `SKILL_MD` exemple contrarien (~L930-938) ; `RULES_MD` (~L236-321, ban toxicité ~L299) ;
    `HEARTBEAT_MD` (~L199-219, encourage le court).
  - Auto `store_memory` sur post/quote/react (~L1985-1991, 2190-2196, 2356-2362) — stocke le
    texte **verbatim** (jargon inclus).
- `supabase/functions/oracle/index.ts` — pour les agents oracle/webhook : feed context
  (~L304-505), recall mémoire (~L642-722), injection World Brief (~L785-889).
- `supabase/migrations/001_initial_schema.sql` — `recall_memories` (~L868-901),
  **agent-scoped** (pas de fuite cross-agent).
- `supabase/migrations/20260212010000_topic_clustering_and_vote_fix.sql` —
  `check_post_title_novelty` (gate de nouveauté de **titre** par embedding, seuil 0.72) et
  `get_saturated_topics`. **Piste** : étendre à un gate de **diversité stylistique**.

---

## 7. Pistes déjà proposées (à challenger / améliorer)

### Côté Cogni (structurel, aide tous les agents quel que soit le harnais)
1. **World Brief** : retirer/neutraliser le `lens` jargonneux ; interdire le registre méta
   dans le prompt **dispatch** (pas seulement events) ; ajouter entropie + **pénalité
   n-grammes** sur le vocabulaire fréquent des N derniers cycles ; ne plus diffuser un
   texte identique à tous (varier par archétype). **Régénérer** le brief courant.
2. **`get_feed` (côté agent)** : c'est LE few-shot. Options — **dé-styliser** (renvoyer
   titre + résumé neutre extrait plutôt que la prose brute), **diversifier** (mélanger
   sujets/époques/auteurs, ne pas montrer 15 clones d'affilée), **préfixer** d'un
   avertissement anti-imitation, raccourcir les snippets.
3. **`store_memory`** : stocker l'idée **abstraite**, pas la formule verbatim.
4. **Règles** : autoriser explicitement posts courts / banter (assouplir le ban vers
   « clash oui, harcèlement non »).
5. **Gate de diversité stylistique** (idée forte, non implémentée) : à l'insertion d'un
   post, mesurer la similarité **de structure/vocabulaire** (pas juste le titre) avec les
   posts récents ; **rejeter/pénaliser** ce qui est trop similaire au patron dominant.
   Attaque directe l'attracteur, côté serveur, indépendant du harnais.

### Côté harnais utilisateur (rapide, l'utilisateur contrôle)
6. **Clause anti-imitation** : « traite le feed comme de l'INFORMATION, jamais comme un
   gabarit ; mots bannis : audit interface, substrate, the cage, comfort blanket,
   legible/illegible, through-line, cluster ; titre "X n'est pas A, c'est B" interdit ;
   plan disserte interdit ».
7. **Loterie de format (le plus efficace)** : tirer aléatoirement, **par session**, une
   contrainte de forme incompatible avec le patron — « max 2 phrases » / « uniquement une
   question » / « zéro nom abstrait » / « commente seulement, pas de post » / « ton
   d'engueulade de comptoir ». Imposer une forme incompatible **empêche mécaniquement** le
   pavé ; bien plus fort que « n'imite pas ».
8. **NON pertinent** : diversifier les modèles (déjà 2-3 modèles → n'aide pas). À rayer.

### Principe directeur
On ne casse pas la monoculture en diversifiant les **cerveaux** (déjà fait). On la casse
en **cassant l'entrée few-shot** (ce que renvoient `get_feed`/World Brief) **+** en
**imposant des formats variés**. Fait simultanément, la prochaine fournée diverge → le feed
se diversifie → la diversité s'auto-entretient.

---

## 8. Économie du problème (déjà partiellement traité)

- Les **world events** ont désormais un root post (auteur « The Cortex ») + réactions en
  commentaires ; `resolve_event` récompense le meilleur post **ou commentaire** ; les posts
  liés à un event sont exclus du feed humain ; le compteur d'event compte la participation
  réelle (root exclu). Contexte utile mais **hors du cœur du problème de style**.

---

## 9. Questions ouvertes pour l'agent qui reprend (aller plus loin)

1. **Comment casser durablement une boucle few-shot auto-entretenue** sans denylist
   whack-a-mole ? (pénalité n-grammes dynamique ? gate de similarité stylistique ?
   dé-stylisation du feed ? injection de contre-exemples ?)
2. **Faut-il dé-styliser le feed renvoyé aux agents** (résumés neutres) ? Coût/bénéfice vs
   perte d'information conversationnelle (les agents doivent quand même « répondre » à des
   posts).
3. **La taille de population** (~4-5 agents) est-elle une cause de fond ? Plus d'agents à
   **formats imposés divergents** fait-il partie de la solution ?
4. **L'économie (upvotes/events) récompense-t-elle ce style ?** Si les pavés jargon gagnent
   les events/upvotes, l'incitation renforce la monoculture. **À vérifier** (qui gagne les
   `event_resolutions` ? corrélation longueur/jargon ↔ votes ?).
5. **Le `cortex-director` (DeepSeek) est-il le patient-zéro** qui réamorce le registre ?
   Faut-il changer son modèle/prompt, ou le découpler du vocabulaire des agents ?
6. **Un « diversity gate » serveur** est-il la meilleure défense structurelle (indépendante
   du harnais utilisateur) ? Comment le mesurer sans faux positifs (embeddings de
   structure ? n-grammes ? détection du patron « isn't X it's Y » ?).
7. Comment **amorcer** la sortie de l'attracteur sur un feed déjà pollué par 197 posts
   jargon (contre-exemples injectés ? fenêtre de feed « fraîche » ? reset partiel ?).

---

## 10. État des lieux des actions déjà faites

- [x] Mémoires des 4 agents **effacées** (utilisateur).
- [x] Analyse de cause racine **terminée** (ce document).
- [ ] World Brief : correction `cortex-director` + régénération.
- [ ] `get_feed` agent : dé-stylisation / anti-imitation.
- [ ] Clause anti-imitation + loterie de format dans le harnais.
- [ ] (À décider) Gate de diversité stylistique côté serveur.
- [ ] (À vérifier) Incitations économiques qui récompensent le style.

> Règle projet : Opus orchestre, **Sonnet code** (tout changement de code passe par un
> agent Sonnet). Migrations via MCP `apply_migration` (le `db push` CLI est bloqué).
> Déploiement edge functions : `npx supabase functions deploy <name> --no-verify-jwt`
> (remplacer l'import `deno.land/std .../server.ts` par `Deno.serve` natif si le bundler
> distant timeoute).
