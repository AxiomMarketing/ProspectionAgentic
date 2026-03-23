# ANALYSE : LE SYSTEME PEUT-IL FONCTIONNER SANS OUTILS PAYANTS ?

**Date** : 18 mars 2026
**Question** : Est-ce que les 7 agents peuvent tourner avec 0 EUR d'outils payants ?

---

## REPONSE COURTE

**OUI, le systeme peut fonctionner a ~95% sans outils payants.** Le seul cout incompressible est l'infrastructure serveur (~20-50 EUR/mois) et Claude API (~30-50 EUR/mois). Tout le reste a des alternatives gratuites.

**Cout minimum absolu : ~50-100 EUR/mois** (vs 957 EUR avec outils payants)

La contrepartie : plus de code custom a developper, plus de maintenance, et quelques pertes de qualite (precision emails, volumes LinkedIn).

---

## ANALYSE DETAILLEE PAR AGENT

### AGENT 1 — VEILLEUR

| Outil payant | Cout | Alternative gratuite | Ce qu'on perd |
|-------------|------|---------------------|---------------|
| **Netrows API** (49 EUR) | Donnees LinkedIn entreprises | **Custom scraping Playwright** sur les pages publiques LinkedIn OU **Apollo.io free tier** (50 credits/mois) | Risque ban LinkedIn si mal fait. Volume reduit. |
| **SignalsAPI** (99 EUR) | Signaux recrutement | **Scraping direct LinkedIn Jobs + WTTJ + Indeed** avec Playwright/Puppeteer | Plus de dev, mais memes donnees. WTTJ et Indeed sont scrapables. |
| **Apify** (120 EUR) | Scraping job boards manage | **Custom scrapers Playwright** (self-hosted) | Plus de maintenance, mais equivalent en donnees. |
| **Infra** (50 EUR) | Serveur | **Scaleway DEV1-S** (4 EUR/mois) ou **VPS Hetzner** (4 EUR) | Performance reduite mais suffisante pour les volumes Axiom. |
| BOAMP API | Marches publics | **DEJA GRATUIT** | Rien |
| Lighthouse CLI | Scan performance | **DEJA GRATUIT** (npm) | Rien |
| Wappalyzer | Stack technique | **DEJA GRATUIT** (npm package `wappalyzer`) | Rien |
| axe-core | Accessibilite | **DEJA GRATUIT** (npm) | Rien |

**VERSION GRATUITE AGENT 1 :**
```
BOAMP API          → GRATUIT (deja)
Lighthouse CLI     → GRATUIT (deja)
Wappalyzer npm     → GRATUIT (deja)
axe-core           → GRATUIT (deja)
LinkedIn scraping  → CUSTOM Playwright (gratuit mais risque)
Job boards         → CUSTOM scrapers (gratuit, plus de dev)
Infra              → Hetzner VPS 4 EUR/mois

COUT : ~4 EUR/mois (vs 430 EUR)
EFFORT DEV SUPPLEMENTAIRE : +3-5 jours (scrapers custom)
CE QU'ON PERD : Fiabilite LinkedIn (risque ban), pas d'API managee
```

---

### AGENT 2 — ENRICHISSEUR

| Outil payant | Cout | Alternative gratuite | Ce qu'on perd |
|-------------|------|---------------------|---------------|
| **Dropcontact** (39 EUR) | Email finding RGPD | **Pattern matching custom** (prenom.nom@ + SMTP check) | Precision baisse de 98% a ~60-70% |
| **Hunter.io** (46 EUR) | Email finding | **Pattern matching + SMTP verification maison** | Meme chose, precision moindre |
| **ZeroBounce** (15 EUR) | Verification email | **SMTP check custom** (code Python/Node) | Catch-all non detectes, precision ~80% vs 95% |
| **Kaspr** (79 EUR) | Telephones LinkedIn | **Pas d'alternative gratuite fiable** | On perd les telephones. Pas critique pour email/LinkedIn. |
| **Pappers** (25 EUR) | CA, bilans, dirigeants | **API INSEE Sirene** (GRATUIT) + **annuaire-entreprises.data.gouv.fr** (GRATUIT) + **BODACC API** (GRATUIT) | On perd : CA exact, bilans. On garde : SIRET, effectif tranche, code NAF, dirigeants (INPI). |
| **Societe.com** (40 EUR) | Donnees entreprise complementaires | **Pappers free tier** (100 credits) + **data.gouv.fr** | Moins de donnees financieres detaillees |
| **Wappalyzer API** (30 EUR) | Stack technique | **Wappalyzer npm** (GRATUIT, meme resultat) | Rien, le npm package donne les memes donnees |

**VERSION GRATUITE AGENT 2 :**
```
API INSEE Sirene              → GRATUIT
annuaire-entreprises.data.gouv→ GRATUIT
BODACC API                    → GRATUIT
Wappalyzer npm                → GRATUIT
Lighthouse CLI                → GRATUIT
axe-core                      → GRATUIT
Pattern matching email        → CUSTOM (gratuit, code maison)
SMTP verification             → CUSTOM (gratuit, code maison)
Pappers                       → 100 credits gratuits a l'inscription

COUT : 0 EUR/mois
EFFORT DEV SUPPLEMENTAIRE : +2-3 jours (pattern matcher + SMTP verifier)
CE QU'ON PERD :
  - Precision email : 60-70% au lieu de 95-98%
  - Pas de telephones (Kaspr)
  - Pas de CA exact (mais tranche effectif dispo via INSEE)
  - Pas de bilans financiers detailles
```

**Impact reel de la perte de precision email :**
- Avec outils payants : 95% emails valides → sur 100 envois, 95 arrivent
- Sans outils payants : 65% emails valides → sur 100 envois, 65 arrivent + 35 bounces
- Solution : envoyer d'abord un petit batch (10), mesurer le bounce rate, ajuster
- Le pattern matching fonctionne bien pour les PME francaises (patterns previsibles : prenom.nom@domaine.fr)

---

### AGENT 3 — SCOREUR

**DEJA GRATUIT.** Calcul deterministe local, 0 API externe, 0 cout.

Aucun changement.

---

### AGENT 4 — REDACTEUR

| Outil payant | Cout | Alternative gratuite | Ce qu'on perd |
|-------------|------|---------------------|---------------|
| **Claude API** (12 EUR) | Generation de messages | **Ollama + Llama 3.1/Mistral** (local, gratuit) OU **Claude gratuit via claude.ai** (manuel) | Qualite reduite avec Llama. Claude gratuit = pas d'API, usage manuel. |

**VERSION GRATUITE AGENT 4 :**

**Option A : Ollama local (100% gratuit, 100% automatise)**
```
Ollama + Llama 3.1 70B (ou Mistral Large)
  - Installation : ollama pull llama3.1:70b
  - API locale : http://localhost:11434/api/generate
  - GRATUIT, pas de limites
  - Qualite : ~80% de Claude pour la redaction commerciale
  - Necessite : GPU 48GB VRAM (ou CPU lent)
  - Alternative legere : Llama 3.1 8B (tourne sur n'importe quel Mac M1+)
```

**Option B : Claude API minimale (pas vraiment gratuit mais quasi)**
```
Claude API avec claude-haiku (le moins cher)
  - ~0.001 EUR/message (10x moins cher que Sonnet)
  - 500 messages/mois = 0.50 EUR
  - Qualite : ~85% de Sonnet pour la redaction
  - Suffisant pour la prospection
```

**RECOMMANDATION :** Commencer avec Ollama + Llama 3.1 8B (gratuit, tourne en local). Si la qualite est insuffisante, passer a Claude Haiku (~0.50 EUR/mois).

---

### AGENT 5 — SUIVEUR

| Outil payant | Cout | Alternative gratuite | Ce qu'on perd |
|-------------|------|---------------------|---------------|
| **Waalaxy** (19 EUR) | Automation LinkedIn | **Actions manuelles** ou **custom Playwright** | Risque ban si Playwright. Manuel = 30 min/jour. |
| **SMTP pro** (15 EUR) | Envoi emails | **Gmail API** (gratuit, 500 emails/jour) OU **compte Google Workspace** (deja paye?) | Limite 500 emails/jour (suffisant pour Axiom au debut) |
| **Warmup tools** (30 EUR) | Rechauffement domaine | **Warmup manuel** (envoyer a des contacts reels progressivement) | Plus lent (6-8 semaines vs 3-4) mais meme resultat |
| **Infra** (50 EUR) | Serveur | Partage avec Agent 1 | Deja compte |

**VERSION GRATUITE AGENT 5 :**
```
Gmail API                    → GRATUIT (500 emails/jour, largement suffisant)
LinkedIn                     → MANUEL (20 min/jour) ou Playwright custom (risque)
Warmup                       → MANUEL (envoyer progressivement, gratuit)
Classification reponses      → Ollama local (gratuit) ou Claude Haiku (~0.10 EUR/mois)

COUT : 0 EUR/mois
EFFORT SUPPLEMENTAIRE : ~20-30 min/jour d'actions LinkedIn manuelles
CE QU'ON PERD :
  - Automation LinkedIn (mais 20 connexions/jour a la main = faisable)
  - Warmup pro (mais warmup manuel marche aussi, juste plus lent)
```

**Note sur Gmail API :** L'API Gmail permet d'envoyer 500 emails/jour par compte. Axiom envoie ~20-50 emails/jour → largement dans les limites. Configuration SMTP gratuite via OAuth2.

---

### AGENT 6 — NURTUREUR

| Outil payant | Cout | Alternative gratuite | Ce qu'on perd |
|-------------|------|---------------------|---------------|
| **Claude API** (15 EUR) | Personnalisation nurture | **Ollama local** ou **templates statiques** | Moins personnalise si templates statiques |
| **LinkedIn automation** | Inclus Waalaxy | **Manuel** (5 min/jour) | Meme chose que Agent 5 |

**VERSION GRATUITE AGENT 6 :**
```
Emails nurture          → Gmail API (gratuit)
Personnalisation        → Ollama local OU templates pre-ecrits avec variables simples
LinkedIn engagement     → Manuel (5 min/jour : 2-3 likes + 1 comment)
Re-scoring             → Code local (gratuit, deja le cas)

COUT : 0 EUR/mois
CE QU'ON PERD : Personnalisation IA des emails (remplacable par templates + variables)
```

---

### AGENT 7 — ANALYSTE

| Outil payant | Cout | Alternative gratuite | Ce qu'on perd |
|-------------|------|---------------------|---------------|
| **Claude API** (20 EUR) | Generation rapports | **Ollama local** ou **rapports SQL purs** (pas de resume IA) | Rapports moins "intelligents" mais tout aussi informatifs |
| **Metabase** | Dashboard | **DEJA GRATUIT** (open source, self-hosted) | Rien |
| **Infra** | Serveur | Partage | Deja compte |

**VERSION GRATUITE AGENT 7 :**
```
Requetes SQL               → GRATUIT (PostgreSQL)
Rapports                   → SQL + templates texte (sans IA) ou Ollama local
Dashboard                  → Metabase open source (GRATUIT)
Alertes Slack              → Slack webhook (GRATUIT)

COUT : 0 EUR/mois
CE QU'ON PERD : Resume IA des rapports (remplacable par templates texte structures)
```

---

## COMPARAISON : VERSION PAYANTE vs VERSION GRATUITE

| Agent | Version payante | Version gratuite | Delta |
|-------|----------------|-----------------|-------|
| 1 — VEILLEUR | 430 EUR | ~4 EUR (VPS) | -426 EUR |
| 2 — ENRICHISSEUR | 278 EUR | 0 EUR | -278 EUR |
| 3 — SCOREUR | 0 EUR | 0 EUR | 0 |
| 4 — REDACTEUR | 12 EUR | 0 EUR (Ollama) | -12 EUR |
| 5 — SUIVEUR | 150 EUR | 0 EUR | -150 EUR |
| 6 — NURTUREUR | 37 EUR | 0 EUR | -37 EUR |
| 7 — ANALYSTE | 50 EUR | 0 EUR (Metabase OSS) | -50 EUR |
| **TOTAL** | **957 EUR/mois** | **~4 EUR/mois** | **-953 EUR** |

**Avec infra minimale (VPS + BDD) :** ~20-30 EUR/mois
**Avec Claude Haiku minimal (optionnel) :** +5-10 EUR/mois
**TOTAL VERSION GRATUITE REALISTE : ~30-40 EUR/mois**

---

## CE QU'ON PERD CONCRETEMENT

### Pertes MINEURES (peu d'impact)
- Pas de telephones (Kaspr) → on prospecte par email + LinkedIn de toute facon
- Pas de CA exact (Pappers payant) → tranche effectif INSEE suffit pour le scoring
- Pas de bilans financiers → pas critique pour qualifier un prospect web
- Warmup plus lent (6-8 sem vs 3-4) → patience, meme resultat
- Rapports IA → templates texte structures (meme info, moins joli)

### Pertes MODEREES (impact mesurable)
- **Precision email : 65% vs 95%** → plus de bounces, mais compensable en envoyant d'abord un petit batch test
- **Pas d'automation LinkedIn** → 20-30 min/jour de travail manuel (connexions, likes, messages)
- **Qualite redaction IA** → Llama 3.1 8B est ~80% de Claude Sonnet pour le copywriting. Suffisant pour demarrer.

### Pertes NEGLIGEABLES
- Wappalyzer npm = identique a l'API payante
- BOAMP = deja gratuit
- Lighthouse = deja gratuit
- INSEE Sirene = deja gratuit
- Scoring = deja gratuit (calcul local)
- Metabase = deja gratuit (open source)

---

## EFFORT DE DEVELOPPEMENT SUPPLEMENTAIRE

| Composant custom | Effort dev | Remplace |
|-----------------|-----------|----------|
| Scraper LinkedIn Jobs (Playwright) | 2 jours | Apify/SignalsAPI |
| Scraper WTTJ (Playwright) | 1 jour | Apify |
| Scraper Indeed (Playwright) | 1 jour | HasData |
| Pattern matcher email | 1 jour | Hunter/Dropcontact |
| SMTP verifier custom | 1 jour | ZeroBounce |
| Setup Ollama + prompts | 1 jour | Claude API |
| **TOTAL** | **~7 jours** | ~670 EUR/mois d'outils |

**ROI du dev custom : 7 jours de dev economisent 670 EUR/mois = rembourse en 1 mois.**

---

## STRATEGIE RECOMMANDEE : DEMARRER GRATUIT, AJOUTER LES PAYANTS QUAND CA GENERE DU CA

### Phase 1 (Mois 1-3) : Version 100% gratuite

```
Stack gratuit :
├─ BOAMP API (gratuit)
├─ API INSEE Sirene (gratuit)
├─ annuaire-entreprises.data.gouv.fr (gratuit)
├─ BODACC API (gratuit)
├─ Lighthouse CLI (gratuit)
├─ Wappalyzer npm (gratuit)
├─ axe-core (gratuit)
├─ Scrapers custom Playwright (gratuit)
├─ Pattern matcher email + SMTP verify (gratuit)
├─ Gmail API (gratuit, 500 emails/jour)
├─ Ollama + Llama 3.1 (gratuit)
├─ Metabase (gratuit)
├─ PostgreSQL (gratuit)
├─ n8n self-hosted (gratuit)
├─ Slack webhooks (gratuit)
└─ LinkedIn MANUEL (20-30 min/jour)

Cout total : ~30 EUR/mois (VPS)
```

### Phase 2 (Mois 3-6) : Ajouter les premiers payants quand les premiers deals signent

**Priorite 1 (premier achat, +100 EUR/mois) :**
- Dropcontact (39 EUR) → precision email passe de 65% a 98%
- LinkedIn Sales Navigator (65 EUR) → meilleurs filtres prospects

**Priorite 2 (deuxieme achat, +100 EUR/mois) :**
- Waalaxy (19 EUR) → automatise LinkedIn, gagne 20 min/jour
- Claude Haiku API (5 EUR) → meilleure qualite redaction

**Priorite 3 (troisieme achat, +150 EUR/mois) :**
- Pappers (25 EUR) → CA et bilans pour mieux scorer
- Hunter.io (46 EUR) → fallback email finding
- ZeroBounce (15 EUR) → verification emails pro

### Phase 3 (Mois 6+) : Stack complet si CA > 10K/mois en prospection

Ajouter le reste quand le ROI est prouve.

---

## RESUME

| Question | Reponse |
|----------|---------|
| Ca marche sans outils payants ? | **OUI** |
| Cout minimum | **~30 EUR/mois** (VPS seul) |
| Effort dev supplementaire | **~7 jours** |
| Perte de qualite | **~20-30%** (surtout precision emails) |
| Perte de vitesse | **~30 min/jour** de travail manuel LinkedIn |
| Strategie | **Demarrer gratuit, ajouter les payants quand le CA rentre** |
| Premier outil payant a acheter | **Dropcontact (39 EUR)** — plus gros impact/prix |

**Le systeme a 30 EUR/mois genere les memes leads qu'a 957 EUR/mois. La difference est en precision et en temps manuel. Quand les premiers deals signent, on reinvestit dans les outils qui font gagner du temps.**
