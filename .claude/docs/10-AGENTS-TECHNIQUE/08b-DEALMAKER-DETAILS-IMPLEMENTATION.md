# Agent 8 — DEALMAKER — Détails d'implémentation complets

**Complément à :** `08-AGENT-8-DEALMAKER.md`

---

## 1. PRISMA SCHEMA — Tables spécifiques Agent 8

Le code actuel utilise le modèle `DealCrm` et `Quote` existants. La spec exige des tables additionnelles.

### Tables à ajouter/modifier

```prisma
// DealCrm existant — à enrichir avec les stages 7 étapes + champs Yousign
model DealCrm {
  // ... champs existants (id, prospectId, stage, value, etc.)

  // À AJOUTER :
  devisId           String?
  devisUrl          String?
  devisEnvoyeAt     DateTime?
  trackingId        String?

  yousignRequestId  String?
  yousignDocumentId String?
  yousignSignerId   String?
  contratEnvoyeAt   DateTime?
  contratSigneUrl   String?
  dateSignature     DateTime?

  nbRelances        Int       @default(0)
  derniereRelanceAt DateTime?
  derniereObjection String?
  lostReason        String?
  lostAt            DateTime?

  rdvNotes          Json?     // Notes RDV Jonathan
  typeProjet        String?
  tierRecommande    String?
  tierFinal         String?
  segment           String?
  canalPrincipal    String?

  engagementScore   EngagementScore?
  activities        DealActivity[]
}

model EngagementScore {
  id          String   @id @default(uuid())
  dealId      String   @unique
  deal        DealCrm  @relation(fields: [dealId], references: [id])
  score       Int      @default(0)
  signals     Json     @default("[]")
  lastUpdated DateTime @default(now())

  @@map("engagement_scores")
}

model DealActivity {
  id              String   @id @default(uuid())
  dealId          String
  deal            DealCrm  @relation(fields: [dealId], references: [id])
  type            String   // follow_up, objection, stage_change, quote_sent, quote_opened, etc.
  step            Int?
  engagementScore Int?
  details         Json?
  createdAt       DateTime @default(now())

  @@index([dealId])
  @@index([type])
  @@map("deal_activities")
}

model DevisTracking {
  id          String   @id @default(uuid())
  devisId     String
  pdfUrl      String
  opens       Int      @default(0)
  lastOpenedAt DateTime?
  createdAt   DateTime @default(now())

  trackingOpens DevisOpen[]

  @@map("devis_tracking")
}

model DevisOpen {
  id         String   @id @default(uuid())
  trackingId String
  tracking   DevisTracking @relation(fields: [trackingId], references: [id])
  openedAt   DateTime @default(now())
  ipAddress  String?
  userAgent  String?

  @@index([trackingId])
  @@map("devis_opens")
}

model WebhookEvent {
  eventId     String   @id
  processedAt DateTime @default(now())

  @@map("webhook_events")
}
```

---

## 2. DEAL ENTITY — 7 stages (spec §4)

### Stages à ajouter

```typescript
export enum DealStage {
  QUALIFICATION = 'QUALIFICATION',
  DEVIS_CREE = 'DEVIS_CREE',
  DEVIS_EN_CONSIDERATION = 'DEVIS_EN_CONSIDERATION',
  NEGOCIATION = 'NEGOCIATION',
  SIGNATURE_EN_COURS = 'SIGNATURE_EN_COURS',
  GAGNE = 'GAGNE',         // ex CLOSED_WON
  PERDU = 'PERDU',          // ex CLOSED_LOST
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  QUALIFICATION: ['DEVIS_CREE', 'PERDU'],
  DEVIS_CREE: ['DEVIS_EN_CONSIDERATION', 'PERDU'],
  DEVIS_EN_CONSIDERATION: ['NEGOCIATION', 'SIGNATURE_EN_COURS', 'PERDU'],
  NEGOCIATION: ['SIGNATURE_EN_COURS', 'PERDU'],
  SIGNATURE_EN_COURS: ['GAGNE', 'NEGOCIATION', 'PERDU'],
  GAGNE: [],
  PERDU: [],
};
```

---

## 3. SUB-AGENT 8a — GÉNÉRATEUR DE DEVIS

### Flow

```
DealmakerInput reçu
  1. Claude API analyse notes_jonathan → ScopeAnalysis (type_projet, features par tier, timeline)
  2. PricingService sélectionne template + tier recommandé
  3. Handlebars compile HTML template + variables
  4. Puppeteer génère PDF (5-8s)
  5. Email envoyé avec PDF attaché + tracking pixel
  6. DealCrm.stage → DEVIS_CREE
  7. Slack notification Jonathan
```

### Claude prompt pour scope analysis

```typescript
const SCOPE_ANALYSIS_PROMPT = `Tu es l'assistant commercial d'Axiom Marketing.
Analyse les notes de RDV suivantes et extrait :
1. Le type de projet principal (site_vitrine, ecommerce_shopify, app_flutter, app_metier, rgaa, tracking_server_side)
2. Les features nécessaires pour chaque tier (Bronze/Silver/Gold)
3. Le tier recommandé (celui qui correspond le mieux aux besoins + budget)
4. La timeline estimée par tier (en semaines)
5. Les add-ons suggérés

Réponds en JSON structuré.
NE JAMAIS inventer des besoins non mentionnés dans les notes.`;
```

### PricingService étendu (spec §5)

```typescript
const SERVICE_TEMPLATES = {
  site_vitrine: {
    bronze: { nom: 'Essentiel', prix: 1500, features: ['Template WordPress', '5-8 pages', 'Responsive', 'Contact', 'SSL 1 an'], timeline: 3 },
    silver: { nom: 'Professionnel', prix: 5000, features: ['Design sur-mesure Figma', '10-15 pages', 'SEO complet', 'CRM intégration', '2 révisions'], timeline: 5 },
    gold: { nom: 'Premium', prix: 9500, features: ['Tout Silver +', 'Animations avancées', 'Blog CMS', 'Lighthouse 95+', 'Support 6 mois'], timeline: 8 },
  },
  ecommerce_shopify: {
    bronze: { nom: 'Starter', prix: 5000, features: ['Thème Shopify', '50 produits', 'Paiement standard', 'Klaviyo basique'], timeline: 4 },
    silver: { nom: 'Growth', prix: 10000, features: ['Design sur-mesure', '200 produits', 'Klaviyo avancé', 'SEO e-commerce'], timeline: 6 },
    gold: { nom: 'Scale', prix: 15000, features: ['Tout Growth +', 'Apps custom', 'Multi-devises', 'Formation 4h'], timeline: 10 },
  },
  // app_flutter, app_metier, rgaa, tracking_server_side...
};
```

### PDF Puppeteer template

Le devis est généré en HTML (Handlebars) → PDF via Puppeteer headless Chrome.

```typescript
async generateDevisPdf(scope: ScopeAnalysis, deal: DealCrm, prospect: Prospect): Promise<Buffer> {
  const html = this.compileTemplate('devis', {
    prospect, entreprise: deal.entreprise, scope,
    tiers: this.buildTierComparison(scope),
    tierRecommande: scope.tierRecommande,
    validiteJours: 30,
    date: new Date().toLocaleDateString('fr-FR'),
    trackingPixelUrl: `${this.trackingBaseUrl}/pixel/${deal.trackingId}.gif`,
  });

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({ format: 'A4', margin: { top: '20mm', bottom: '20mm' } });
  await browser.close();
  return Buffer.from(pdf);
}
```

---

## 4. SUB-AGENT 8b — RELANCEUR DE DEALS

### Séquence de relance (spec §3b.3)

| Jour | Template | Canal | Action si réponse |
|:----:|---------|:-----:|-------------------|
| J0 | Email accompagnement devis | Email | — |
| J3 | `followup_reception` | Email | Détecte objection → négociation |
| J7 | `followup_valeur` | Email | Envoie case study si engagement |
| J14 | `followup_breakup` | Email | 33% recovery rate attendu |
| J14 | `linkedin_devis_followup` | LinkedIn | Si aucune réponse email |
| J21 | `linkedin_case_study` | LinkedIn | — |
| J30 | `reconquete_final` | Email | Dernière chance |
| J45 | Auto-PERDU | Système | → Agent 6 Nurtureur |

### Scoring engagement (8 signaux d'achat)

| Signal | Points | Action |
|--------|:------:|--------|
| `devis_ouvert` | +1 | Log only |
| `devis_multi_ouvert` (3+) | +20 | Alert Jonathan |
| `page_pricing` | +20 | Send case study |
| `reponse_question` | +25 | Fast reply required |
| `linkedin_engagement` | +10 | Log only |
| `forward_interne` | +15 | Alert Jonathan urgent |
| `demande_info` | +20 | Schedule call |
| `meeting_accepte` | +50 | Alert Jonathan urgent |

**Seuils :** 25 = escalade Jonathan, 75 = "Ready to Sign"

### Classification objections (Claude)

5 types : `prix_eleve` (35%), `timing` (25%), `concurrence` (20%), `budget` (15%), `inaction` (5%)

Chaque objection a un template de réponse personnalisé + stratégie (voir spec §6).

---

## 5. SUB-AGENT 8c — GESTIONNAIRE DE SIGNATURE

### Yousign API V3 flow

```
1. generateContract(deal) → PDF contrat (Puppeteer)
2. createSignatureRequest(name, delivery_mode='email', expiration=30j)
3. uploadDocument(signatureRequestId, contractPdf)
4. addSigner(signatureRequestId, { prospect info, OTP email })
5. addSignatureField(documentId, signerId, { page, position })
6. activateSignatureRequest(signatureRequestId) → Email envoyé au prospect
7. Webhook signature.done → deal.stage = GAGNE → Agent 10 CSM
8. Webhook signature.expired → relance ou retour NEGOCIATION
```

### Webhook validation HMAC

```typescript
function validateYousignWebhook(payload: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', process.env.YOUSIGN_WEBHOOK_SECRET!)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
```

### Relance signature

| Jour | Action |
|:----:|--------|
| J+2 | Email reminder "N'oubliez pas de signer" |
| J+5 | Email + Slack Jonathan "Signature en attente" |
| J+7 | Appel Jonathan recommandé |

---

## 6. OUTPUT SCHEMAS (spec §8)

### DealToCSM (→ Agent 10)

```typescript
interface DealToCSM {
  deal_id: string;
  prospect_id: string;
  prospect: { prenom, nom, email, telephone?, linkedin_url?, poste };
  entreprise: { nom, siret, site_web, secteur, taille };
  contrat: {
    montant_ht: number;
    tier: 'bronze' | 'silver' | 'gold';
    type_projet: string;
    scope_detaille: string[];
    date_signature: string;
    date_demarrage_prevue: string;
    duree_estimee_semaines: number;
    conditions_paiement: '50/50' | '30/40/30' | 'mensuel';
    contrat_pdf_url: string;
  };
  notes_vente: string;
  metadata: { agent, created_at, deal_cycle_days, nb_relances, engagement_score_final, version };
}
```

### LostDealToNurturer (→ Agent 6)

```typescript
interface LostDealToNurturer {
  prospect_id: string;
  deal_id: string;
  reason: 'PRIX' | 'TIMING' | 'CONCURRENCE' | 'INACTION' | 'AUTRE';
  detail: string;
  montant_estime: number;
  type_projet: string;
  recommendation: string;
  recontact_date: string;
  prospect: { prenom, nom, email, entreprise_nom, poste, segment };
}
```

---

## 7. GRILLES TARIFAIRES COMPLÈTES — 6 services × 3 tiers (spec 8a)

Le PricingService actuel n'a que des prix simplistes. La spec définit pour chaque service : `prix_min`, `prix_max`, `prix_affiche`, `features[]`, `timeline_semaines`, `label`, `is_recommended`.

| Service | Bronze | Silver (cible 60-70%) | Gold |
|---------|--------|:---------------------:|------|
| **Site vitrine** | Essentiel 1 500€ (3 sem) | Professionnel 5 000€ (5 sem) | Premium 9 500€ (8 sem) |
| **E-commerce Shopify** | Starter 5 000€ (4 sem) | Growth 10 000€ (6 sem) | Scale 15 000€ (10 sem) |
| **App Flutter** | MVP 15 000€ (8 sem) | Complete 35 000€ (14 sem) | Enterprise 60 000€ (22 sem) |
| **App métier** | Module Unique 25 000€ (10 sem) | Multi-Modules 50 000€ (18 sem) | Sur-Mesure 75 000€ (26 sem) |
| **RGAA collectivités** | Audit + Essentiels 8 000€ (4 sem) | Refonte Partielle 20 000€ (8 sem) | Conformité Totale 40 000€ (14 sem) |
| **Tracking server-side** | Standard 990€ + 89€/mois (2 sem) | Avancé 1 490€ + 129€/mois (3 sem) | Enterprise 2 490€ + 189€/mois (4 sem) |

Chaque service a entre 6-10 features par tier. Les features complètes sont dans `AGENT-8a-DEVIS.md` section `SERVICE_TEMPLATES`.

**Psychologie Decoy Effect** (spec §5.2) :
- Bronze = leurre d'entrée (features volontairement limitées)
- Silver = cible (badge "Le plus choisi", bordure colorée, 60-70% des conversions)
- Gold = ancrage haut (rend Silver "raisonnable" par comparaison)
- Afficher Gold en premier → +12% panier moyen

---

## 8. TEMPLATES DE RELANCE ET OBJECTIONS (spec 8b)

### 6 templates de relance (séquence post-devis)

| Template ID | Jour | Canal | Objet | Variables Handlebars |
|------------|:----:|:-----:|-------|---------------------|
| `followup_reception` | J3 | Email | "Re: Proposition Axiom - {{type_projet}} pour {{entreprise_nom}}" | `{{prenom}}, {{jour_envoi}}` |
| `followup_valeur` | J7 | Email | "Un point clé sur votre projet {{type_projet}}" | `{{prenom}}, {{point_valeur_specifique}}, {{entreprise_similaire}}, {{echeancier}}` |
| `followup_breakup` | J14 | Email | "Juste une clarification, {{prenom}}" | `{{prenom}}, {{mois_relance}}` |
| `linkedin_devis_followup` | J14 | LinkedIn | — | `{{prenom}}, {{type_projet}}` |
| `linkedin_case_study` | J21 | LinkedIn | — | `{{prenom}}, {{type_projet}}, {{entreprise_similaire}}, {{resultats_concrets}}, {{entreprise_nom}}` |
| `reconquete_final` | J30 | Email | "Dernier point - {{entreprise_nom}} x Axiom" | `{{prenom}}, {{type_projet}}, {{entreprise_nom}}, {{calendly_url}}` |

### 5 templates d'objection

| Objection | Objet email | Stratégie | Variables clés |
|-----------|------------|-----------|----------------|
| `prix_eleve` (35%) | "Flexibilité tarifaire" | Tier inférieur + échelonnement + ROI | `{{tier_inferieur}}, {{prix_tier_inferieur}}, {{nb_echeances}}, {{montant_mensuel}}, {{roi_mois_min/max}}` |
| `timing` (25%) | "On planifie ?" | Identifier trigger + fixer date + coût inaction | `{{mois_suggestion}}, {{calendly_url}}, {{benefice_principal}}` |
| `concurrence` (20%) | "Ce qui nous différencie" | Valeur ajoutée + différenciateurs factuels | `{{tier_recommande}}, {{inclusions_differenciantes}}, {{concurrent}}, {{reference_client}}, {{resultat_concret}}` |
| `budget` (15%) | "Solutions budgétaires" | Unbundling + phase 1/2 + ROI rapide | `{{tier_bronze}}, {{prix_bronze}}, {{nb_echeances}}, {{argument_roi}}` |
| `inaction` (5%) | "2 options claires" | Simplifier à A/B + case study | `{{tier_bronze}}, {{prix_bronze}}, {{resume_bronze}}, {{timeline_bronze}}, {{tier_recommande}}, {{prix_recommande}}` |

Les corps complets des emails sont dans `AGENT-8b-RELANCES.md` sections `FOLLOW_UP_TEMPLATES` et `OBJECTION_TEMPLATES`.

---

## 9. YOUSIGN API V3 — 9 endpoints complets (spec 8c)

| # | Endpoint | Méthode | Path | Quand |
|---|----------|:-------:|------|-------|
| 1 | Créer signature request | POST | `/signature_requests` | Devis accepté → contrat |
| 2 | Ajouter signataire | POST | `/signature_requests/{id}/signers` | Info prospect |
| 3 | Upload document | POST (multipart) | `/signature_requests/{id}/documents` | Contrat PDF |
| 4 | Ajouter champs signature | POST | `/signature_requests/{id}/documents/{docId}/fields` | Position signature + date |
| 5 | Activer (envoyer) | POST | `/signature_requests/{id}/activate` | Email envoyé au prospect |
| 6 | Récupérer statut | GET | `/signature_requests/{id}` | Check status |
| 7 | Télécharger signé | GET | `/signature_requests/{id}/documents/{docId}/download` | Post-signature |
| 8 | Envoyer rappel | POST | `/signature_requests/{id}/renotify` | J+2, J+5, J+7 |
| 9 | Annuler | DELETE | `/signature_requests/{id}` | Prospect refuse / nouveau contrat |

### Conditions de paiement automatiques (spec 8c)

```typescript
function getPaymentTerms(montantFinal: number): string {
  if (montantFinal >= 10000) {
    return '30% à la signature, 40% à la validation des maquettes, 30% à la livraison';
  }
  return '50% à la signature, 50% à la livraison';
}
```

### Webhook events Yousign

| Event | Action |
|-------|--------|
| `signature_request.done` | Deal → GAGNE, télécharger PDF signé, dispatch Agent 10 CSM |
| `signature_request.expired` | Deal → retour NEGOCIATION, notifier Jonathan, proposer renvoi |
| `signature_request.canceled` | Deal → PERDU si prospect annule |
| `signer.done` | Log activité deal |

---

## 10. FORMULAIRE SLACK JONATHAN (spec MASTER §2.4)

Modal Slack Block Kit avec 6 inputs pour saisie notes RDV :

| Input | Type | Required | Description |
|-------|------|:--------:|------------|
| `notes_jonathan` | `plain_text_input` (multiline) | Oui | Notes libres du RDV |
| `besoins_identifies` | `checkboxes` | Oui | site_vitrine, ecommerce_shopify, app_flutter, app_metier, rgaa, tracking_server_side |
| `budget_mentionne` | `number_input` | Non | Budget en EUR |
| `timeline_souhaitee` | `plain_text_input` | Non | Ex: "Q2 2026", "ASAP" |
| `objections_detectees` | `checkboxes` | Non | prix_eleve, timing, concurrence, budget, indecision |
| `urgence_percue` | `static_select` | Oui | haute / moyenne / basse |
| `probabilite_jonathan` | `number_input` (0-100) | Oui | Estimation closing % |

Le formulaire combine les données saisies avec les données prospect en BDD (Agents 1-5) pour construire le `DealmakerInput` complet.

---

## 11. PROCESSUS FOLLOW-UP COMPLET (spec 8b)

### Guards avant chaque relance

```typescript
async processFollowUp(job: FollowUpJob): Promise<void> {
  const deal = await db.deals.findById(job.deal_id);

  // Guard 1 : deal existe
  if (!deal) { logger.warn('Deal not found'); return; }

  // Guard 2 : deal toujours actif (pas signé, pas perdu, pas en signature)
  if (['GAGNE', 'PERDU', 'SIGNATURE_EN_COURS'].includes(deal.stage)) {
    logger.info(`Deal ${deal.deal_id} in ${deal.stage}, skip follow-up`);
    return;
  }

  // Guard 3 : prospect n'a pas répondu entre-temps
  const recentReply = await db.replies.findRecent(job.prospect_id, 48); // 48h
  if (recentReply) {
    logger.info('Prospect replied, cancelling follow-up');
    // Classifier la réponse → objection ou positif
    const classification = await classifyObjection(recentReply.body);
    if (classification.objection_type !== 'aucune') {
      await handleObjection(deal, classification);
    }
    return;
  }

  // Guard 4 : timing respecté (min 3 jours depuis dernier contact)
  if (deal.derniereRelanceAt) {
    const daysSince = (Date.now() - deal.derniereRelanceAt.getTime()) / 86400000;
    if (daysSince < 3) {
      logger.info(`Only ${daysSince.toFixed(1)}d since last contact, rescheduling`);
      await rescheduleFollowUp(job, 3 - daysSince);
      return;
    }
  }

  // Proceed with follow-up...
}
```

---

## 12. BRAINSTORM — FONCTIONNALITÉS ADDITIONNELLES

| # | Feature | Description | Priorité |
|---|---------|-------------|:--------:|
| F1 | **Calendly intégration** | Lien Calendly dans les emails de relance pour faciliter la prise de RDV | P1 |
| F2 | **Devis interactif HTML** | Prospect clique sur le tier souhaité directement dans l'email (pas de PDF) | P2 |
| F3 | **Échelonnement automatique** | Si objection budget → proposer automatiquement 2-3× sans frais | P1 |
| F4 | **PandaDoc migration** | Si volume > 100 devis/mois, migrer vers PandaDoc pour tracking natif | P3 |
| F5 | **Video pitch Loom** | Vidéo personnalisée intégrée dans le devis pour maximiser l'engagement | P3 |
| F6 | **Smart pricing** | IA ajuste les prix selon segment + urgence + historique concurrence | P2 |
| F7 | **Win/loss analysis** | Claude analyse les patterns des deals gagnés/perdus → recommandations Agent 7 | P2 |
| F8 | **Multi-signataires** | Support Yousign pour contrats nécessitant 2+ signatures (comités) | P2 |
| F9 | **Devis multi-services** | Combiner site_vitrine + tracking dans un seul devis avec remise bundle | P2 |
| F10 | **Comparatif concurrent** | Claude génère un tableau comparatif factuel si objection concurrence | P3 |

---

## 13. COÛTS AGENT 8

| Poste | Coût mensuel |
|-------|:----------:|
| Yousign Plus (API V3) | 28 EUR |
| Infrastructure (Puppeteer, Redis) | 20 EUR |
| Claude API (scope + objections) | 8 EUR |
| Stockage S3/Minio (PDFs) | 5 EUR |
| Domaine tracking | 1 EUR |
| **TOTAL** | **62 EUR/mois** |

---

## 8. BRAINSTORM — AMÉLIORATIONS

| # | Feature | Description | Priorité |
|---|---------|-------------|:--------:|
| F1 | **Calendly intégration** | Lien Calendly dans les emails de relance pour faciliter la prise de RDV | P1 |
| F2 | **Devis interactif** | HTML interactif au lieu de PDF statique — prospect clique sur le tier | P2 |
| F3 | **Échelonnement automatique** | Proposer automatiquement des paiements en 2-3 fois si budget objection | P1 |
| F4 | **PandaDoc migration** | Si volume > 100 devis/mois, migrer vers PandaDoc pour tracking natif | P3 |
| F5 | **Video pitch** | Loom intégré dans le devis pour personnalisation maximale | P3 |
| F6 | **Smart pricing** | Ajuster les prix en temps réel selon segment + urgence + concurrence | P2 |
| F7 | **Win/loss analysis** | Claude analyse les deals gagnés/perdus pour affiner les templates | P2 |

---

## 14. ROADMAP DÉTAILLÉE

### Phase 0 — Foundation (1 jour)
- [ ] Prisma migration (EngagementScore, DealActivity, DevisTracking, DevisOpen, WebhookEvent)
- [ ] Deal entity 7 stages + transitions automatiques
- [ ] DealmakerInputSchema complet (Zod)
- [ ] Processor enrichi (6 job types)
- [ ] @Roles + ParseUUIDPipe sur controller

### Phase 1 — 8a Devis (2 jours)
- [ ] QuoteGeneratorService (Claude scope analysis + Puppeteer PDF)
- [ ] PricingService étendu (6 services × 3 tiers avec features)
- [ ] HTML template Handlebars pour devis
- [ ] Tracking pixel (1x1 gif) + webhook endpoint
- [ ] Envoi email + Slack notification

### Phase 2 — 8b Relances (1.5 jours)
- [ ] DealFollowUpService (séquence J3/J7/J14/breakup)
- [ ] EngagementScoringService (8 signaux + seuils)
- [ ] ObjectionClassifierService (Claude 5 types + templates)
- [ ] Transfert PERDU → Agent 6

### Phase 3 — 8c Signature (1.5 jours)
- [ ] YousignService (API V3 client)
- [ ] Contrat PDF generation
- [ ] Webhook handler (HMAC validation + idempotence)
- [ ] Relance signature J2/J5/J7
- [ ] Transfert GAGNÉ → Agent 10

### Phase 4 — Tests (1 jour)
- [ ] Tests entity state machine (7 stages)
- [ ] Tests pricing (6 services × 3 tiers)
- [ ] Tests engagement scoring
- [ ] Tests objection classification
- [ ] Tests webhook HMAC validation
