# Agent 9 — APPELS D'OFFRES — Détails d'implémentation complets

**Complément à :** `09-AGENT-9-APPELS-OFFRES.md`

---

## 1. PRISMA SCHEMA — Tables spécifiques Agent 9

### Nouvelles tables à créer

```prisma
model AoAnalyse {
  id                String   @id @default(uuid())
  tenderId          String   @unique
  tender            PublicTender @relation(fields: [tenderId], references: [id])

  // Analyse DCE (9a)
  dceExtracted      Boolean  @default(false)
  dcePageCount      Int?
  dceDocuments      Json?    // Liste des documents extraits avec métadonnées
  exigencesTech     Json?    // Exigences techniques identifiées
  criteresEval      Json?    // Critères d'évaluation et pondérations
  conditionsPartic  Json?    // Conditions de participation
  piecesExigees     Json?    // Pièces exigées (DC1, DC2, DUME, etc.)
  flagsConditionnels Json?   // RSE, RGAA, volet social
  motsClesMiroir    Json?    // Mots-clés à reprendre dans le mémoire
  strategiePrix     String?  // recommandation stratégie prix

  // Scoring GO/NO-GO (9b)
  scoreAxes         Json?    // 7 axes de scoring
  scoreTotalGo      Float?
  decision          String?  // GO | POSSIBLE | NO_GO | ECARTE
  decisionReason    String?
  jonathanReviewAt  DateTime?
  jonathanDecision  String?  // CONFIRME_GO | FORCE_GO | NO_GO

  // Workflow
  status            String   @default("ANALYZING") // ANALYZING → QUALIFIED → GO → IN_PROGRESS → SUBMITTED → WON → LOST
  retroplanning     Json?    // Dates clés du rétroplanification

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  exigences         AoExigence[]
  questions         AoQuestion[]

  @@index([tenderId])
  @@index([status])
  @@map("ao_analyses")
}

model AoExigence {
  id          String     @id @default(uuid())
  analyseId   String
  analyse     AoAnalyse  @relation(fields: [analyseId], references: [id])
  code        String     // EX-001, EX-002...
  type        String     // technique | administrative | financiere | qualite
  description String
  source      String     // RC, CCTP, CCAP...
  pageRef     String?    // "RC p.12"
  priorite    String     @default("OBLIGATOIRE") // OBLIGATOIRE | RECOMMANDE | OPTIONNEL
  couvert     Boolean    @default(false)

  @@index([analyseId])
  @@map("ao_exigences")
}

model AoQuestion {
  id          String     @id @default(uuid())
  analyseId   String
  analyse     AoAnalyse  @relation(fields: [analyseId], references: [id])
  code        String     // Q-001, Q-002...
  question    String
  contexte    String?
  urgence     String     @default("MOYENNE") // HAUTE | MOYENNE | BASSE
  reponse     String?
  reponduAt   DateTime?

  @@index([analyseId])
  @@map("ao_questions")
}

model AoDossierAdmin {
  id          String   @id @default(uuid())
  analyseId   String   @unique

  dc1Generated     Boolean @default(false)
  dc2Generated     Boolean @default(false)
  dumeGenerated    Boolean @default(false)
  attestationsOk   Boolean @default(false)
  kbisValid        Boolean @default(false)
  kbisExpiresAt    DateTime?
  urssafValid      Boolean @default(false)
  urssafExpiresAt  DateTime?
  fiscaleValid     Boolean @default(false)
  rcProValid       Boolean @default(false)

  piecesGenerees   Json?   // Liste des PDF générés avec chemins
  status           String  @default("PENDING") // PENDING | IN_PROGRESS | COMPLETE | EXPIRED_DOCS

  createdAt        DateTime @default(now())

  @@map("ao_dossier_admin")
}

model AoOffreFinanciere {
  id          String   @id @default(uuid())
  analyseId   String   @unique

  typeDocument     String  // BPU | DQE | DPGF
  montantTotal     Float?
  margeNette       Float?  // %
  margeLodeom      Float?  // Abattement LODEOM si applicable
  strategiePrix    String? // AGRESSIVE | EQUILIBREE | PREMIUM

  lignesBudget     Json?   // Détail des postes
  documentGenere   String? // Chemin vers le fichier Excel/PDF

  jonathanValidAt  DateTime?
  status           String  @default("DRAFT") // DRAFT | VALIDATED | FINAL

  createdAt        DateTime @default(now())

  @@map("ao_offre_financiere")
}

model AoMemoireTechnique {
  id          String   @id @default(uuid())
  analyseId   String   @unique

  chapitres        Json?   // 5 chapitres avec contenu
  referencesUsees  Json?   // Fiches références sélectionnées
  schemasGeneres   Json?   // Mermaid diagrams paths
  flagsActives     Json?   // RSE, RGAA, volet social

  ratioIaHumain    Float?  // Ratio estimé IA/humain (cible 60/40)
  scoreAntiDetect  Float?  // Score Copyleaks estimé
  nbPages          Int?

  documentMd       String? // Chemin markdown
  documentPdf      String? // Chemin PDF final

  status           String  @default("DRAFT") // DRAFT | REVIEW | VALIDATED | FINAL

  createdAt        DateTime @default(now())

  @@map("ao_memoire_technique")
}

model AoControleQa {
  id          String   @id @default(uuid())
  analyseId   String   @unique

  checklistItems   Json?   // 29 points avec statut pass/fail
  nbPass           Int     @default(0)
  nbFail           Int     @default(0)
  nbWarning        Int     @default(0)

  rapportGenere    Boolean @default(false)
  correctionsDemandees Json?

  decision         String? // CONFORME | CORRECTIONS_REQUISES | BLOQUANT
  jonathanValidAt  DateTime?

  createdAt        DateTime @default(now())

  @@map("ao_controle_qa")
}
```

---

## 2. SUB-AGENT 9a — ANALYSEUR DCE

### Mission
Extraire et analyser les documents du DCE (Dossier de Consultation des Entreprises) : RC, CCTP, CCAP, AE, BPU.

### Architecture technique

```
DCE URLs reçues
  1. Télécharger les PDFs (HTTP)
  2. Extraire le texte (PyMuPDF in Docker sandbox — CVE-2026-0006)
  3. Chunking si > 100 pages
  4. Claude API Structured Outputs → DCEAnalysis
  5. Identifier exigences individuelles (EX-001...)
  6. Détecter flags conditionnels (RSE, RGAA, volet social)
  7. Extraire mots-clés miroir pour le mémoire
  8. Persister dans ao_analyses + ao_exigences
```

### CVE-2026-0006 — PyMuPDF sandbox obligatoire

```typescript
// PyMuPDF DOIT être exécuté dans un conteneur Docker isolé
// JAMAIS sur le process Node.js principal
async extractPdfText(pdfBuffer: Buffer): Promise<string> {
  const result = await this.dockerService.run({
    image: 'pymupdf-sandbox:latest',
    command: ['python3', '/extract.py'],
    stdin: pdfBuffer,
    timeout: 120000, // 2 min max
    memoryLimit: '512m',
    networkDisabled: true, // Pas d'accès réseau
    readOnly: true,
  });
  return result.stdout;
}
```

### Claude Structured Outputs pour analyse DCE

```typescript
const DCE_ANALYSIS_PROMPT = `Tu es un expert en marchés publics français.
Analyse ce DCE et extrait en JSON structuré :
1. Conditions de participation (capacité technique, financière, références)
2. Critères d'évaluation avec pondérations
3. Pièces exigées (DC1, DC2, DUME, attestations)
4. Exigences techniques (EX-001, EX-002...)
5. Flags conditionnels (RSE, RGAA, volet social)
6. Mots-clés miroir (termes à reprendre dans le mémoire)
7. Stratégie prix recommandée

RÈGLES :
- Extraire UNIQUEMENT ce qui est écrit dans le document
- NE JAMAIS inventer d'exigences non mentionnées
- Citer la source (page, section) pour chaque exigence`;
```

---

## 3. SUB-AGENT 9b — QUALIFICATEUR + DÉCIDEUR GO/NO-GO

### Scoring 7 axes (code existant à enrichir)

| Axe | Poids | Description |
|-----|:-----:|-------------|
| Pertinence | 25% | Adéquation avec compétences Axiom |
| Compétences | 20% | Capacité technique |
| Budget viable | 15% | Budget compatible |
| Concurrence | 10% | Niveau concurrence (100 = peu) |
| Délai réaliste | 10% | Délai de réponse faisable |
| Références | 10% | Références pertinentes disponibles |
| Capacité équipe | 10% | Disponibilité équipe |

### Décision

| Score | Décision | Action |
|:-----:|----------|--------|
| >= 70 | GO | Lancement automatique 9c/9d/9e |
| 50-69 | POSSIBLE | Notification Jonathan pour review |
| < 50 | NO_GO | Archivage + raison |

### Notification Slack Jonathan

```typescript
// Si POSSIBLE : Jonathan doit confirmer/infirmer
await this.slackService.send('#marches-publics', {
  text: `AO à qualifier : ${tender.title} (score: ${score}/100)`,
  blocks: [
    { type: 'section', text: { type: 'mrkdwn', text: `*${tender.title}*\nAcheteur: ${tender.buyerName}\nBudget: ${tender.estimatedBudget}€\nDeadline: ${tender.deadlineDate}` } },
    { type: 'actions', elements: [
      { type: 'button', text: { type: 'plain_text', text: '✅ GO' }, action_id: 'ao_go', value: tender.id, style: 'primary' },
      { type: 'button', text: { type: 'plain_text', text: '❌ NO-GO' }, action_id: 'ao_nogo', value: tender.id, style: 'danger' },
    ] },
  ],
});
```

---

## 4. SUB-AGENT 9c — JURISTE (Dossier administratif)

### Pièces à générer

| Pièce | Source | Format |
|-------|--------|--------|
| DC1 (Lettre de candidature) | `DC1-UNIVILE-PRE-REMPLI.md` → HTML → PDF | PDF |
| DC2 (Déclaration du candidat) | `DC2-UNIVILE-PRE-REMPLI.md` → HTML → PDF | PDF |
| DUME (si demandé au lieu de DC1/DC2) | `GUIDE-DUME-UNIVILE.md` | XML/PDF |
| Attestation sur l'honneur | Template pré-rempli | PDF |
| Kbis | Document externe (validité 3 mois) | PDF |
| Attestation URSSAF | Document externe (validité 6 mois) | PDF |
| Attestation fiscale | Document externe (validité 1 an) | PDF |
| RC Pro | Certificat assurance | PDF |
| RIB | Document fixe | PDF |

### Tracking des validités

```typescript
interface DocumentValidity {
  type: string;
  expiresAt: Date;
  renewalReminder: Date; // 15j avant expiration
  lastUploadedAt: Date;
  filePath: string;
}
```

---

## 5. SUB-AGENT 9d — CHIFFREUR (Offre financière)

### Types de documents financiers

| Document | Quand | Description |
|----------|-------|-------------|
| BPU (Bordereau des Prix Unitaires) | Marché à bon de commande | Prix unitaires par poste |
| DQE (Détail Quantitatif Estimatif) | Marché forfaitaire | Quantités × prix unitaires |
| DPGF (Décomposition du Prix Global et Forfaitaire) | Marché forfaitaire | Décomposition du prix global |

### Stratégie prix

```typescript
type PricingStrategy = 'AGRESSIVE' | 'EQUILIBREE' | 'PREMIUM';

function determinePricingStrategy(analysis: DCEAnalysis): PricingStrategy {
  // Si critère prix > 50% des points → AGRESSIVE
  if (analysis.criteresEval.prixPonderation > 50) return 'AGRESSIVE';
  // Si critère technique > 60% → PREMIUM (on mise sur la qualité)
  if (analysis.criteresEval.techniquePonderation > 60) return 'PREMIUM';
  // Par défaut
  return 'EQUILIBREE';
}
```

### Marge LODEOM (spécifique DOM-TOM)

Axiom étant basé à La Réunion, les marchés DOM-TOM bénéficient de l'abattement LODEOM sur les charges, ce qui permet une marge supplémentaire.

---

## 6. SUB-AGENT 9e — RÉDACTEUR MÉMOIRE TECHNIQUE

### Structure 5 chapitres (template Jonathan)

| Chapitre | Contenu | Pages (MAPA) | Pages (AO) |
|:--------:|---------|:------------:|:----------:|
| 1 | Présentation de l'entreprise | 2-3 | 4-6 |
| 2 | Compréhension du besoin | 3-5 | 6-10 |
| 3 | Solution technique proposée | 5-8 | 10-15 |
| 4 | Méthodologie et organisation | 3-5 | 6-10 |
| 5 | Maintenance et support | 2-3 | 4-8 |

### Sections conditionnelles (FLAGS)

```typescript
const FLAGS = {
  ACTIVER_SECTION_RSE: false,     // Si RC mentionne RSE/développement durable
  ACTIVER_VOLET_SOCIAL: false,    // Si clause sociale d'insertion
  ACTIVER_SECTION_RGAA: false,    // Si accessibilité numérique exigée
};
// Les flags sont détectés automatiquement par 9a dans le DCE
```

### Anti-detection IA (ratio 60/40)

```typescript
// Le mémoire doit paraître rédigé par un humain
// Stratégie : Claude génère 60%, Jonathan ajoute/modifie 40%
// Checklist anti-détection :
const ANTI_DETECTION_CHECKLIST = [
  'Variation longueur phrases (pas de pattern régulier)',
  'Vocabulaire spécifique métier (pas générique)',
  'Références concrètes à des projets passés',
  'Tournures personnelles (nous, notre équipe)',
  'Pas de formulations "en tant que" ou "il est important de"',
  'Chiffres précis (pas arrondis : 47% au lieu de "environ 50%")',
  'Anecdotes ou détails spécifiques vécus',
];
```

### Schémas Mermaid

Le rédacteur génère automatiquement des schémas Mermaid :
- Planning Gantt du projet
- Architecture technique de la solution
- Organigramme de l'équipe projet

---

## 7. SUB-AGENT 9f — CONTRÔLEUR QA

### Checklist 29 points (spec)

La checklist couvre :
- Conformité administrative (DC1/DC2 remplis, signés, attestations valides)
- Conformité technique (mémoire complet, tous chapitres, schémas)
- Conformité financière (BPU/DQE rempli, cohérent, signé)
- Format (nommage fichiers, format PDF, taille)
- Complétude (toutes pièces exigées par le RC présentes)

### Rapport de contrôle

```typescript
interface QAReport {
  analyseId: string;
  checklistItems: Array<{
    code: string;       // QA-001 à QA-029
    description: string;
    status: 'PASS' | 'FAIL' | 'WARNING';
    details?: string;
  }>;
  decision: 'CONFORME' | 'CORRECTIONS_REQUISES' | 'BLOQUANT';
  corrections: string[];
  readyForDeposit: boolean;
}
```

---

## 8. SUB-AGENT 9g — MONITEUR POST-DÉPÔT

### 3 phases de surveillance

| Phase | Période | Actions |
|-------|---------|---------|
| Phase 1 : Active | J+0 à J+15 | Surveiller Q/R acheteur, modifications DCE, résultats immédiats |
| Phase 2 : Attente | J+15 à J+60 | Relance si pas de nouvelle à J+30 |
| Phase 3 : Résultat | Variable | Traitement GAGNÉ ou PERDU |

### Si GAGNÉ

1. Préparer signature Acte d'Engagement (AE)
2. Rassembler pièces du lauréat (Kbis, URSSAF, fiscale)
3. Transférer vers Agent 8 (Dealmaker) / Agent 10 (CSM)

### Si PERDU

1. Demande d'information post-rejet (art. R2181-3 du CCP)
2. Générer courrier type
3. Analyser le rapport (si reçu)
4. Générer RETEX structuré
5. Capitaliser dans la base de connaissances

### RETEX template

```typescript
interface RetexReport {
  tenderId: string;
  title: string;
  acheteur: string;
  montant: number;

  resultat: 'GAGNE' | 'PERDU' | 'SANS_SUITE';

  // Si perdu
  rankObtenu?: number;        // Classement
  scoreObtenu?: number;       // Score technique
  prixLaureat?: number;       // Prix du gagnant
  nbCandidats?: number;       // Nombre de candidatures

  // Analyse
  pointsForts: string[];
  pointsFaibles: string[];
  lecons: string[];
  actionsAmelioration: string[];

  // Calibration
  ecartPrix?: number;         // % écart avec lauréat
  ajustementScoring?: string; // Recommandation pour 9b
}
```

---

## 8bis. SUB-AGENT 9g — 9 TYPES D'ALERTES MONITEUR (spec MASTER §communication)

| # | Type alerte | Déclencheur | Action |
|---|------------|-------------|--------|
| 1 | `qr_published` | Nouvelle Q/R publiée sur la plateforme | Ré-analyser impact, MAJ mémoire si nécessaire |
| 2 | `dce_modified` | Rectificatif DCE détecté | Relancer 9a analyse complète, alerter Jonathan |
| 3 | `deadline_extended` | Report de deadline | MAJ rétroplanification |
| 4 | `result_won` | Marché gagné | Préparer signature AE + pièces lauréat → Agent 8/10 |
| 5 | `result_lost` | Marché perdu | Courrier R2181-3 + RETEX |
| 6 | `debrief_received` | Rapport d'analyse post-rejet reçu | Générer RETEX structuré |
| 7 | `no_news_30d` | Pas de nouvelle 30j après dépôt | Relancer acheteur |
| 8 | `procedure_collective` | Procédure collective détectée chez un candidat | Alerte opportunité si concurrent en difficulté |
| 9 | `regulatory_change` | Changement réglementaire détecté | Vérifier conformité dossiers en cours |

### 3 niveaux d'escalade (spec §communication)

```
NIVEAU 1 (automatique) :
  → Agent bloqué → relance avec plus de contexte
  → Délai interne dépassé → notification agent suivant

NIVEAU 2 (notification Jonathan) :
  → Décision GO/NO-GO requise
  → Question à poser à l'acheteur
  → Information manquante (attestation, référence)
  → Incohérence détectée dans le DCE

NIVEAU 3 (alerte urgente) :
  → Deadline < 5 jours et dossier incomplet
  → Pièce administrative expirée
  → Erreur critique détectée par QA
```

---

## 8ter. DONNÉES COMPLÉMENTAIRES MANQUANTES

### 9a — Détection marché "fausse chance" (spec 9a)

Le 9a détecte les marchés orientés vers un concurrent spécifique via des flags de suspicion :

```typescript
interface FausseChanceDetection {
  suspicionLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  raisons: string[];      // Ex: "Exigence technique très spécifique à un fournisseur"
  score: number;          // 0-100 (100 = fortement suspecté)
  flags: {
    RSE_SUSPICION: boolean;        // RSE exigée de manière disproportionnée
    SOCIAL_SUSPICION: boolean;     // Clause sociale suspecte
    RGAA_SUSPICION: boolean;       // RGAA exigée sans rapport avec le marché
    COLLECTIVE_SUSPICION: boolean; // Marché réservé aux entreprises d'insertion
  };
}
// Si COLLECTIVE_SUSPICION = true → auto NO-GO
// Si suspicionLevel = HIGH → alerter Jonathan avant GO
```

### 9b — Expected Value (EV) formula (spec 9b)

```typescript
function calculateExpectedValue(
  montant: number,
  margePercent: number,
  probaGain: number,
  effortHours: number,
  tjm: number = 800,  // TJM moyen Axiom
): number {
  return (montant * (margePercent / 100) * (probaGain / 100)) - (effortHours * tjm);
}
// EV > 500 EUR → GO pour MAPA
// EV > 1000 EUR → GO pour AO standard
// EV <= 0 → NO-GO même si score > 70
```

### 9b — Taux de succès par type de marché

| Type | Taux typique | Concurrence moyenne | Temps réponse |
|------|:-----------:|:-------------------:|:-------------:|
| MAPA (< 90K EUR) | 35-50% | 3-8 soumissions | 5-10j |
| AO Ouvert (> 90K EUR) | 15-25% | 15-30 soumissions | 20-40j |
| AO Restreint | 40-60% | 5-12 candidats | 15-30j |
| Marché reconduction | 60-80% | 2-4 concurrents | 10-20j |

### 9d — TJM par séniorité (grille Axiom)

| Séniorité | TJM (EUR) | Rôle type |
|-----------|:---------:|-----------|
| Senior | 1200-1500 | Lead dev, architecte, chef de projet |
| Confirmé | 800-1000 | Développeur, designer UX, intégrateur |
| Junior | 400-600 | Développeur junior, assistant |
| **TJM moyen pondéré** | **~800** | Mix équipe type |

### 9d — Niveaux de sévérité marge

| Marge nette | Sévérité | Action |
|:-----------:|----------|--------|
| < 5% | **BLOQUANTE** | Flag pour renégociation. Ne PAS soumettre sans validation Jonathan |
| 5-15% | HAUTE | Acceptable si marché stratégique (référence, visibilité) |
| 15-25% | MOYENNE | Marge confortable, soumission standard |
| > 25% | BASSE | Excellente marge, attention au risque d'offre anormalement haute |

### 9e — Sections non-automatisables (intervention Jonathan)

| Section | Raison | Qui |
|---------|--------|-----|
| Innovation technique (chap. 3) | Nécessite expertise métier réelle | Jonathan |
| Anecdotes projets passés | Non générables par IA | Jonathan/Marty |
| Positionnement prix (chap. 3) | Décision stratégique | Jonathan |
| CV et parcours (annexes) | Données personnelles | Jonathan/Marty |
| Engagement spécifique client | Formulation contractuelle | Jonathan |

### 9e — Formulation validée volet social (spec Jonathan)

```
"Axiom s'engage à étudier les possibilités de recours à des structures d'insertion
par l'activité économique (SIAE) ou à des entreprises adaptées pour les lots ou
prestations qui s'y prêtent, conformément aux dispositions de l'article L2112-2
du Code de la commande publique."
```
*Cette formulation exacte a été validée juridiquement — ne PAS la modifier.*

### 9e — Copyleaks API integration

```typescript
// Validation anti-detection IA avant soumission finale
async validateAntiDetection(memoirePath: string): Promise<{ score: number; pass: boolean }> {
  // Objectif : score < 20% "likely AI"
  // Si > 20% : réécrire les sections les plus détectées
  // Si > 40% : escalade Jonathan pour réécriture manuelle
}
```

### 9f — Signatures PAdES + eIDAS (> 40K EUR)

```typescript
// Pour les marchés > 40K EUR :
// - Signature électronique au format PAdES (PDF Advanced Electronic Signatures)
// - Conformité eIDAS (electronic Identification, Authentication and trust Services)
// - Certificat RGS** (Référentiel Général de Sécurité niveau **)
if (montantMarche > 40000) {
  requirePadesSignature = true;
  requireEidasCompliance = true;
  // Le certificat RGS** de Jonathan doit être valide
}
```

### 9g — Base de connaissances évolutive (capitalisation RETEX)

| Donnée capitalisée | Source | Utilisation future |
|--------------------|--------|-------------------|
| Prix du marché attribué | ATTRI1 / BOAMP | Calibrer les futurs chiffrages (9d) |
| Nombre de candidats | Rapport d'analyse post-rejet | Affiner le scoring concurrence (9b) |
| Score technique obtenu | Rapport d'analyse | Améliorer la rédaction (9e) |
| Acheteurs connus | Historique | Personnaliser les futures réponses |
| Titulaires sortants | BOAMP / DECP data.gouv.fr | Anticiper la concurrence |
| TJM du marché attribué | Prix attribués | Ajuster la stratégie prix (9d) |

---

## 9. TYPES DE MESSAGES INTER-SOUS-AGENTS — 20 types (spec §communication)

| Type | De → Vers | Payload |
|------|-----------|---------|
| `new_market` | Agent 1b → 9a | TenderLeadInput |
| `qualified_market` | 9a → 9b | Marché qualifié avec score préliminaire |
| `dce_analysis_complete` | 9a → 9b,9c,9d,9e | DCEAnalysis complet |
| `go_decision` | 9b → 9c,9d,9e | TenderId + retroplanning |
| `nogo_decision` | 9b → archive | TenderId + reason |
| `legal_ready` | 9c → 9f | DossierAdmin |
| `pricing_ready` | 9d → 9f + 9e | OffreFinanciere |
| `draft_ready` | 9e → 9f | MemoireTechnique |
| `qa_pass` | 9f → Jonathan | RapportControle |
| `qa_fail` | 9f → agent concerné | Corrections |
| `alert` | any → Jonathan | Alerte (deadline, problème, question) |
| `question_acheteur` | 9a → Jonathan | Question à poser à l'acheteur |
| `qr_published` | 9g → 9a + 9e | Nouvelle Q/R publiée → analyser impact |
| `dce_modified` | 9g → 9a + all | Rectificatif DCE → ré-analyser |
| `deadline_extended` | 9g → orchestrateur | Report deadline → MAJ rétroplanification |
| `result_won` | 9g → Agent 8/10 | TenderId + dossier complet |
| `result_lost` | 9g → RETEX | TenderId + raison |
| `debrief_received` | 9g → capitalisation | Rapport d'analyse reçu → générer RETEX |
| `no_news_30d` | 9g → Jonathan | Pas de nouvelle 30j → relancer acheteur |
| `signature_required` | 9f → Jonathan | Signature électronique requise avant dépôt |

---

## 10. DONNÉES AXIOM (profil entreprise)

Données stables pré-remplies dans les formulaires DC1/DC2/DUME :

```
Dénomination : UNIVILE SAS
Nom commercial : Axiom Marketing
SIRET : 891 146 490 00042
TVA : FR75891146490
APE : 6201Z — Programmation informatique
Forme juridique : SAS
Capital : 1 670 EUR
Siège : 62 Rue Pente Nicole, 97421 Saint-Louis, La Réunion
Représentant : Jonathan Dewaele, Président
PME : Oui (micro-entreprise)
Date création : Novembre 2020
```

---

## 11. BRAINSTORM — FONCTIONNALITÉS ADDITIONNELLES

| # | Feature | Description | Priorité |
|---|---------|-------------|:--------:|
| F1 | **OCR intégré** | Pour les DCE scannés (pas de texte extractible) | P2 |
| F2 | **Apprentissage progressif** | Les RETEX alimentent le scoring 9b | P1 |
| F3 | **Comparaison DECP** | Comparer nos prix aux marchés attribués similaires | P1 |
| F4 | **Templates mémoire sectoriels** | Templates spécifiques collectivités, santé, éducation | P2 |
| F5 | **Dépôt automatique** | API PLACE pour dépôt automatique (si disponible) | P3 |
| F6 | **Veille concurrentielle** | Identifier les titulaires sortants via DECP | P1 |
| F7 | **Estimateur de chances** | ML sur historique RETEX pour prédire le taux de succès | P3 |
| F8 | **Multi-lot** | Gérer les AO multi-lots (réponse différente par lot) | P2 |

---

## 12. ROADMAP DÉTAILLÉE

### Phase 0 — Foundation (1 jour)
- [ ] Prisma migration (6 tables Agent 9)
- [ ] Tender entity enrichi (8 statuts)
- [ ] Pipeline orchestrator (séquentiel + parallèle)
- [ ] Controller sécurisé (@Roles, Zod, ParseUUID)
- [ ] Structure dossiers fichiers (spec §6)

### Phase 1 — 9a + 9b (2 jours)
- [ ] DceAnalyzerService (PyMuPDF Docker sandbox)
- [ ] Claude structured outputs pour analyse DCE
- [ ] Chunking > 100 pages
- [ ] QualifierService (scoring 7 axes enrichi)
- [ ] Notification Slack GO/NO-GO Jonathan

### Phase 2 — 9c + 9d (1.5 jours, parallèles)
- [ ] JuristeService (DC1/DC2/DUME pré-remplis)
- [ ] Attestations tracking + alertes validité
- [ ] ChiffreurService (BPU/DQE/DPGF)
- [ ] Stratégie prix automatique

### Phase 3 — 9e (2 jours)
- [ ] MemoireRedacteurService (5 chapitres Claude)
- [ ] Anti-detection IA (ratio 60/40)
- [ ] Schémas Mermaid auto
- [ ] Sélection références auto
- [ ] Sections conditionnelles FLAGS

### Phase 4 — 9f + 9g (1.5 jours)
- [ ] ControleurQaService (29 points checklist)
- [ ] MoniteurService (surveillance BOAMP/DECP)
- [ ] Courrier R2181-3 post-rejet
- [ ] RETEX structuré

### Phase 5 — Tests + Integration (1 jour)
- [ ] Transfert GAGNÉ → Agent 8/10
- [ ] Métriques → Agent 7
- [ ] Tests unitaires
- [ ] Alertes deadlines
