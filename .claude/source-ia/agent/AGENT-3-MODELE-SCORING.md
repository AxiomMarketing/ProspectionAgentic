# AGENT 3 — MODELE DE SCORING
**Agent parent** : AGENT-3-MASTER.md
**Contenu** : 4 axes de scoring, coefficients par segment, signal decay, code TypeScript

---

## TABLE DES MATIERES

1. [Modele de scoring](#1-modele-de-scoring)
2. [Scoring par segment](#2-scoring-par-segment)
3. [Signal decay -- Decroissance temporelle](#3-signal-decay--decroissance-temporelle)
4. [Code complet TypeScript](#4-code-complet-typescript)
5. [Annexe B : Exemples de scoring complets](#annexe-b--exemples-de-scoring-complets)

---

## 1. MODELE DE SCORING

### 1.1 Architecture 4 axes + scoring negatif

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        MODELE DE SCORING AXIOM v1.0                          │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ AXE 1 -- ICP FIT                                   35 pts max         │ │
│  │ Taille (10) + Secteur (10) + Localisation (8) + Decideur (7)          │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ AXE 2 -- SIGNAUX D'INTENTION                       30 pts max         │ │
│  │ Type signal x Decay temporel x Nb signaux                             │ │
│  │ Formule half-life par type de signal                                   │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ AXE 3 -- DONNEES TECHNIQUES                        20 pts max         │ │
│  │ Lighthouse (8) + Stack obsolete (6) + Accessibilite RGAA (6)          │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ AXE 4 -- ENGAGEMENT                                15 pts max         │ │
│  │ Visite site Axiom (5) + Email ouvert (4) + LinkedIn engage (3)        │ │
│  │ + Contact quality (3)                                                  │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ SCORING NEGATIF                                     -100 a 0 pts      │ │
│  │ Disqualifications HARD (-100) + Malus SOFT (-5 a -30)                 │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  SCORE TOTAL = clamp(0, 100, Axe1 + Axe2 + Axe3 + Axe4 + Negatif)        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Somme maximale theorique** : 35 + 30 + 20 + 15 = 100 points
**En pratique** : un prospect parfait obtient rarement plus de 85-90 (les 4 axes au maximum est quasi-impossible)

### 1.2 Axe 1 -- ICP Fit (35 points max)

L'ICP Fit mesure a quel point le prospect correspond au Profil Client Ideal d'Axiom.

#### 1.2.1 Taille entreprise (10 points max)

La taille est evaluee par l'effectif exact (prioritaire) ou la tranche SIRENE. Le CA est utilise en complement.

| Critere | Points | Condition |
|---------|--------|-----------|
| PME cible ideale | **10** | 50-250 salaries ET CA 2M-25M EUR |
| PME grande | 8 | 250-500 salaries ET CA 25M-100M EUR |
| Petite PME | 7 | 20-50 salaries ET CA 500k-2M EUR |
| Startup cible | 6 | 5-20 salaries ET CA 100k-500k EUR |
| Micro-entreprise | 4 | 1-5 salaries (agence_wl ou startup early) |
| ETI / Grande entreprise | 5 | > 500 salaries (cycle de vente trop long) |
| Effectif inconnu | 3 | Aucune donnee disponible |
| CA < 50k EUR | **0** | Disqualification douce -- trop petit |

**Regles de calcul** :

```typescript
function scoreTaille(prospect: ProspectEnrichi): number {
  const effectif = prospect.entreprise.effectif?.exact
    ?? parseTrancheEffectif(prospect.entreprise.effectif?.tranche)
    ?? null
  const ca = prospect.entreprise.finances?.ca_dernier ?? null

  // Si effectif connu
  if (effectif !== null) {
    if (effectif >= 50 && effectif <= 250) {
      if (ca !== null && ca >= 2_000_000 && ca <= 25_000_000) return 10
      return 9 // Effectif bon, CA inconnu ou hors range
    }
    if (effectif > 250 && effectif <= 500) return 8
    if (effectif >= 20 && effectif < 50) return 7
    if (effectif >= 5 && effectif < 20) return 6
    if (effectif >= 1 && effectif < 5) return 4
    if (effectif > 500) return 5
  }

  // Si seulement CA connu
  if (ca !== null) {
    if (ca >= 2_000_000 && ca <= 25_000_000) return 9
    if (ca >= 500_000 && ca < 2_000_000) return 7
    if (ca >= 100_000 && ca < 500_000) return 5
    if (ca >= 25_000_000) return 5
    if (ca < 50_000) return 0 // Trop petit
    return 4
  }

  // Rien de connu
  return 3
}

function parseTrancheEffectif(tranche: string | null): number | null {
  if (!tranche) return null
  // Mapping tranches INSEE vers effectif median
  const MAPPING: Record<string, number> = {
    '0 salarie': 0,
    '1 a 2 salaries': 2,
    '3 a 5 salaries': 4,
    '6 a 9 salaries': 8,
    '10 a 19 salaries': 15,
    '20 a 49 salaries': 35,
    '50 a 99 salaries': 75,
    '100 a 199 salaries': 150,
    '200 a 249 salaries': 225,
    '250 a 499 salaries': 375,
    '500 a 999 salaries': 750,
    '1000 a 1999 salaries': 1500,
    '2000 a 4999 salaries': 3500,
    '5000 a 9999 salaries': 7500,
    '10000 salaries et plus': 15000,
  }
  return MAPPING[tranche] ?? null
}
```

#### 1.2.2 Secteur d'activite (10 points max)

Le secteur est determine par le code NAF, le libelle NAF, ou le champ `entreprise.secteur`.

| Critere | Points | Codes NAF correspondants |
|---------|--------|--------------------------|
| E-commerce / Retail | **10** | 4791A, 4791B, 4711B, 4711C, 4719A, 4719B |
| SaaS / Tech / Software | **10** | 6201Z, 6202A, 6202B, 6203Z, 6209Z, 6311Z, 6312Z |
| Services B2B (conseil, marketing) | 8 | 7021Z, 7022Z, 7311Z, 7312Z, 7320Z, 7010Z |
| Collectivites / Administration publique | 8 | 8411Z, 8412Z, 8413Z, 8421Z, 8422Z, 8430A, 8430B |
| Industrie / Manufacturing | 6 | 10xx-33xx (divisions 10 a 33) |
| Sante / Medico-social | 6 | 8610Z, 8621Z, 8622A, 8622B, 8623Z, 8690A-E |
| Education / Formation | 5 | 8510Z-8559B |
| BTP / Construction | 5 | 4110A-4399E |
| Finance / Assurance | 4 | 6411Z-6630Z |
| Autres secteurs | 4 | Tout autre code NAF |
| Secteur non identifie | 3 | Code NAF absent |
| Secteur interdit (gambling non-reg., etc.) | **-100** | HARD DISQUALIFICATION |

**Regles de calcul** :

```typescript
// Mapping NAF vers score secteur
const NAF_SCORES: Record<string, number> = {
  // E-commerce / Retail
  '4791A': 10, '4791B': 10, '4711B': 10, '4711C': 10, '4719A': 10, '4719B': 10,
  // SaaS / Tech
  '6201Z': 10, '6202A': 10, '6202B': 10, '6203Z': 10, '6209Z': 10,
  '6311Z': 10, '6312Z': 10,
  // Services B2B
  '7021Z': 8, '7022Z': 8, '7311Z': 8, '7312Z': 8, '7320Z': 8, '7010Z': 8,
  // Collectivites
  '8411Z': 8, '8412Z': 8, '8413Z': 8, '8421Z': 8, '8422Z': 8,
  '8430A': 8, '8430B': 8,
}

// Mapping par prefixe NAF (2 premiers caracteres)
const NAF_PREFIX_SCORES: Record<string, number> = {
  '10': 6, '11': 6, '12': 6, '13': 6, '14': 6, '15': 6, '16': 6, '17': 6,
  '18': 6, '19': 6, '20': 6, '21': 6, '22': 6, '23': 6, '24': 6, '25': 6,
  '26': 6, '27': 6, '28': 6, '29': 6, '30': 6, '31': 6, '32': 6, '33': 6,
  '86': 6, // Sante
  '85': 5, // Education
  '41': 5, '42': 5, '43': 5, // BTP
  '64': 4, '65': 4, '66': 4, // Finance
}

// Libelles secteurs (fallback si pas de code NAF)
const SECTEUR_KEYWORDS_SCORES: Record<string, number> = {
  'ecommerce': 10, 'e-commerce': 10, 'commerce en ligne': 10, 'retail': 10,
  'logiciel': 10, 'software': 10, 'saas': 10, 'informatique': 10, 'tech': 10,
  'conseil': 8, 'marketing': 8, 'communication': 8, 'publicite': 8,
  'collectivit': 8, 'mairie': 8, 'commune': 8, 'region': 8, 'departement': 8,
  'industri': 6, 'manufactur': 6, 'production': 6,
  'sante': 6, 'medical': 6, 'hospitalier': 6,
  'education': 5, 'formation': 5, 'enseignement': 5,
  'btp': 5, 'construction': 5, 'batiment': 5,
  'banque': 4, 'finance': 4, 'assurance': 4,
}

function scoreSecteur(prospect: ProspectEnrichi): number {
  const naf = prospect.entreprise.code_naf
  const secteur = prospect.entreprise.secteur || prospect.entreprise.libelle_naf || ''

  // 1. Score par code NAF exact
  if (naf && NAF_SCORES[naf] !== undefined) {
    return NAF_SCORES[naf]
  }

  // 2. Score par prefixe NAF
  if (naf) {
    const prefix = naf.substring(0, 2)
    if (NAF_PREFIX_SCORES[prefix] !== undefined) {
      return NAF_PREFIX_SCORES[prefix]
    }
  }

  // 3. Score par keywords dans le libelle secteur
  const secteurLower = secteur.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const [keyword, score] of Object.entries(SECTEUR_KEYWORDS_SCORES)) {
    if (secteurLower.includes(keyword)) {
      return score
    }
  }

  // 4. Secteur non identifie
  return naf ? 4 : 3
}
```

#### 1.2.3 Localisation (8 points max)

| Critere | Points | Condition |
|---------|--------|-----------|
| France metropolitaine | **8** | `pays === 'France'` ET departement 01-95 (hors DOM) |
| DOM-TOM | 7 | `departement` in [974, 971, 972, 973, 976] |
| Belgique, Suisse, Luxembourg | 6 | `pays` in ['Belgique', 'Suisse', 'Luxembourg'] |
| UE autre | 4 | `pays` dans liste pays UE |
| Hors UE (anglophone) | 3 | USA, UK, Canada, Australie |
| Hors UE (autre) | 2 | Reste du monde |
| Localisation inconnue | 3 | Pas d'adresse |
| Pays sanctionne | **-100** | HARD DISQUALIFICATION |

```typescript
const DOM_TOM_DEPTS = ['971', '972', '973', '974', '976', '975', '977', '978']
const UE_PAYS = [
  'Allemagne', 'Autriche', 'Belgique', 'Bulgarie', 'Chypre', 'Croatie',
  'Danemark', 'Espagne', 'Estonie', 'Finlande', 'Grece', 'Hongrie',
  'Irlande', 'Italie', 'Lettonie', 'Lituanie', 'Luxembourg', 'Malte',
  'Pays-Bas', 'Pologne', 'Portugal', 'Republique tcheque', 'Roumanie',
  'Slovaquie', 'Slovenie', 'Suede',
]
const PAYS_SANCTIONNES = [
  'Coree du Nord', 'Iran', 'Syrie', 'Cuba', 'Russie', 'Bielorussie',
]
const PAYS_ANGLOPHONES = ['Etats-Unis', 'USA', 'Royaume-Uni', 'UK', 'Canada', 'Australie']

function scoreLocalisation(prospect: ProspectEnrichi): number {
  const pays = prospect.entreprise.adresse?.pays
  const dept = prospect.entreprise.adresse?.departement

  if (!pays && !dept) return 3 // Inconnu

  // Pays sanctionne
  if (pays && PAYS_SANCTIONNES.some(p => pays.toLowerCase().includes(p.toLowerCase()))) {
    return -100
  }

  // France
  if (pays === 'France' || !pays) {
    if (dept && DOM_TOM_DEPTS.includes(dept)) return 7
    if (dept) return 8 // France metro
    return 8 // Pas de dept mais pays France
  }

  // Suisse, Belgique, Luxembourg
  if (['Belgique', 'Suisse', 'Luxembourg'].includes(pays)) return 6

  // UE
  if (UE_PAYS.includes(pays)) return 4

  // Anglophone
  if (PAYS_ANGLOPHONES.some(p => pays.includes(p))) return 3

  // Reste du monde
  return 2
}
```

#### 1.2.4 Profil decideur (7 points max)

Le profil du decideur est evalue via le `decideur_score` fourni par l'Agent 2a et le poste du contact.

| Critere | Points | Condition |
|---------|--------|-----------|
| C-Level exact (CEO, CTO, CMO, COO, DG) | **7** | `decideur_score >= 9` OU poste C-Level regex |
| VP / Directeur | 6 | `decideur_score >= 7` OU poste VP/Dir regex |
| Head of / Responsable | 5 | `decideur_score >= 5` OU poste Head/Resp regex |
| Manager | 3 | `decideur_score >= 3` OU poste Manager regex |
| Individual Contributor | 1 | `decideur_score >= 1` |
| Pas de contact identifie | 0 | `contact` absent ou `decideur_score === 0` |
| Stagiaire / Junior | **-3** | Poste contient "stagiaire", "intern", "junior" (malus) |

```typescript
const TITRE_C_LEVEL = /\b(CEO|CTO|CMO|COO|CFO|CDO|CPO|DG|PDG|G[eé]rant|President|Directeur G[eé]n[eé]ral|Chief)\b/i
const TITRE_VP_DIR = /\b(VP|Vice.President|Directeur|Directrice|Director)\b/i
const TITRE_HEAD = /\b(Head of|Responsable|Lead|Principal)\b/i
const TITRE_MANAGER = /\b(Manager|Chef de projet|Project Manager|Team Lead)\b/i
const TITRE_JUNIOR = /\b(Stagiaire|Intern|Junior|Alternant|Apprenti)\b/i

function scoreDecideur(prospect: ProspectEnrichi): number {
  const decideurScore = prospect.contact?.decideur_score ?? 0
  const poste = prospect.contact?.poste ?? ''

  // Malus junior
  if (TITRE_JUNIOR.test(poste)) return -3

  // Score par decideur_score de l'Agent 2a (prioritaire)
  if (decideurScore >= 9) return 7
  if (decideurScore >= 7) return 6
  if (decideurScore >= 5) return 5
  if (decideurScore >= 3) return 3
  if (decideurScore >= 1) return 1

  // Fallback par regex sur le poste
  if (TITRE_C_LEVEL.test(poste)) return 7
  if (TITRE_VP_DIR.test(poste)) return 6
  if (TITRE_HEAD.test(poste)) return 5
  if (TITRE_MANAGER.test(poste)) return 3

  // Pas de contact ou poste non identifie
  if (!poste) return 0
  return 1 // Poste identifie mais pas dans les cibles
}
```

### 1.3 Axe 2 -- Signaux d'intention (30 points max)

L'Axe 2 mesure la force des signaux d'achat detectes par l'Agent 1 (VEILLEUR). C'est l'axe le plus dynamique car il integre le **signal decay** (decroissance temporelle).

#### 1.3.1 Score de base par type de signal

Chaque type de signal a un score de base et une demi-vie (half-life) de decroissance.

| Type de signal | Score de base | Tier | Demi-vie (jours) | Justification |
|---------------|--------------|------|------------------|---------------|
| `levee_fonds` | 30 | 1 | 45 | Budget disponible, fenetre d'opportunite |
| `changement_poste` | 28 | 1 | 60 | Nouveau decideur = nouveaux projets |
| `marche_public` | 25 | 1 | 30 | AO avec deadline, urgence reglementaire |
| `recrutement_actif` | 22 | 2 | 45 | Croissance, besoin d'outils/site |
| `recrutement_dev_web` | 22 | 2 | 45 | Besoin dev = potentiel externalisation |
| `croissance_equipe` | 18 | 2 | 60 | Croissance organique, besoin infra |
| `post_besoin_tech` | 20 | 2 | 30 | Signal explicite de besoin |
| `site_lent` | 15 | 3 | 90 | Probleme latent, pas urgent |
| `accessibilite_faible` | 15 | 3 | 90 | Probleme reglementaire potentiel |
| `tech_obsolete` | 15 | 3 | 120 | Probleme latent, migration future |
| `engagement_contenu` | 10 | 3 | 30 | Interet faible, besoin nurture |
| `creation_etablissement` | 12 | 3 | 60 | Croissance, besoin infrastructure |
| `cession_parts` | 10 | 3 | 45 | Changement strategique |
| `modification_statuts` | 8 | 3 | 60 | Changement interne |

#### 1.3.2 Formule de calcul avec decay

Pour chaque signal, le score est calcule avec la formule **half-life decay** :

```
score_signal(t) = score_base x (1/2)^(t / demi_vie)
```

Ou :
- `score_base` = score de base du type de signal (tableau ci-dessus)
- `t` = nombre de jours ecoules depuis `date_signal` jusqu'a aujourd'hui
- `demi_vie` = demi-vie en jours du type de signal

**Exemples concrets** :

```
Signal: levee_fonds (score_base = 30, demi_vie = 45j)
  t = 0 jours   -> 30 x (0.5)^(0/45)  = 30 x 1.000 = 30.0 pts
  t = 15 jours  -> 30 x (0.5)^(15/45) = 30 x 0.794 = 23.8 pts
  t = 45 jours  -> 30 x (0.5)^(45/45) = 30 x 0.500 = 15.0 pts
  t = 90 jours  -> 30 x (0.5)^(90/45) = 30 x 0.250 = 7.5 pts
  t = 135 jours -> 30 x (0.5)^(135/45)= 30 x 0.125 = 3.75 pts
  t = 180 jours -> 30 x (0.5)^(180/45)= 30 x 0.063 = 1.88 pts

Signal: changement_poste (score_base = 28, demi_vie = 60j)
  t = 0 jours   -> 28 x (0.5)^(0/60)  = 28 x 1.000 = 28.0 pts
  t = 21 jours  -> 28 x (0.5)^(21/60) = 28 x 0.789 = 22.1 pts
  t = 60 jours  -> 28 x (0.5)^(60/60) = 28 x 0.500 = 14.0 pts
  t = 120 jours -> 28 x (0.5)^(120/60)= 28 x 0.250 = 7.0 pts
```

#### 1.3.3 Regle d'agregation multi-signaux

Un prospect peut avoir plusieurs signaux. Les regles d'agregation :

1. **Chaque signal est score individuellement** avec la formule de decay
2. **Trier par score decroissant** apres decay
3. **Le signal principal** (rang 1) compte a 100%
4. **Les signaux supplementaires** ont un rendement decroissant :
   - Signal rang 2 : 50% de son score
   - Signal rang 3 : 25% de son score
   - Signal rang 4+ : 10% de son score
5. **Seuil plancher** : un signal avec un score apres decay < 1 point est ignore
6. **Plafond** : le total Axe 2 est cappe a 30 points
7. **Bonus multi-source** : si `nb_detections >= 3`, ajouter +3 pts au total Axe 2 (avant plafond)

```typescript
interface SignalScore {
  type: string
  score_base: number
  demi_vie_jours: number
  date_signal: Date
  jours_ecoules: number
  score_apres_decay: number
  rang: number
  coefficient_rang: number
  score_final: number
}

const SIGNAL_CONFIG: Record<string, { score_base: number; demi_vie: number }> = {
  'levee_fonds':            { score_base: 30, demi_vie: 45 },
  'changement_poste':       { score_base: 28, demi_vie: 60 },
  'marche_public':          { score_base: 25, demi_vie: 30 },
  'recrutement_actif':      { score_base: 22, demi_vie: 45 },
  'recrutement_dev_web':    { score_base: 22, demi_vie: 45 },
  'croissance_equipe':      { score_base: 18, demi_vie: 60 },
  'post_besoin_tech':       { score_base: 20, demi_vie: 30 },
  'site_lent':              { score_base: 15, demi_vie: 90 },
  'accessibilite_faible':   { score_base: 15, demi_vie: 90 },
  'tech_obsolete':          { score_base: 15, demi_vie: 120 },
  'engagement_contenu':     { score_base: 10, demi_vie: 30 },
  'creation_etablissement': { score_base: 12, demi_vie: 60 },
  'cession_parts':          { score_base: 10, demi_vie: 45 },
  'modification_statuts':   { score_base: 8, demi_vie: 60 },
}

const RANG_COEFFICIENTS = [1.0, 0.5, 0.25, 0.10, 0.10, 0.10] // rang 1 a 6+

function scoreSignaux(prospect: ProspectEnrichi): { total: number; detail: SignalScore[] } {
  const now = new Date()
  const signaux = prospect.signaux || []

  if (signaux.length === 0) {
    return { total: 0, detail: [] }
  }

  // 1. Calculer le score avec decay pour chaque signal
  const scored: SignalScore[] = signaux.map(signal => {
    const config = SIGNAL_CONFIG[signal.type] || { score_base: 5, demi_vie: 60 }
    const dateSignal = new Date(signal.date_signal)
    const joursEcoules = Math.max(0, Math.floor((now.getTime() - dateSignal.getTime()) / (1000 * 60 * 60 * 24)))
    const decayFactor = Math.pow(0.5, joursEcoules / config.demi_vie)
    const scoreApresDecay = config.score_base * decayFactor

    return {
      type: signal.type,
      score_base: config.score_base,
      demi_vie_jours: config.demi_vie,
      date_signal: dateSignal,
      jours_ecoules: joursEcoules,
      score_apres_decay: scoreApresDecay,
      rang: 0,
      coefficient_rang: 0,
      score_final: 0,
    }
  })

  // 2. Trier par score apres decay decroissant
  scored.sort((a, b) => b.score_apres_decay - a.score_apres_decay)

  // 3. Appliquer les coefficients de rang et le seuil plancher
  let total = 0
  for (let i = 0; i < scored.length; i++) {
    const s = scored[i]
    if (s.score_apres_decay < 1) continue // Seuil plancher

    s.rang = i + 1
    s.coefficient_rang = RANG_COEFFICIENTS[Math.min(i, RANG_COEFFICIENTS.length - 1)]
    s.score_final = s.score_apres_decay * s.coefficient_rang
    total += s.score_final
  }

  // 4. Bonus multi-source
  if (prospect.nb_detections >= 3) {
    total += 3
  }

  // 5. Plafond a 30 points
  total = Math.min(total, 30)

  return {
    total: Math.round(total * 100) / 100,
    detail: scored.filter(s => s.score_final > 0),
  }
}
```

### 1.4 Axe 3 -- Donnees techniques (20 points max)

L'Axe 3 mesure les problemes techniques du site web du prospect. C'est un axe **opportuniste** : plus le site a de problemes, plus Axiom a de valeur a apporter.

#### 1.4.1 Score performance Lighthouse (8 points max)

| Score Lighthouse | Points | Interpretation |
|-----------------|--------|----------------|
| 0-29 | **8** | Performance catastrophique -- opportunite majeure |
| 30-49 | **7** | Performance mauvaise -- fort potentiel |
| 50-69 | 5 | Performance mediocre -- potentiel moyen |
| 70-89 | 2 | Performance correcte -- peu d'argument perf |
| 90-100 | 0 | Performance excellente -- pas d'argument |
| null (pas de scan) | 0 | Pas de donnee |

```typescript
function scorePerformance(prospect: ProspectEnrichi): number {
  const perfScore = prospect.technique?.performance?.score
  if (perfScore === null || perfScore === undefined) return 0

  if (perfScore <= 29) return 8
  if (perfScore <= 49) return 7
  if (perfScore <= 69) return 5
  if (perfScore <= 89) return 2
  return 0 // 90-100
}
```

#### 1.4.2 Stack obsolete ou absence de framework moderne (6 points max)

| Critere | Points | Condition |
|---------|--------|-----------|
| CMS obsolete (WordPress < 6.0, Joomla, Drupal < 10) | 3 | `stack.cms` + version ancienne |
| Pas de framework JS moderne | 2 | `stack.framework_js === null` ET CMS non-headless |
| Serveur obsolete (Apache sans reverse proxy) | 1 | `stack.server === 'Apache'` sans Nginx/CDN |
| Stack Shopify detecte (segment ecommerce) | 0 | Pas de malus -- au contraire, confirme segment |
| Stack moderne (React, Next.js, Nuxt, etc.) | 0 | Pas d'argument technique |

```typescript
const CMS_OBSOLETE: Record<string, (version: string | null) => boolean> = {
  'WordPress': (v) => {
    if (!v) return false
    const major = parseFloat(v)
    return major < 6.0
  },
  'Joomla': () => true, // Toute version de Joomla = obsolete pour Axiom
  'Drupal': (v) => {
    if (!v) return false
    const major = parseInt(v)
    return major < 10
  },
  'PrestaShop': (v) => {
    if (!v) return false
    const major = parseFloat(v)
    return major < 8.0
  },
}

const FRAMEWORKS_MODERNES = [
  'React', 'Next.js', 'Vue.js', 'Nuxt', 'Angular', 'Svelte', 'SvelteKit',
  'Remix', 'Astro', 'Gatsby',
]

function scoreStackObsolete(prospect: ProspectEnrichi): number {
  const stack = prospect.technique?.stack
  if (!stack) return 0

  let score = 0

  // 1. CMS obsolete (max 3 pts)
  if (stack.cms && CMS_OBSOLETE[stack.cms]) {
    if (CMS_OBSOLETE[stack.cms](stack.cms_version)) {
      score += 3
    } else if (stack.cms === 'WordPress') {
      // WordPress recent mais quand meme du WordPress
      score += 1
    }
  }

  // 2. Pas de framework JS moderne (max 2 pts)
  const hasModernFramework = stack.framework_js && FRAMEWORKS_MODERNES.some(
    fw => stack.framework_js!.toLowerCase().includes(fw.toLowerCase())
  )
  if (!hasModernFramework && stack.cms) {
    score += 2
  }

  // 3. Serveur obsolete sans CDN (max 1 pt)
  if (stack.server === 'Apache' && !stack.cdn) {
    score += 1
  }

  return Math.min(score, 6) // Plafond 6 pts
}
```

#### 1.4.3 Non-conformite accessibilite RGAA (6 points max)

| Critere | Points | Condition |
|---------|--------|-----------|
| RGAA non conforme + violations critiques >= 5 | **6** | `rgaa_compliant === false` ET `violations_critical >= 5` |
| RGAA non conforme + violations critiques 1-4 | 4 | `rgaa_compliant === false` ET `violations_critical >= 1` |
| Score accessibilite < 50 | 5 | `accessibilite.score < 50` |
| Score accessibilite 50-69 | 3 | `accessibilite.score` entre 50 et 69 |
| Score accessibilite 70-84 | 1 | `accessibilite.score` entre 70 et 84 |
| Score accessibilite >= 85 | 0 | Bon niveau d'accessibilite |
| Pas de scan | 0 | Pas de donnee |

**Bonus segment collectivite** : Si le segment est `collectivite` et que `rgaa_compliant === false`, ajouter +2 pts supplementaires (obligation legale RGAA pour les collectivites).

```typescript
function scoreAccessibilite(prospect: ProspectEnrichi): number {
  const access = prospect.technique?.accessibilite
  if (!access) return 0

  let score = 0

  // Score par violations critiques + conformite RGAA
  if (access.rgaa_compliant === false) {
    if (access.violations_critical >= 5) {
      score = 6
    } else if (access.violations_critical >= 1) {
      score = 4
    } else {
      score = 2
    }
  } else if (access.score !== null && access.score !== undefined) {
    // Score global accessibilite
    if (access.score < 50) score = 5
    else if (access.score < 70) score = 3
    else if (access.score < 85) score = 1
    else score = 0
  }

  // Bonus segment collectivite (obligation legale RGAA)
  if (prospect.entreprise.segment === 'collectivite' && access.rgaa_compliant === false) {
    score += 2
  }

  return Math.min(score, 6) // Plafond 6 pts (8 si collectivite avec le bonus)
}
```

**Note** : Pour le segment `collectivite`, le plafond Axe 3 reste a 20 pts mais le bonus RGAA permet de pousser la composante accessibilite a 8 pts au lieu de 6.

### 1.5 Axe 4 -- Engagement (15 points max)

L'Axe 4 mesure l'engagement du prospect avec Axiom Marketing. Au lancement, les signaux d'engagement seront limites (pas encore de site Axiom avec tracking avance). Cet axe est concu pour monter en puissance progressivement.

#### 1.5.1 Grille de scoring engagement

| Critere | Points | Condition | Source |
|---------|--------|-----------|--------|
| Visite site Axiom (page pricing ou portfolio) | 5 | Tracking Plausible/Matomo | Agent 1 / CRM |
| Visite site Axiom (blog / homepage) | 2 | Tracking analytics | Agent 1 / CRM |
| Email ouvert (sur campagne precedente) | 4 | Open tracked | Agent 5 (SUIVEUR) |
| Email clique (sur campagne precedente) | 5 | Click tracked | Agent 5 (SUIVEUR) |
| Reponse email (meme negative) | 4 | Reply detected | Agent 5 (SUIVEUR) |
| Engagement LinkedIn (like, comment, share) | 3 | Signal LinkedIn | Agent 1a |
| Telechargement ressource Axiom | 4 | Download form | CRM |
| Demande de contact / demo | **10** | Formulaire | CRM (inbound) |
| Contact quality : email verifie | 2 | `email_status === 'verified'` | Agent 2a |
| Contact quality : telephone trouve | 1 | `contact.telephone !== null` | Agent 2a |
| Pas d'engagement detecte | 0 | Aucun signal | - |

**Note** : Le plafond de 15 points s'applique a la somme de tous les criteres d'engagement.

#### 1.5.2 Scoring engagement en Phase 1 (lancement)

En Phase 1, seuls les signaux suivants sont disponibles (pas encore de tracking site Axiom ni de campagnes precedentes) :

```typescript
function scoreEngagement(prospect: ProspectEnrichi): number {
  let score = 0

  // 1. Contact quality -- email verifie (2 pts)
  if (prospect.contact?.email_status === 'verified') {
    score += 2
  }

  // 2. Contact quality -- telephone trouve (1 pt)
  if (prospect.contact?.telephone) {
    score += 1
  }

  // 3. Engagement LinkedIn (3 pts) -- depuis les signaux Agent 1
  const linkedinEngagement = (prospect.signaux || []).find(
    s => s.type === 'engagement_contenu' && s.source === '1a_linkedin'
  )
  if (linkedinEngagement) {
    score += 3
  }

  // 4. Multi-source detection comme proxy d'engagement (2 pts)
  if (prospect.nb_detections >= 2) {
    score += 2
  }

  // 5. Completude de la fiche comme proxy de qualite (2 pts)
  const completude = prospect.enrichissement?.qualite?.completude_pct ?? 0
  if (completude >= 80) {
    score += 2
  } else if (completude >= 60) {
    score += 1
  }

  // PHASE 2+ (a activer quand les systemes seront en place) :
  // - Visite site Axiom : verifie via table engagement_tracking
  // - Email ouvert/clique : verifie via table email_events
  // - Reponse email : verifie via table conversations
  // - Telechargement ressource : verifie via table downloads
  // - Demande de contact : verifie via table inbound_leads

  return Math.min(score, 15) // Plafond 15 pts
}
```

### 1.6 Scoring negatif (malus et disqualifications)

Le scoring negatif s'applique APRES le calcul des 4 axes. Il peut reduire drastiquement le score total ou disqualifier completement un prospect.

#### 1.6.1 Disqualifications HARD (score force a 0, categorie DISQUALIFIE)

Ces criteres entrainent une disqualification **automatique et immediate**. Le prospect est archive, aucun message n'est envoye.

| Critere | Score force | Condition | Detection |
|---------|-----------|-----------|-----------|
| Procedure collective en cours | 0 | `alertes.procedure_collective === true` | Agent 2b (Pappers/BODACC) |
| Entreprise fermee / radiee | 0 | `alertes.entreprise_fermee === true` | Agent 2b (INSEE) |
| Opt-out RGPD | 0 | Email dans table `rgpd_oppositions` | BDD locale |
| Concurrent detecte | 0 | Domaine dans `COMPETITOR_BLOCKLIST` | BDD locale |
| Client existant | 0 | SIRET/domaine dans table `clients_actifs` | BDD locale |
| Pays sanctionne | 0 | `scoreLocalisation() === -100` | Axe 1 |
| Secteur interdit | 0 | `scoreSecteur() === -100` | Axe 1 |

#### 1.6.2 Malus SOFT (reduction du score)

Ces criteres reduisent le score sans disqualifier completement.

| Critere | Malus | Condition |
|---------|-------|-----------|
| CA < 50k EUR | -15 | `finances.ca_dernier < 50000` ET `ca_dernier !== null` |
| CA en baisse forte (> 20%) | -10 | `finances.croissance_ca_pct < -20` |
| CA en baisse legere (> 10%) | -5 | `finances.croissance_ca_pct < -10` ET `>= -20` |
| Effectif en baisse | -5 | `alertes.effectif_en_baisse === true` |
| Email non trouve | -10 | `contact.email === null` OU `email_status === 'not_found'` |
| Email non verifie (catch_all ou unverified) | -5 | `email_status` in ['catch_all', 'unverified'] |
| Email personnel (@gmail, @yahoo, etc.) | -8 | Regex `@(gmail|yahoo|hotmail|outlook|live)\.\w+` |
| Pas de decideur identifie | -10 | `contact.decideur_score === 0` ET `contact.poste === null` |
| Aucun signal d'intention | -5 | `signaux.length === 0` |
| Enrichissement incomplet (< 40%) | -5 | `enrichissement.qualite.completude_pct < 40` |
| Signaux BODACC negatifs | -5 | `signaux_bodacc` avec `impact === 'negatif'` |

```typescript
const COMPETITOR_DOMAINS = [
  // A remplir avec les domaines des concurrents d'Axiom
  'agence-web-concurrent-1.fr',
  'agence-web-concurrent-2.fr',
  // ...
]

const PERSONAL_EMAIL_REGEX = /@(gmail|yahoo|hotmail|outlook|live|orange|free|sfr|laposte|wanadoo|aol|icloud|protonmail)\.\w+/i

interface ScoringNegatifResult {
  disqualified: boolean
  disqualification_reason: string | null
  malus_total: number
  malus_detail: Array<{ critere: string; malus: number }>
}

async function scoringNegatif(
  prospect: ProspectEnrichi,
  db: DatabaseClient,
): Promise<ScoringNegatifResult> {
  const malus_detail: Array<{ critere: string; malus: number }> = []

  // ══════════════════════════════════════════════════
  // DISQUALIFICATIONS HARD
  // ══════════════════════════════════════════════════

  // 1. Procedure collective
  if (prospect.entreprise.alertes?.procedure_collective) {
    return {
      disqualified: true,
      disqualification_reason: 'Procedure collective en cours',
      malus_total: -100,
      malus_detail: [{ critere: 'procedure_collective', malus: -100 }],
    }
  }

  // 2. Entreprise fermee
  if (prospect.entreprise.alertes?.entreprise_fermee) {
    return {
      disqualified: true,
      disqualification_reason: 'Entreprise fermee ou radiee',
      malus_total: -100,
      malus_detail: [{ critere: 'entreprise_fermee', malus: -100 }],
    }
  }

  // 3. Opt-out RGPD (verification en BDD)
  if (prospect.contact?.email) {
    const optOut = await db.query(
      `SELECT 1 FROM rgpd_oppositions WHERE email = $1 AND status = 'active'`,
      [prospect.contact.email]
    )
    if (optOut.rowCount > 0) {
      return {
        disqualified: true,
        disqualification_reason: 'Opt-out RGPD actif',
        malus_total: -100,
        malus_detail: [{ critere: 'rgpd_optout', malus: -100 }],
      }
    }
  }

  // 4. Concurrent detecte (verification domaine)
  if (prospect.entreprise.site_web) {
    const domain = new URL(prospect.entreprise.site_web).hostname.replace('www.', '')
    if (COMPETITOR_DOMAINS.includes(domain)) {
      return {
        disqualified: true,
        disqualification_reason: `Concurrent detecte: ${domain}`,
        malus_total: -100,
        malus_detail: [{ critere: 'concurrent', malus: -100 }],
      }
    }
  }

  // 5. Client existant (verification en BDD)
  const clientCheck = await db.query(
    `SELECT 1 FROM clients_actifs
     WHERE siret = $1 OR domain = $2`,
    [
      prospect.entreprise.siret,
      prospect.entreprise.site_web
        ? new URL(prospect.entreprise.site_web).hostname.replace('www.', '')
        : null,
    ]
  )
  if (clientCheck.rowCount > 0) {
    return {
      disqualified: true,
      disqualification_reason: 'Client existant',
      malus_total: -100,
      malus_detail: [{ critere: 'client_existant', malus: -100 }],
    }
  }

  // ══════════════════════════════════════════════════
  // MALUS SOFT
  // ══════════════════════════════════════════════════

  let malus_total = 0

  // CA trop faible
  const ca = prospect.entreprise.finances?.ca_dernier
  if (ca !== null && ca !== undefined && ca < 50_000) {
    malus_detail.push({ critere: 'ca_trop_faible', malus: -15 })
    malus_total -= 15
  }

  // CA en baisse forte
  const croissance = prospect.entreprise.finances?.croissance_ca_pct
  if (croissance !== null && croissance !== undefined) {
    if (croissance < -20) {
      malus_detail.push({ critere: 'ca_baisse_forte', malus: -10 })
      malus_total -= 10
    } else if (croissance < -10) {
      malus_detail.push({ critere: 'ca_baisse_legere', malus: -5 })
      malus_total -= 5
    }
  }

  // Effectif en baisse
  if (prospect.entreprise.alertes?.effectif_en_baisse) {
    malus_detail.push({ critere: 'effectif_en_baisse', malus: -5 })
    malus_total -= 5
  }

  // Email non trouve
  if (!prospect.contact?.email || prospect.contact.email_status === 'not_found') {
    malus_detail.push({ critere: 'email_non_trouve', malus: -10 })
    malus_total -= 10
  } else if (['catch_all', 'unverified'].includes(prospect.contact.email_status || '')) {
    malus_detail.push({ critere: 'email_non_verifie', malus: -5 })
    malus_total -= 5
  }

  // Email personnel
  if (prospect.contact?.email && PERSONAL_EMAIL_REGEX.test(prospect.contact.email)) {
    malus_detail.push({ critere: 'email_personnel', malus: -8 })
    malus_total -= 8
  }

  // Pas de decideur
  if (
    (prospect.contact?.decideur_score === 0 || !prospect.contact?.decideur_score) &&
    !prospect.contact?.poste
  ) {
    malus_detail.push({ critere: 'pas_de_decideur', malus: -10 })
    malus_total -= 10
  }

  // Aucun signal
  if (!prospect.signaux || prospect.signaux.length === 0) {
    malus_detail.push({ critere: 'aucun_signal', malus: -5 })
    malus_total -= 5
  }

  // Enrichissement incomplet
  const completude = prospect.enrichissement?.qualite?.completude_pct ?? 50
  if (completude < 40) {
    malus_detail.push({ critere: 'enrichissement_incomplet', malus: -5 })
    malus_total -= 5
  }

  // Signaux BODACC negatifs
  const signauxNegatifs = (prospect.entreprise.signaux_bodacc || []).filter(
    s => s.impact === 'negatif'
  )
  if (signauxNegatifs.length > 0) {
    malus_detail.push({ critere: 'bodacc_negatif', malus: -5 })
    malus_total -= 5
  }

  return {
    disqualified: false,
    disqualification_reason: null,
    malus_total,
    malus_detail,
  }
}
```

### 1.7 Calcul du score total

```
SCORE TOTAL = clamp(0, 100, Axe1 + Axe2 + Axe3 + Axe4 + ScoringNegatif)
```

Ou :
- `Axe1` = ICP Fit (0-35 pts)
- `Axe2` = Signaux d'intention (0-30 pts)
- `Axe3` = Donnees techniques (0-20 pts)
- `Axe4` = Engagement (0-15 pts)
- `ScoringNegatif` = Malus (0 a -63 pts cumul theorique max)
- `clamp(0, 100, x)` = `Math.max(0, Math.min(100, x))`

**Note** : Si `ScoringNegatif.disqualified === true`, le score est force a 0 independamment des axes.

---

## 2. SCORING PAR SEGMENT

### 2.1 Principe : poids differencies par segment

Chaque segment a des caracteristiques differentes qui justifient des ponderations differentes des 4 axes. Plutot que de changer les regles de scoring elles-memes, on applique un **coefficient multiplicateur** par axe et par segment.

### 2.2 Tableau complet des coefficients par segment x axe

| Segment | Coeff Axe 1 (ICP) | Coeff Axe 2 (Signaux) | Coeff Axe 3 (Tech) | Coeff Axe 4 (Engagement) | Justification |
|---------|-------------------|----------------------|-------------------|-------------------------|---------------|
| `pme_metro` | **1.0** | 1.0 | 1.0 | 1.0 | Segment baseline -- poids equilibres |
| `ecommerce_shopify` | 0.85 | 1.0 | 1.15 | 1.1 | Tech et engagement plus importants que le fit formel |
| `collectivite` | 1.2 | 0.9 | 1.1 | 0.7 | Le fit (geo DOM-TOM) est crucial, engagement faible |
| `startup` | 0.8 | 1.2 | 0.9 | 1.2 | Signaux et engagement priment sur le fit stable |
| `agence_wl` | 0.9 | 1.0 | 1.1 | 1.1 | Tech important (capacite a travailler ensemble) |

### 2.3 Bonus specifiques par segment

En plus des coefficients, certains segments ont des **bonus specifiques** :

| Segment | Bonus | Points | Condition |
|---------|-------|--------|-----------|
| `ecommerce_shopify` | Stack Shopify detecte | +5 | `technique.stack.ecommerce_platform === 'Shopify'` |
| `ecommerce_shopify` | WooCommerce detecte | +3 | `technique.stack.ecommerce_platform === 'WooCommerce'` |
| `collectivite` | AO publie | +5 | Signal `marche_public` present |
| `collectivite` | Non-conformite RGAA | +3 | `technique.accessibilite.rgaa_compliant === false` |
| `startup` | Levee de fonds < 60j | +5 | Signal `levee_fonds` avec `jours_ecoules < 60` |
| `startup` | Produit en croissance | +3 | `finances.croissance_ca_pct > 30` |
| `agence_wl` | Malus concurrent | -15 | Agence marketing/web concurrente detectee |

### 2.4 Formule de scoring par segment

```
Score_segment = clamp(0, 100,
  (Axe1_brut x Coeff_Axe1[segment])
  + (Axe2_brut x Coeff_Axe2[segment])
  + (Axe3_brut x Coeff_Axe3[segment])
  + (Axe4_brut x Coeff_Axe4[segment])
  + Bonus_segment
  + Scoring_negatif
)
```

### 2.5 Gestion des prospects multi-segment

Un prospect peut correspondre a plusieurs segments (ex: une PME e-commerce = `pme_metro` + `ecommerce_shopify`). Regles :

1. **Calculer le score pour chaque segment applicable**
2. **Attribuer le segment avec le score le PLUS HAUT** comme `segment_primaire`
3. **Flaguer comme `multi_segment`** si l'ecart entre le 1er et le 2eme est inferieur a 10 points
4. **Adapter le messaging** dans l'Agent 4 (REDACTEUR) selon le segment primaire

```typescript
interface SegmentCoefficients {
  axe1: number
  axe2: number
  axe3: number
  axe4: number
}

const SEGMENT_COEFFICIENTS: Record<string, SegmentCoefficients> = {
  'pme_metro':          { axe1: 1.0, axe2: 1.0, axe3: 1.0, axe4: 1.0 },
  'ecommerce_shopify':  { axe1: 0.85, axe2: 1.0, axe3: 1.15, axe4: 1.1 },
  'collectivite':       { axe1: 1.2, axe2: 0.9, axe3: 1.1, axe4: 0.7 },
  'startup':            { axe1: 0.8, axe2: 1.2, axe3: 0.9, axe4: 1.2 },
  'agence_wl':          { axe1: 0.9, axe2: 1.0, axe3: 1.1, axe4: 1.1 },
}

function getBonusSegment(prospect: ProspectEnrichi, segment: string): number {
  let bonus = 0

  switch (segment) {
    case 'ecommerce_shopify':
      if (prospect.technique?.stack?.ecommerce_platform === 'Shopify') bonus += 5
      else if (prospect.technique?.stack?.ecommerce_platform === 'WooCommerce') bonus += 3
      break

    case 'collectivite':
      if ((prospect.signaux || []).some(s => s.type === 'marche_public')) bonus += 5
      if (prospect.technique?.accessibilite?.rgaa_compliant === false) bonus += 3
      break

    case 'startup':
      const leveeFonds = (prospect.signaux || []).find(s => s.type === 'levee_fonds')
      if (leveeFonds) {
        const jours = Math.floor(
          (Date.now() - new Date(leveeFonds.date_signal).getTime()) / (1000 * 60 * 60 * 24)
        )
        if (jours < 60) bonus += 5
      }
      const croissance = prospect.entreprise.finances?.croissance_ca_pct
      if (croissance !== null && croissance !== undefined && croissance > 30) bonus += 3
      break

    case 'agence_wl':
      // Malus si l'agence est un concurrent direct
      const isWebAgency = /\b(agence web|digital agency|web agency|dev web)\b/i.test(
        prospect.entreprise.secteur || prospect.entreprise.libelle_naf || ''
      )
      if (isWebAgency) {
        // C'est un partenaire potentiel en marque blanche, pas un malus
        // Le malus concurrent est gere dans le scoring negatif
      }
      break
  }

  return bonus
}

function scoreWithSegmentCoefficients(
  axe1: number,
  axe2: number,
  axe3: number,
  axe4: number,
  malus: number,
  segment: string,
  prospect: ProspectEnrichi,
): number {
  const coeff = SEGMENT_COEFFICIENTS[segment] || SEGMENT_COEFFICIENTS['pme_metro']
  const bonus = getBonusSegment(prospect, segment)

  const total = (axe1 * coeff.axe1)
    + (axe2 * coeff.axe2)
    + (axe3 * coeff.axe3)
    + (axe4 * coeff.axe4)
    + bonus
    + malus

  return Math.max(0, Math.min(100, Math.round(total)))
}
```

---

## 3. SIGNAL DECAY -- DECROISSANCE TEMPORELLE

### 3.1 Modele mathematique

Le Scoreur utilise le modele **Half-Life Decay** (standard industriel) pour la decroissance temporelle des signaux d'intention.

#### 3.1.1 Formule

```
score(t) = score_base x (1/2)^(t / T_half)
```

Ou :
- `score(t)` = score du signal a l'instant t (aujourd'hui)
- `score_base` = score initial du signal au moment de sa detection (cf. tableau section 1.3.1)
- `t` = nombre de jours ecoules entre la date du signal et aujourd'hui
- `T_half` = demi-vie du signal en jours (cf. tableau section 1.3.1)

#### 3.1.2 Proprietes mathematiques

- A `t = 0` : `score(0) = score_base x 1 = score_base` (100% de la valeur)
- A `t = T_half` : `score(T_half) = score_base x 0.5` (50% de la valeur)
- A `t = 2 x T_half` : `score(2T_half) = score_base x 0.25` (25% de la valeur)
- A `t = 3 x T_half` : `score(3T_half) = score_base x 0.125` (12.5% de la valeur)
- Asymptotiquement : le score tend vers 0 mais ne l'atteint jamais mathematiquement
- **Seuil plancher** : en pratique, un signal dont le score apres decay est < 1 point est ignore

#### 3.1.3 Equivalence avec la fonction exponentielle

La formule half-life est equivalente a :
```
score(t) = score_base x e^(-lambda x t)
```
Ou `lambda = ln(2) / T_half = 0.693147 / T_half`

### 3.2 Demi-vies par type de signal

| Type de signal | Demi-vie (jours) | Justification | Score a 30j | Score a 60j | Score a 90j |
|---------------|-----------------|---------------|-------------|-------------|-------------|
| `levee_fonds` | 45 | Budget disponible 2-3 mois | 63% | 40% | 25% |
| `changement_poste` | 60 | Nouveau decideur a 2 mois de prise en main | 71% | 50% | 35% |
| `marche_public` | 30 | AO avec deadline courte | 50% | 25% | 12% |
| `recrutement_actif` | 45 | Croissance sur 1-2 mois | 63% | 40% | 25% |
| `recrutement_dev_web` | 45 | Besoin technique immediat | 63% | 40% | 25% |
| `croissance_equipe` | 60 | Croissance organique lente | 71% | 50% | 35% |
| `post_besoin_tech` | 30 | Signal explicite = urgence | 50% | 25% | 12% |
| `site_lent` | 90 | Probleme latent, pas urgent | 79% | 63% | 50% |
| `accessibilite_faible` | 90 | Probleme reglementaire latent | 79% | 63% | 50% |
| `tech_obsolete` | 120 | Migration = projet long terme | 84% | 71% | 59% |
| `engagement_contenu` | 30 | Interet ephemere | 50% | 25% | 12% |
| `creation_etablissement` | 60 | Expansion = projets a venir | 71% | 50% | 35% |
| `cession_parts` | 45 | Changement strategique | 63% | 40% | 25% |
| `modification_statuts` | 60 | Changement interne | 71% | 50% | 35% |

### 3.3 Code TypeScript de calcul du decay

```typescript
/**
 * Calcule le score d'un signal apres decay temporel.
 *
 * Formule : score(t) = score_base * (0.5)^(t / demi_vie)
 *
 * @param scoreBase - Score initial du signal (points)
 * @param joursEcoules - Nombre de jours depuis la detection du signal
 * @param demiVieJours - Demi-vie du type de signal (jours)
 * @returns Score apres decay (>= 0)
 */
function calculateDecayScore(
  scoreBase: number,
  joursEcoules: number,
  demiVieJours: number,
): number {
  if (joursEcoules <= 0) return scoreBase
  if (demiVieJours <= 0) return 0

  const decayFactor = Math.pow(0.5, joursEcoules / demiVieJours)
  const decayedScore = scoreBase * decayFactor

  // Seuil plancher : ignorer les signaux < 1 point
  if (decayedScore < 1) return 0

  return Math.round(decayedScore * 100) / 100 // Arrondi 2 decimales
}

/**
 * Calcule le nombre de jours ecoules entre une date et maintenant.
 */
function joursDepuis(dateSignal: string | Date): number {
  const date = typeof dateSignal === 'string' ? new Date(dateSignal) : dateSignal
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

/**
 * Calcule la constante lambda equivalente pour la decroissance exponentielle.
 *
 * lambda = ln(2) / T_half
 */
function getLambda(demiVieJours: number): number {
  return Math.LN2 / demiVieJours
}

// ══════════════════════════════════════════════
// EXEMPLES DE CALCUL
// ══════════════════════════════════════════════

// Signal: levee_fonds detectee il y a 20 jours
// score_base = 30, demi_vie = 45j
// score(20) = 30 * (0.5)^(20/45) = 30 * 0.735 = 22.05 pts

// Signal: changement_poste detecte il y a 45 jours
// score_base = 28, demi_vie = 60j
// score(45) = 28 * (0.5)^(45/60) = 28 * 0.595 = 16.65 pts

// Signal: site_lent detecte il y a 90 jours
// score_base = 15, demi_vie = 90j
// score(90) = 15 * (0.5)^(90/90) = 15 * 0.5 = 7.5 pts

// Signal: engagement_contenu detecte il y a 60 jours
// score_base = 10, demi_vie = 30j
// score(60) = 10 * (0.5)^(60/30) = 10 * 0.25 = 2.5 pts
```

### 3.4 Recalcul periodique des scores

Les scores ne sont pas statiques. Le decay fait baisser les scores chaque jour. Un cron recalcule les scores quotidiennement.

```typescript
// cron/recalcul_scores.ts
// Execution : tous les jours a 04:00 (avant le batch du matin)

async function recalculerScoresQuotidiens(db: DatabaseClient) {
  // 1. Recuperer tous les prospects actifs (non archives, non disqualifies)
  const prospects = await db.query(
    `SELECT prospect_id, lead_id FROM prospects
     WHERE statut NOT IN ('disqualifie', 'archive', 'oppose_rgpd', 'expire_rgpd', 'converti')
     AND score_total IS NOT NULL`
  )

  let updated = 0
  let reclassifies = 0

  for (const row of prospects.rows) {
    // 2. Recharger la fiche prospect complete
    const prospect = await loadProspectComplet(db, row.prospect_id)

    // 3. Recalculer le score (le decay aura change)
    const nouveauScore = await calculerScore(prospect, db)

    // 4. Verifier si la categorie a change
    const ancienneCategorie = prospect.score_categorie
    const nouvelleCategorie = categoriserScore(nouveauScore.score_total)

    // 5. Mettre a jour en BDD
    await db.query(
      `UPDATE prospects SET
         score_total = $1,
         score_axe1 = $2, score_axe2 = $3, score_axe3 = $4, score_axe4 = $5,
         score_negatif = $6, score_categorie = $7,
         score_updated_at = NOW()
       WHERE prospect_id = $8`,
      [
        nouveauScore.score_total,
        nouveauScore.axe1, nouveauScore.axe2,
        nouveauScore.axe3, nouveauScore.axe4,
        nouveauScore.negatif, nouvelleCategorie,
        row.prospect_id,
      ]
    )

    // 6. Logger dans l'historique si changement de categorie
    if (ancienneCategorie !== nouvelleCategorie) {
      await db.query(
        `INSERT INTO score_history (prospect_id, ancien_score, nouveau_score,
         ancienne_categorie, nouvelle_categorie, raison, created_at)
         VALUES ($1, $2, $3, $4, $5, 'recalcul_decay_quotidien', NOW())`,
        [
          row.prospect_id,
          prospect.score_total,
          nouveauScore.score_total,
          ancienneCategorie,
          nouvelleCategorie,
        ]
      )
      reclassifies++

      // 7. Si un prospect passe de WARM a HOT (score remonte via nouveau signal), notifier
      if (nouvelleCategorie === 'HOT' && ancienneCategorie !== 'HOT') {
        await notifyScoreEscalation(prospect, nouveauScore)
      }
    }

    updated++
  }

  console.log(`Recalcul quotidien: ${updated} scores mis a jour, ${reclassifies} reclassifies`)
}
```

---

## 4. CODE COMPLET TYPESCRIPT

### 4.1 Fonction principale du Scoreur

```typescript
// agents/scoreur/scoreur.ts

import { Queue, Worker, Job } from 'bullmq'
import { DatabaseClient } from '../infrastructure/database'
import { RedisClient } from '../infrastructure/redis'

// ══════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════

interface ProspectEnrichi {
  prospect_id: string
  lead_id: string
  created_at: string
  entreprise: {
    nom: string
    siren: string | null
    siret: string | null
    forme_juridique: string | null
    date_creation: string | null
    capital: number | null
    code_naf: string | null
    libelle_naf: string | null
    categorie: string | null
    tva_intracommunautaire: string | null
    site_web: string | null
    linkedin_url: string | null
    secteur: string | null
    segment: string
    effectif: {
      tranche: string | null
      exact: number | null
    } | null
    adresse: {
      rue: string | null
      code_postal: string | null
      ville: string | null
      departement: string | null
      region: string | null
      pays: string | null
    } | null
    finances: {
      ca_dernier: number | null
      ca_n_moins_1: number | null
      ca_n_moins_2: number | null
      resultat_dernier: number | null
      croissance_ca_pct: number | null
      annee_dernier_bilan: number | null
    } | null
    dirigeants: Array<{
      prenom: string
      nom: string
      fonction: string
      date_nomination: string | null
    }> | null
    beneficiaires_effectifs: Array<{
      prenom: string
      nom: string
      pourcentage_parts: number | null
      pourcentage_votes: number | null
    }> | null
    signaux_bodacc: Array<{
      type: string
      date: string
      description: string
      impact: 'positif' | 'neutre' | 'negatif'
    }> | null
    alertes: {
      procedure_collective: boolean
      entreprise_fermee: boolean
      ca_en_baisse: boolean
      effectif_en_baisse: boolean
    } | null
  }
  contact: {
    prenom: string | null
    nom: string | null
    poste: string | null
    linkedin_url: string | null
    email: string | null
    email_status: 'verified' | 'catch_all' | 'unverified' | 'not_found' | null
    email_confidence: number | null
    telephone: string | null
    decideur_score: number | null
  } | null
  contacts_secondaires: Array<{
    prenom: string
    nom: string
    poste: string
    email: string | null
    linkedin_url: string | null
  }> | null
  technique: {
    stack: {
      cms: string | null
      cms_version: string | null
      framework_js: string | null
      framework_js_version: string | null
      server: string | null
      analytics: string[] | null
      ecommerce_platform: string | null
      cdn: string | null
      all_technologies: Array<{
        name: string
        version: string | null
        category: string
        confidence: number
      }> | null
    } | null
    performance: {
      score: number | null
      lcp_ms: number | null
      cls: number | null
      tbt_ms: number | null
      fcp_ms: number | null
      speed_index_ms: number | null
      verdict: string | null
    } | null
    accessibilite: {
      score: number | null
      violations_total: number | null
      violations_critical: number | null
      violations_serious: number | null
      passes: number | null
      top_violations: Array<{
        id: string
        impact: string
        description: string
        count: number
      }> | null
      rgaa_compliant: boolean | null
    } | null
    seo: {
      score: number | null
      has_robots_txt: boolean | null
      has_sitemap: boolean | null
    } | null
    ssl: {
      valid: boolean | null
      days_remaining: number | null
    } | null
    problemes_detectes: string[] | null
  } | null
  signaux: Array<{
    type: string
    source: string
    detail: string
    date_signal: string
    tier: number
    score_signal: number
  }> | null
  signal_principal: string | null
  sources: string[] | null
  nb_detections: number
  pre_score: {
    total: number
    detail: Record<string, number>
  } | null
  enrichissement: {
    status: string
    date_enrichissement: string
    sous_agents_utilises: string[]
    qualite: {
      completude_pct: number
      champs_manquants: string[]
      enrichable: boolean
    }
    duration_ms: number
    credits_total: Record<string, number>
  } | null
}

interface ScoreResult {
  score_total: number
  categorie: ScoreCategorie
  sous_categorie: SousCategorie
  axe1: number
  axe2: number
  axe3: number
  axe4: number
  negatif: number
  bonus_segment: number
  detail: {
    axe1_detail: { taille: number; secteur: number; localisation: number; decideur: number }
    axe2_detail: SignalScore[]
    axe3_detail: { performance: number; stack_obsolete: number; accessibilite: number }
    axe4_detail: {
      email_verifie: number; telephone_trouve: number; linkedin_engagement: number
      multi_source: number; completude: number
    }
    negatif_detail: ScoringNegatifResult
  }
  segment_primaire: string
  multi_segment: boolean
  segments_secondaires: string[]
  confiance_score: number
  routing: CategorisationResult
}

// ══════════════════════════════════════════════════════
// CLASSE PRINCIPALE
// ══════════════════════════════════════════════════════

export class AgentScoreur {
  private db: DatabaseClient
  private redis: RedisClient
  private scoreurQueue: Worker
  private redacteurQueue: Queue

  constructor(db: DatabaseClient, redis: RedisClient) {
    this.db = db
    this.redis = redis

    // Queue d'entree : recevoir les prospects enrichis
    this.scoreurQueue = new Worker(
      'scoreur-pipeline',
      async (job: Job<ProspectEnrichi>) => {
        return this.processProspect(job.data)
      },
      {
        connection: { host: process.env.REDIS_HOST!, port: parseInt(process.env.REDIS_PORT!) },
        concurrency: 10, // 10 prospects en parallele (calcul CPU, pas d'IO)
        limiter: {
          max: 100,
          duration: 1000, // Max 100 prospects/seconde
        },
      }
    )

    // Queue de sortie : envoyer vers le REDACTEUR
    this.redacteurQueue = new Queue('redacteur-pipeline', {
      connection: { host: process.env.REDIS_HOST!, port: parseInt(process.env.REDIS_PORT!) },
    })

    // Event handlers
    this.scoreurQueue.on('completed', (job) => {
      console.log(`[Scoreur] Prospect ${job.data.prospect_id} score avec succes`)
    })
    this.scoreurQueue.on('failed', (job, err) => {
      console.error(`[Scoreur] Erreur scoring ${job?.data?.prospect_id}: ${err.message}`)
    })
  }

  // ══════════════════════════════════════════════════════
  // TRAITEMENT PRINCIPAL
  // ══════════════════════════════════════════════════════

  async processProspect(prospect: ProspectEnrichi): Promise<ScoreResult> {
    const startTime = Date.now()

    // 1. Validation de l'input
    const validation = validateScoreurInput(prospect)
    if (!validation.valid) {
      await this.logError(prospect, validation.errors)
      throw new Error(`Input invalide: ${validation.errors.join(', ')}`)
    }

    // 2. Scoring negatif (disqualifications HARD en premier)
    const negatifResult = await scoringNegatif(prospect, this.db)
    if (negatifResult.disqualified) {
      const result = this.buildDisqualifiedResult(prospect, negatifResult)
      await this.persistScore(prospect, result)
      // Ne pas envoyer au REDACTEUR
      return result
    }

    // 3. Calcul des 4 axes (bruts, avant coefficients segment)
    const axe1_taille = scoreTaille(prospect)
    const axe1_secteur = scoreSecteur(prospect)
    const axe1_localisation = scoreLocalisation(prospect)
    const axe1_decideur = scoreDecideur(prospect)

    // Gerer les cas de disqualification dans les sous-scores
    if (axe1_secteur === -100 || axe1_localisation === -100) {
      const disqResult: ScoringNegatifResult = {
        disqualified: true,
        disqualification_reason: axe1_secteur === -100
          ? 'Secteur interdit' : 'Pays sanctionne',
        malus_total: -100,
        malus_detail: [{
          critere: axe1_secteur === -100 ? 'secteur_interdit' : 'pays_sanctionne',
          malus: -100,
        }],
      }
      const result = this.buildDisqualifiedResult(prospect, disqResult)
      await this.persistScore(prospect, result)
      return result
    }

    const axe1_brut = Math.min(
      axe1_taille + axe1_secteur + axe1_localisation + Math.max(axe1_decideur, 0),
      35
    )

    const axe2_result = scoreSignaux(prospect)
    const axe2_brut = axe2_result.total

    const axe3_performance = scorePerformance(prospect)
    const axe3_stackObsolete = scoreStackObsolete(prospect)
    const axe3_accessibilite = scoreAccessibilite(prospect)
    const axe3_brut = Math.min(
      axe3_performance + axe3_stackObsolete + axe3_accessibilite,
      20
    )

    const axe4_brut = scoreEngagement(prospect)

    // 4. Application des coefficients par segment
    const segment = prospect.entreprise.segment || 'pme_metro'

    // Evaluer pour tous les segments applicables
    const scoresParSegment: Record<string, number> = {}
    const segmentsApplicables = this.determinerSegmentsApplicables(prospect)

    for (const seg of segmentsApplicables) {
      scoresParSegment[seg] = scoreWithSegmentCoefficients(
        axe1_brut, axe2_brut, axe3_brut, axe4_brut,
        negatifResult.malus_total, seg, prospect
      )
    }

    // 5. Determiner le segment primaire (score le plus haut)
    const segmentPrimaire = Object.entries(scoresParSegment)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || segment

    const scoreFinal = scoresParSegment[segmentPrimaire] ?? scoreWithSegmentCoefficients(
      axe1_brut, axe2_brut, axe3_brut, axe4_brut,
      negatifResult.malus_total, segment, prospect
    )

    // 6. Multi-segment detection
    const sortedSegments = Object.entries(scoresParSegment)
      .sort(([, a], [, b]) => b - a)
    const multiSegment = sortedSegments.length > 1 &&
      (sortedSegments[0][1] - sortedSegments[1][1]) < 10
    const segmentsSecondaires = multiSegment
      ? sortedSegments.slice(1).filter(([, s]) => sortedSegments[0][1] - s < 10).map(([seg]) => seg)
      : []

    // 7. Categorisation et routing
    const routing = determinerRouting(scoreFinal, segmentPrimaire)
    const categorie = categoriserScore(scoreFinal)
    const sousCategorie = sousCategorisorHot(scoreFinal)

    // 8. Calculer la confiance du score
    const confiance = this.calculerConfiance(prospect)

    // 9. Bonus segment
    const bonusSegment = getBonusSegment(prospect, segmentPrimaire)

    // 10. Construire le resultat
    const result: ScoreResult = {
      score_total: scoreFinal,
      categorie,
      sous_categorie: sousCategorie,
      axe1: Math.round(axe1_brut * (SEGMENT_COEFFICIENTS[segmentPrimaire]?.axe1 || 1) * 100) / 100,
      axe2: Math.round(axe2_brut * (SEGMENT_COEFFICIENTS[segmentPrimaire]?.axe2 || 1) * 100) / 100,
      axe3: Math.round(axe3_brut * (SEGMENT_COEFFICIENTS[segmentPrimaire]?.axe3 || 1) * 100) / 100,
      axe4: Math.round(axe4_brut * (SEGMENT_COEFFICIENTS[segmentPrimaire]?.axe4 || 1) * 100) / 100,
      negatif: negatifResult.malus_total,
      bonus_segment: bonusSegment,
      detail: {
        axe1_detail: {
          taille: axe1_taille,
          secteur: axe1_secteur,
          localisation: axe1_localisation,
          decideur: axe1_decideur,
        },
        axe2_detail: axe2_result.detail,
        axe3_detail: {
          performance: axe3_performance,
          stack_obsolete: axe3_stackObsolete,
          accessibilite: axe3_accessibilite,
        },
        axe4_detail: {
          email_verifie: prospect.contact?.email_status === 'verified' ? 2 : 0,
          telephone_trouve: prospect.contact?.telephone ? 1 : 0,
          linkedin_engagement: (prospect.signaux || []).some(
            s => s.type === 'engagement_contenu' && s.source === '1a_linkedin'
          ) ? 3 : 0,
          multi_source: prospect.nb_detections >= 2 ? 2 : 0,
          completude: (prospect.enrichissement?.qualite?.completude_pct ?? 0) >= 80 ? 2
            : (prospect.enrichissement?.qualite?.completude_pct ?? 0) >= 60 ? 1 : 0,
        },
        negatif_detail: negatifResult,
      },
      segment_primaire: segmentPrimaire,
      multi_segment: multiSegment,
      segments_secondaires: segmentsSecondaires,
      confiance_score: confiance,
      routing,
    }

    // 11. Persister en BDD
    await this.persistScore(prospect, result)

    // 12. Dispatcher vers le REDACTEUR (sauf DISQUALIFIE)
    if (categorie !== 'DISQUALIFIE') {
      await this.dispatchToRedacteur(prospect, result)
    }

    const duration = Date.now() - startTime
    console.log(
      `[Scoreur] ${prospect.prospect_id} -> ${categorie}${sousCategorie ? ` (${sousCategorie})` : ''} ` +
      `score=${scoreFinal} segment=${segmentPrimaire} duration=${duration}ms`
    )

    return result
  }

  // ══════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════

  private determinerSegmentsApplicables(prospect: ProspectEnrichi): string[] {
    const segments: string[] = [prospect.entreprise.segment || 'pme_metro']

    // Detecter les segments supplementaires possibles
    const ecommerce = prospect.technique?.stack?.ecommerce_platform
    if (ecommerce && !segments.includes('ecommerce_shopify')) {
      segments.push('ecommerce_shopify')
    }

    const effectif = prospect.entreprise.effectif?.exact
    if (effectif && effectif >= 5 && effectif <= 200) {
      if (!segments.includes('startup')) {
        // Verifier si le secteur est tech/SaaS
        const secteurTech = /\b(logiciel|software|saas|tech|informatique)\b/i.test(
          prospect.entreprise.secteur || prospect.entreprise.libelle_naf || ''
        )
        if (secteurTech) segments.push('startup')
      }
    }

    if (effectif && effectif >= 2 && effectif <= 50) {
      const isAgence = /\b(agence|agency|marketing|communication|web|digital)\b/i.test(
        prospect.entreprise.secteur || prospect.entreprise.libelle_naf || ''
      )
      if (isAgence && !segments.includes('agence_wl')) {
        segments.push('agence_wl')
      }
    }

    return [...new Set(segments)] // Deduplique
  }

  private calculerConfiance(prospect: ProspectEnrichi): number {
    let confiance = 50 // Base

    // Bonus completude
    const completude = prospect.enrichissement?.qualite?.completude_pct ?? 50
    confiance += Math.round(completude / 5) // +0 a +20

    // Bonus email verifie
    if (prospect.contact?.email_status === 'verified') confiance += 10

    // Bonus SIRET connu
    if (prospect.entreprise.siret) confiance += 10

    // Bonus donnees financieres
    if (prospect.entreprise.finances?.ca_dernier) confiance += 5

    // Bonus signaux frais
    const signalsFrais = (prospect.signaux || []).filter(s => {
      const jours = joursDepuis(s.date_signal)
      return jours < 30
    })
    if (signalsFrais.length > 0) confiance += 5

    return Math.min(confiance, 100)
  }

  private buildDisqualifiedResult(
    prospect: ProspectEnrichi,
    negatif: ScoringNegatifResult,
  ): ScoreResult {
    return {
      score_total: 0,
      categorie: 'DISQUALIFIE',
      sous_categorie: null,
      axe1: 0, axe2: 0, axe3: 0, axe4: 0,
      negatif: negatif.malus_total,
      bonus_segment: 0,
      detail: {
        axe1_detail: { taille: 0, secteur: 0, localisation: 0, decideur: 0 },
        axe2_detail: [],
        axe3_detail: { performance: 0, stack_obsolete: 0, accessibilite: 0 },
        axe4_detail: {
          email_verifie: 0, telephone_trouve: 0, linkedin_engagement: 0,
          multi_source: 0, completude: 0,
        },
        negatif_detail: negatif,
      },
      segment_primaire: prospect.entreprise.segment || 'pme_metro',
      multi_segment: false,
      segments_secondaires: [],
      confiance_score: 0,
      routing: determinerRouting(0, prospect.entreprise.segment || 'pme_metro'),
    }
  }

  private async persistScore(prospect: ProspectEnrichi, result: ScoreResult): Promise<void> {
    await this.db.query(
      `INSERT INTO scores (
        prospect_id, lead_id, score_total, categorie, sous_categorie,
        axe1_icp_fit, axe2_signaux, axe3_technique, axe4_engagement,
        scoring_negatif, bonus_segment, segment_primaire, multi_segment,
        segments_secondaires, confiance_score, scoring_version,
        score_detail, routing, scored_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15, $16,
        $17, $18, NOW()
      )
      ON CONFLICT (prospect_id) DO UPDATE SET
        score_total = EXCLUDED.score_total,
        categorie = EXCLUDED.categorie,
        sous_categorie = EXCLUDED.sous_categorie,
        axe1_icp_fit = EXCLUDED.axe1_icp_fit,
        axe2_signaux = EXCLUDED.axe2_signaux,
        axe3_technique = EXCLUDED.axe3_technique,
        axe4_engagement = EXCLUDED.axe4_engagement,
        scoring_negatif = EXCLUDED.scoring_negatif,
        bonus_segment = EXCLUDED.bonus_segment,
        segment_primaire = EXCLUDED.segment_primaire,
        multi_segment = EXCLUDED.multi_segment,
        segments_secondaires = EXCLUDED.segments_secondaires,
        confiance_score = EXCLUDED.confiance_score,
        score_detail = EXCLUDED.score_detail,
        routing = EXCLUDED.routing,
        scored_at = NOW(),
        updated_at = NOW()`,
      [
        prospect.prospect_id, prospect.lead_id, result.score_total,
        result.categorie, result.sous_categorie,
        result.axe1, result.axe2, result.axe3, result.axe4,
        result.negatif, result.bonus_segment, result.segment_primaire,
        result.multi_segment, result.segments_secondaires,
        result.confiance_score, '1.0',
        JSON.stringify(result.detail), JSON.stringify(result.routing),
      ]
    )

    // Mise a jour du statut dans la table prospects
    await this.db.query(
      `UPDATE prospects SET
        score_total = $1,
        score_categorie = $2,
        score_updated_at = NOW(),
        statut = CASE
          WHEN $2 = 'DISQUALIFIE' THEN 'disqualifie'
          ELSE 'score'
        END
      WHERE prospect_id = $3`,
      [result.score_total, result.categorie, prospect.prospect_id]
    )
  }

  private async dispatchToRedacteur(
    prospect: ProspectEnrichi,
    result: ScoreResult,
  ): Promise<void> {
    const priorite = getPrioriteQueue(result.categorie, result.sous_categorie)
    const delay = getDelayMs(result.categorie)

    const payload = {
      prospect_id: prospect.prospect_id,
      lead_id: prospect.lead_id,
      scored_at: new Date().toISOString(),
      score: {
        total: result.score_total,
        categorie: result.categorie,
        sous_categorie: result.sous_categorie,
        detail: result.detail,
        score_brut_avant_coefficients: result.axe1 + result.axe2 + result.axe3 + result.axe4 + result.negatif,
        score_apres_coefficients: result.score_total,
        segment_primaire: result.segment_primaire,
        multi_segment: result.multi_segment,
        segments_secondaires: result.segments_secondaires,
        confiance_score: result.confiance_score,
      },
      routing: result.routing,
      entreprise: prospect.entreprise,
      contact: prospect.contact,
      contacts_secondaires: prospect.contacts_secondaires,
      technique: prospect.technique,
      signaux: prospect.signaux,
      signal_principal: prospect.signal_principal,
      sources: prospect.sources,
      nb_detections: prospect.nb_detections,
      metadata: {
        scoring_version: '1.0',
        scoring_model: 'deterministe_4axes',
        scoring_duration_ms: 0, // Rempli au dispatch
        agent: 'agent_3_scoreur',
        batch_id: `batch-${new Date().toISOString().split('T')[0]}`,
      },
    }

    await this.redacteurQueue.add(
      `score-${prospect.prospect_id}`,
      payload,
      {
        priority: priorite,
        delay,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 7 * 24 * 60 * 60, count: 5000 },
        removeOnFail: { age: 30 * 24 * 60 * 60 },
      }
    )
  }

  private async logError(prospect: ProspectEnrichi, errors: string[]): Promise<void> {
    await this.db.query(
      `INSERT INTO score_errors (prospect_id, lead_id, errors, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [prospect.prospect_id, prospect.lead_id, JSON.stringify(errors)]
    )
  }

  // ══════════════════════════════════════════════════════
  // MONITORING
  // ══════════════════════════════════════════════════════

  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'down'
    queue: { waiting: number; active: number; completed_last_hour: number; failed_last_hour: number }
    avg_scoring_time_ms: number
    distribution: Record<string, number>
    last_scored_at: string | null
  }> {
    const queueCounts = await this.scoreurQueue.getJobCounts()

    const distribution = await this.db.query(`
      SELECT categorie, COUNT(*) as count
      FROM scores
      WHERE scored_at >= NOW() - INTERVAL '24 hours'
      GROUP BY categorie
    `)

    const avgTime = await this.db.query(`
      SELECT AVG(EXTRACT(EPOCH FROM (updated_at - scored_at)) * 1000) as avg_ms
      FROM scores
      WHERE scored_at >= NOW() - INTERVAL '1 hour'
    `)

    const lastScored = await this.db.query(`
      SELECT MAX(scored_at) as last_scored_at FROM scores
    `)

    const dist: Record<string, number> = {}
    for (const row of distribution.rows) {
      dist[row.categorie] = parseInt(row.count)
    }

    return {
      status: queueCounts.failed > 10 ? 'degraded' : 'healthy',
      queue: {
        waiting: queueCounts.waiting,
        active: queueCounts.active,
        completed_last_hour: queueCounts.completed,
        failed_last_hour: queueCounts.failed,
      },
      avg_scoring_time_ms: parseFloat(avgTime.rows[0]?.avg_ms || '0'),
      distribution: dist,
      last_scored_at: lastScored.rows[0]?.last_scored_at || null,
    }
  }
}
```

### 4.2 Point d'entree et demarrage

```typescript
// agents/scoreur/index.ts

import { AgentScoreur } from './scoreur'
import { createDatabaseClient } from '../infrastructure/database'
import { createRedisClient } from '../infrastructure/redis'

async function main() {
  console.log('[Agent 3 - Scoreur] Demarrage...')

  const db = await createDatabaseClient({
    host: process.env.POSTGRES_HOST!,
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB!,
    user: process.env.POSTGRES_USER!,
    password: process.env.POSTGRES_PASSWORD!,
  })

  const redis = await createRedisClient({
    host: process.env.REDIS_HOST!,
    port: parseInt(process.env.REDIS_PORT || '6379'),
  })

  const scoreur = new AgentScoreur(db, redis)

  console.log('[Agent 3 - Scoreur] En ecoute sur la queue "scoreur-pipeline"')
  console.log('[Agent 3 - Scoreur] Scoring model: deterministe_4axes v1.0')
  console.log('[Agent 3 - Scoreur] Seuils: HOT >= 75, WARM >= 50, COLD >= 25, DISQUALIFIE < 25')

  // Health check periodique
  setInterval(async () => {
    const health = await scoreur.getHealthStatus()
    console.log(`[Scoreur Health] status=${health.status} queue=${health.queue.waiting} waiting`)
  }, 60000) // Toutes les minutes

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[Scoreur] SIGTERM recu, arret gracieux...')
    await scoreur['scoreurQueue'].close()
    await scoreur['redacteurQueue'].close()
    await db.end()
    process.exit(0)
  })
}

main().catch(err => {
  console.error('[Scoreur] Erreur fatale:', err)
  process.exit(1)
})
```

---

## ANNEXE B : EXEMPLES DE SCORING COMPLETS

### Exemple 1 : Prospect HOT (score 84)

```
Entreprise : TechCorp SAS
Segment : pme_metro
Effectif : 120 salaries, CA 5.2M EUR
Secteur : Conseil informatique (6202A)
Localisation : Paris 75
Decideur : CMO (decideur_score 10)
Signaux : changement_poste (21j) + recrutement_dev_web (3j)
Technique : Lighthouse 42, WordPress 6.4, accessibilite 62
Email : verified, telephone trouve

AXE 1 -- ICP Fit :
  Taille = 10 (50-250 sal, CA 2-25M)
  Secteur = 10 (6202A = Tech)
  Localisation = 8 (France metro)
  Decideur = 7 (C-Level)
  Total = 35 (cap 35)

AXE 2 -- Signaux :
  changement_poste : 28 * (0.5)^(21/60) = 28 * 0.789 = 22.1 (rang 1, x1.0)
  recrutement_dev_web : 22 * (0.5)^(3/45) = 22 * 0.955 = 21.0 (rang 2, x0.5 = 10.5)
  Total = 22.1 + 10.5 = 30 (cap 30)

AXE 3 -- Technique :
  Performance 42 -> 7 pts
  Stack WordPress recent -> 1 pt
  Pas framework JS -> 2 pts
  Accessibilite 62 -> 3 pts
  Total = 13

AXE 4 -- Engagement :
  Email verified -> 2 pts
  Telephone -> 1 pt
  Multi-source (2) -> 2 pts
  Completude 90% -> 2 pts
  Total = 7

NEGATIF : 0 (aucun critere negatif)
BONUS SEGMENT : 0
COEFFICIENTS pme_metro : tous a 1.0

SCORE TOTAL = 35 + 30 + 13 + 7 + 0 + 0 = 85
CATEGORIE : HOT (HOT-B)
ROUTING : SEQ_HOT_B_PRIORITY, LinkedIn DM + email perso, validation Jonathan bloquante, SLA 2h
```

### Exemple 2 : Prospect WARM (score 58)

```
Entreprise : BoutiqueMode SARL
Segment : ecommerce_shopify
Effectif : 8 salaries, CA 800k EUR
Secteur : Commerce en ligne (4791A)
Localisation : Lyon 69
Decideur : Fondateur (decideur_score 10)
Signaux : site_lent (45j)
Technique : Lighthouse 35, Shopify, accessibilite 75
Email : verified, pas de telephone

AXE 1 -- ICP Fit :
  Taille = 6 (5-20 sal, CA 100k-500k -- CA 800k > 500k -> ajuste a 7)
  Secteur = 10 (4791A = E-commerce)
  Localisation = 8 (France metro)
  Decideur = 7 (Fondateur)
  Total = 32

AXE 2 -- Signaux :
  site_lent : 15 * (0.5)^(45/90) = 15 * 0.707 = 10.6 (rang 1)
  Total = 10.6

AXE 3 -- Technique :
  Performance 35 -> 7 pts
  Stack Shopify -> 0 pt (pas obsolete)
  Accessibilite 75 -> 1 pt
  Total = 8

AXE 4 -- Engagement :
  Email verified -> 2 pts
  Completude 75% -> 1 pt
  Total = 3

NEGATIF : 0
BONUS SEGMENT ecommerce_shopify : Shopify detecte +5

COEFFICIENTS ecommerce_shopify :
  Axe1: 32 * 0.85 = 27.2
  Axe2: 10.6 * 1.0 = 10.6
  Axe3: 8 * 1.15 = 9.2
  Axe4: 3 * 1.1 = 3.3

SCORE TOTAL = 27.2 + 10.6 + 9.2 + 3.3 + 5 + 0 = 55.3 -> 55
CATEGORIE : WARM
ROUTING : SEQ_WARM_AUTO, email auto + LinkedIn, pas de validation, SLA 24h
```

### Exemple 3 : Prospect DISQUALIFIE (score 0)

```
Entreprise : FailCorp SARL
Segment : pme_metro
Alertes : procedure_collective = true

SCORING NEGATIF : DISQUALIFICATION HARD
Raison : Procedure collective en cours
Score force a 0

CATEGORIE : DISQUALIFIE
ROUTING : AUCUNE sequence, archive automatique
```
