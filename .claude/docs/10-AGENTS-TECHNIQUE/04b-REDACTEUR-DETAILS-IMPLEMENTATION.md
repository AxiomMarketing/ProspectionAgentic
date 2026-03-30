# Agent 4 — RÉDACTEUR — Détails d'implémentation complets

**Complément à :** `04-AGENT-4-REDACTEUR.md`
**Comble les 43 gaps identifiés par l'audit final du 27/03/2026**

---

## 1. USER PROMPT CIBLE (spec section 3.1.5)

Le prompt utilisateur DOIT contenir TOUS ces champs :

```typescript
function buildEmailUserPrompt(prospect: Prospect, enrichmentData: any, impactData: any, step: number): string {
  const signals = (enrichmentData?.signals as Array<{ type: string; date: string; detail: string }>) ?? [];
  const signalText = signals.map(s => `- ${s.type}: ${s.detail} (${s.date})`).join('\n');

  return `
ÉTAPE SÉQUENCE: ${step === 0 ? 'Premier contact' : `Relance ${step}`}

PROSPECT:
- Nom: ${sanitize(prospect.fullName ?? prospect.firstName ?? 'le dirigeant')}
- Poste: ${sanitize(prospect.jobTitle ?? 'Dirigeant')}
- Entreprise: ${sanitize(prospect.companyName ?? "l'entreprise")}
- Site: ${prospect.companyWebsite ?? 'inconnu'}
- Secteur: ${enrichmentData?.industry ?? 'non renseigné'}
- Taille: ${prospect.companySize ?? 'non renseignée'}
- Localisation: ${enrichmentData?.region ?? 'France'}

SIGNAUX D'ACHAT DÉTECTÉS:
${signalText || '- Aucun signal spécifique (approche générale)'}

DONNÉES TECHNIQUES:
- Lighthouse Performance: ${enrichmentData?.lighthouseScore ?? 'non disponible'}/100
- CMS: ${enrichmentData?.technique?.stack?.cms ?? 'non détecté'}
- Violations accessibilité: ${enrichmentData?.technique?.accessibilite?.violations_critical ?? 0} critiques

IMPACT FINANCIER CALCULÉ:
- ${impactData.messageImpact}
${impactData.perteCaMensuelle ? `- Perte CA estimée: ${impactData.perteCaMensuelle}€/mois (${impactData.perteCaAnnuelle}€/an)` : ''}
- Taux de rebond estimé: ${impactData.bounceRatePct}%

CONSIGNE: Rédige un email froid B2B personnalisé. Chaque email DOIT référencer le signal d'achat identifié. Pas de message générique.

Réponds en JSON:
{
  "subject_line": "36-50 caractères",
  "body": "50-125 mots, texte brut",
  "cta": "5-10 mots, question douce",
  "word_count": 87
}`;
}
```

### Sanitisation des champs prospect (Fix S2)

```typescript
function sanitize(input: string): string {
  return input
    .replace(/[\n\r]/g, ' ')
    .replace(/[{}[\]]/g, '')     // Supprime accolades/crochets (instructions LLM)
    .replace(/```/g, '')          // Supprime blocs de code
    .trim()
    .substring(0, 200);          // Tronque les inputs trop longs
}
```

---

## 2. SYSTEM PROMPT COMPLET (manquant dans la doc)

Le system prompt de la spec inclut des éléments manquants dans le code actuel :

```typescript
const EMAIL_SYSTEM_PROMPT_FULL = `
Tu es un expert en prospection B2B pour Axiom Marketing, agence digitale spécialisée.

OFFRES ET TARIFS (à mentionner subtilement si pertinent) :
- Site vitrine WordPress/Shopify : à partir de 1 500€
- Site e-commerce : à partir de 5 000€
- Tracking analytics avancé : 990€
- Audit accessibilité RGAA : 3 000€

RÈGLES STRICTES :
1. Structure : accroche personnalisée → problème identifié → solution Axiom → CTA doux
2. Longueur : 50-125 mots MAXIMUM
3. Format : texte brut UNIQUEMENT (pas de HTML, pas de markdown)
4. Objet : 36-50 caractères, intrigant, pas clickbait
5. CTA : question douce, peer-to-peer (jamais "réservez un appel")
6. Vouvoiement OBLIGATOIRE
7. Chaque email DOIT référencer le signal d'achat identifié

DONNÉES FOURNIES — UTILISE UNIQUEMENT CES DONNÉES :
Ne jamais inventer de chiffres. Utiliser uniquement les données fournies dans le prompt.

EXPRESSIONS INTERDITES :
"Je me permets de vous contacter", "J'espère que ce message vous trouve bien",
"Nous sommes leaders dans", "Notre solution unique", "N'hésitez pas à",
"Je serais ravi de", "Opportunité exceptionnelle", "Offre limitée",
"Toucher base", "Prendre le pouls", toute phrase commençant par "Nous"

EXPRESSIONS RECOMMANDÉES :
"J'ai remarqué que...", "En analysant votre site...", "Votre {signal} m'a interpellé...",
"Une question rapide...", "Seriez-vous ouvert à..."

ANTI-PATTERNS À ÉVITER :
- Flatterie générique ("j'admire votre entreprise")
- Lister des fonctionnalités au lieu de bénéfices
- Parler de soi avant de parler du prospect
- CTA agressif ("réservez maintenant")
`;
```

---

## 3. FEW-SHOT EXAMPLES (Fix B8)

Injecter 2 exemples par segment comme messages user/assistant AVANT le vrai prompt :

```typescript
const FEW_SHOT_EXAMPLES: Record<string, Array<{ user: string; assistant: string }>> = {
  pme_metro: [
    {
      user: 'Prospect: Marie Dupont — DG chez ABC SAS. Site: abc-solutions.fr. Signal: recrute développeur React. Lighthouse: 35/100.',
      assistant: JSON.stringify({
        subject_line: "ABC Solutions : votre site freine vos recrutements",
        body: "Bonjour Marie,\n\nEn cherchant votre offre de développeur React, j'ai testé abc-solutions.fr. Score Lighthouse : 35/100 — les candidats quittent la page avant de postuler.\n\nUn site rapide et moderne renforce votre marque employeur. Nous avons accompagné des PME similaires en 3 semaines.\n\nSeriez-vous ouverte à un diagnostic rapide ?",
        cta: "Seriez-vous ouverte à un diagnostic rapide ?",
        word_count: 62,
      }),
    },
  ],
  collectivite: [
    {
      user: 'Prospect: Jean Martin — DSI chez Département 974. Signal: AO développement web. Lighthouse: 28/100. Violations RGAA: 12 critiques.',
      assistant: JSON.stringify({
        subject_line: "Accessibilité numérique : 12 non-conformités détectées",
        body: "Bonjour M. Martin,\n\nVotre appel d'offres développement web a retenu mon attention. J'ai analysé votre site actuel : 12 violations critiques RGAA et un Lighthouse de 28/100.\n\nLe RGAA est désormais obligatoire pour les collectivités. Nous accompagnons plusieurs collectivités DOM-TOM dans leur mise en conformité.\n\nPuis-je vous présenter notre approche en 15 minutes ?",
        cta: "Puis-je vous présenter notre approche en 15 minutes ?",
        word_count: 72,
      }),
    },
  ],
  // startup, ecommerce, agence_wl — 2 examples each
};
```

---

## 4. IMPACT CALCULATOR — 4 formules complètes (Fix B6)

### Performance (existant — corrections mineures)

Spec utilise des tiers Lighthouse → % perte CA :
- 90+ → 0%, 70-89 → 5%, 50-69 → 12%, < 50 → 25%

### Attribution (startups/ecommerce — MANQUANT)

```typescript
calculateAttributionImpact(segment: string, caAnnuel?: number): ImpactResult {
  const pubPct = segment === 'startup' ? 0.20 : 0.15; // 20% startups, 15% ecommerce
  const budgetPub = (caAnnuel ?? 500000) * pubPct;
  const gaspillagePct = 0.30; // 30% gaspillé sans attribution
  const gaspillage = budgetPub * gaspillagePct;
  const roasMultiplier = 3;
  const manqueAGagner = gaspillage * roasMultiplier;

  return {
    messageImpact: `sans tracking attribution, environ ${Math.round(gaspillage)}€/an de budget pub sont gaspillés — soit ${Math.round(manqueAGagner)}€ de CA potentiel non capté`,
    gaspillageAnnuel: gaspillage,
    manqueAGagner,
  };
}
```

### RGAA (collectivités — MANQUANT)

```typescript
calculateRGAAImpact(lighthouseA11y: number): ImpactResult {
  // Mapping Lighthouse a11y → nombre de critères RGAA non conformes
  const criteresNonConformes =
    lighthouseA11y >= 95 ? 5 : lighthouseA11y >= 85 ? 15 :
    lighthouseA11y >= 70 ? 25 : lighthouseA11y >= 50 ? 40 : 55;

  const coutParCritere = 275; // Moyenne 200-350€
  const coutMiseConformite = criteresNonConformes * coutParCritere;
  const delaiSemaines = Math.ceil(criteresNonConformes / 5);

  return {
    messageImpact: `${criteresNonConformes} critères RGAA non conformes détectés — mise en conformité estimée à ${coutMiseConformite}€ sur ${delaiSemaines} semaines`,
    criteresNonConformes,
    coutEstime: coutMiseConformite,
    delaiSemaines,
  };
}
```

### Cart Abandon (Shopify — MANQUANT)

```typescript
calculateCartAbandonImpact(lighthouseScore: number, panierMoyen?: number): ImpactResult {
  const panier = panierMoyen ?? 65; // Panier moyen e-commerce FR
  const loadTimeS = lighthouseScore >= 90 ? 1.2 : lighthouseScore >= 70 ? 2.2 :
    lighthouseScore >= 50 ? 3.5 : 5.0;

  // Corrélation temps → abandon : +1s = +10% abandon
  const tauxAbandonBase = 0.70; // 70% taux abandon moyen
  const tauxAbandonImpact = Math.min(0.95, tauxAbandonBase + (loadTimeS - 2) * 0.10);
  const recoverablePct = 0.20; // 20% récupérable avec optimisation
  const paniersPerdusMois = 1000; // Estimation
  const recoverableMensuel = Math.round(paniersPerdusMois * recoverablePct * panier);

  return {
    messageImpact: `avec ${loadTimeS}s de chargement, ~${Math.round(tauxAbandonImpact * 100)}% d'abandon panier — ${recoverableMensuel}€/mois récupérables`,
    tauxAbandon: tauxAbandonImpact,
    recoverableMensuel,
  };
}
```

### Routing par segment

```typescript
calculateImpact(segment: string, prospect: Prospect, enrichmentData: any): ImpactResult {
  const lh = enrichmentData?.lighthouseScore ?? 60;
  const ca = prospect.companyRevenue;

  switch (segment) {
    case 'collectivite':
      return this.calculateRGAAImpact(enrichmentData?.technique?.accessibilite?.score ?? 60);
    case 'ecommerce':
      return enrichmentData?.technique?.stack?.ecommerce_platform === 'Shopify'
        ? this.calculateCartAbandonImpact(lh)
        : this.calculatePerformanceImpact(lh, ca);
    case 'startup':
      return this.calculateAttributionImpact('startup', ca);
    default:
      return this.calculatePerformanceImpact(lh, ca);
  }
}
```

---

## 5. VALIDATION COMPLÈTE — 6 checks pipeline (spec section 6.1-6.2)

```typescript
interface ValidationResult {
  valid: boolean;
  checks: {
    length: boolean;       // 50-125 mots body, 36-50 chars subject
    spamWords: boolean;    // 50+ mots interdits
    tone: boolean;         // Clichés, tutoiement, anti-patterns
    hallucination: boolean; // Chiffres dans le message vs données fournies
    personalization: boolean; // Prénom + entreprise présents
    ctaSoft: boolean;      // Question douce, pas impératif
  };
  errors: string[];
}
```

### Check 3 — Tone (MANQUANT dans le code)

```typescript
const BANNED_CLICHES = [
  "je me permets de vous contacter", "j'espère que ce message vous trouve bien",
  "nous sommes leaders", "notre solution unique", "n'hésitez pas à",
  "je serais ravi de", "opportunité exceptionnelle", "offre limitée",
  "toucher base", "prendre le pouls",
];

function checkTone(body: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const lower = body.toLowerCase();

  for (const cliche of BANNED_CLICHES) {
    if (lower.includes(cliche)) errors.push(`Cliché interdit: "${cliche}"`);
  }

  // Vérifier vouvoiement
  if (/\btu\b|\bton\b|\bta\b|\btes\b/i.test(body)) {
    errors.push('Tutoiement détecté — vouvoiement obligatoire');
  }

  // Phrases commençant par "Nous"
  const sentences = body.split(/[.!?]+/);
  for (const s of sentences) {
    if (s.trim().startsWith('Nous ')) errors.push(`Phrase commence par "Nous": "${s.trim().slice(0, 50)}..."`);
  }

  return { valid: errors.length === 0, errors };
}
```

### Check 4 — Hallucination (MANQUANT)

```typescript
function checkHallucination(body: string, inputData: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Extraire tous les nombres du message
  const numbersInBody = body.match(/\d[\d\s,.]*\d|\d+/g) ?? [];

  // Vérifier que chaque nombre existe dans les données fournies
  const allowedNumbers = new Set<string>();
  const extractNumbers = (obj: unknown) => {
    if (typeof obj === 'number') allowedNumbers.add(String(obj));
    if (typeof obj === 'object' && obj) Object.values(obj).forEach(extractNumbers);
  };
  extractNumbers(inputData);

  for (const num of numbersInBody) {
    const cleaned = num.replace(/[\s,.]/g, '');
    if (!allowedNumbers.has(cleaned) && parseInt(cleaned) > 10) {
      errors.push(`Nombre possiblement inventé: "${num}" — pas trouvé dans les données fournies`);
    }
  }

  return { valid: errors.length === 0, errors };
}
```

### Check 5 — Personalization (MANQUANT)

```typescript
function checkPersonalization(body: string, prospectName: string, companyName: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (prospectName && !body.includes(prospectName)) {
    errors.push(`Prénom prospect "${prospectName}" absent du message`);
  }
  if (companyName && !body.includes(companyName)) {
    errors.push(`Nom entreprise "${companyName}" absent du message`);
  }
  return { valid: errors.length === 0, errors };
}
```

---

## 6. MULTI-STEP SÉQUENCES — Contraintes par étape (spec)

| Step | Type | Mots | Angle | Contrainte spécifique |
|:----:|------|:----:|-------|----------------------|
| 0 | Premier contact | 50-125 | Pain + solution | Référencer le signal d'achat |
| 1 | Relance 1 (J+3-5) | 50-80 | Nouvel angle + preuve sociale | "Je reviens vers vous car..." |
| 2 | Relance 2 (J+7-10) | 40-60 | Question directe OU insight | Très court, une seule question |
| 3 | Break-up (J+14) | 30-50 | Respectueux, décontracté | Laisser porte ouverte, PAS de pression |

```typescript
const STEP_CONSTRAINTS: Record<number, { minWords: number; maxWords: number; angle: string; tone: string }> = {
  0: { minWords: 50, maxWords: 125, angle: 'PAIN → problème identifié → solution Axiom', tone: 'professionnel_direct' },
  1: { minWords: 50, maxWords: 80, angle: 'GAIN → nouvel angle, preuve sociale, cas client', tone: 'plus_familier' },
  2: { minWords: 40, maxWords: 60, angle: 'QUESTION → une seule question directe ou insight rapide', tone: 'concis_direct' },
  3: { minWords: 30, maxWords: 50, angle: 'BREAK_UP → respectueux, porte ouverte, pas de pression', tone: 'decontracte_respectueux' },
};
```

---

## 7. LINKEDIN COMPLET (Fix B1-B3 + comment generation)

### 3 types de messages LinkedIn (spec 4b)

| Type | Max chars | Quand |
|------|:---------:|-------|
| Note de connexion | 300 | Avec la demande de connexion |
| Message post-connexion | 500 | Après acceptation |
| Commentaire sur post | 280 | Avant connexion (warming) |

### Comment generation (TYPE 3 — ABSENT du code et de la doc)

```typescript
async generateLinkedinComment(prospectId: string, postContent: string): Promise<string> {
  const prospect = await this.prisma.prospect.findUnique({ where: { id: prospectId } });

  const systemPrompt = `Tu commentes un post LinkedIn pour établir une relation professionnelle.
RÈGLES:
- Max 280 caractères
- Ajoute un insight ou une perspective (pas juste "super post!")
- Cite une expérience pertinente si possible
- Pose une question ouverte pour engager
- PAS de promotion, PAS de lien, PAS de pitch
- Ton: expert bienveillant`;

  const userPrompt = `Post de ${sanitize(prospect.fullName)}: "${sanitize(postContent.slice(0, 500))}"
Commente ce post de manière pertinente et engageante.`;

  const result = await this.llmService.call({
    task: LlmTask.GENERATE_LINKEDIN_MESSAGE,
    systemPrompt,
    userPrompt,
    maxTokens: 100,
    temperature: 0.8,
  });

  // Validation 280 chars
  const comment = result.content.slice(0, 280);
  return comment;
}
```

### Segment-specific LinkedIn prompts (ABSENT)

Chaque segment a un ton LinkedIn différent :
- **pme_metro** : professionnel, mentionner le réseau local
- **startup** : décontracté, mentionner la stack tech
- **collectivite** : formel, mentionner la conformité
- **ecommerce** : centré sur les résultats, mentionner le CA
- **agence_wl** : partenariat, mentionner le modèle white-label

---

## 8. OUTPUT JSON COMPLET vers Suiveur (spec section 8.1)

Le job `message.generated` DEVRAIT contenir :

```typescript
{
  prospectId: string,
  messageId: string,           // GeneratedMessage.id (FK valide)
  channel: 'email' | 'linkedin',
  sequenceId: string,          // Du routing Scoreur (ex: SEQ_HOT_A_PREMIUM)
  stepNumber: number,          // Étape dans la séquence
  category: string,            // HOT_A, HOT_B, HOT_C
  slaHours: number,            // Délai max d'envoi
  // Metadata pour le Suiveur
  subject?: string,            // Pour email
  bodyPreview?: string,        // 100 premiers chars pour preview
  isApproved: boolean,
}
```

---

## 9. FEATURES SPEC ABSENTES DE LA DOC (11 items)

| # | Feature | Spec section | Priorité | Effort |
|---|---------|-------------|:--------:|:------:|
| F1 | LinkedIn comment generation (TYPE 3) | 4b section 3.2.2 | Phase 3 | 0.5j |
| F2 | Role-based personalization (CMO/CTO/CEO) | 4-MASTER section 5.2-5.3 | Phase 2 | 0.5j |
| F3 | Anti-AI-detection techniques | 4-MASTER section 5.4 | Phase 2 | 0.5j |
| F4 | Deliverability (SPF/DKIM/DMARC/domain warming) | 4-MASTER section 7 | Phase 6 | 1j |
| F5 | A/B testing framework | 4-MASTER section 6.4 | Phase 5+ | 1.5j |
| F6 | Full output schema to Suiveur (18+ fields) | 4-MASTER section 8.1 | Phase 0 | 0.5j |
| F7 | Claude API rate limiting (50 req/min) | 4-MASTER section 11.1 | Phase 0 | 0.5j |
| F8 | Referral lead template adaptation | 4-MASTER section 12.2 | Phase 5 | 0.5j |
| F9 | Social proof from Agent 10 (CSM) | 4-MASTER section 12.3 | Phase 5+ | 0.5j |
| F10 | 6-checks validation pipeline | 4-MASTER section 6.1-6.2 | Phase 0 | 1j |
| F11 | Human validation for HOT leads (Slack n8n) | 4-MASTER section 6.3 | Phase 5 | 1j |

---

## 10. SÉCURITÉ LLM — Défenses spécifiques

### Output sanitization (Fix S1)

```typescript
function sanitizeLlmOutput(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')           // Strip HTML tags
    .replace(/javascript:/gi, '')       // Remove JS protocol
    .replace(/on\w+\s*=/gi, '')         // Remove event handlers
    .replace(/```[\s\S]*?```/g, '')     // Remove code blocks
    .replace(/\[.*?\]\(.*?\)/g, '')     // Remove markdown links
    .trim();
}
```

### RGPD check avant génération (Fix S5)

```typescript
async checkRgpdBeforeGeneration(prospectId: string): Promise<void> {
  const prospect = await this.prisma.prospect.findUnique({
    where: { id: prospectId },
    select: { consentGiven: true, rgpdErasedAt: true, email: true, companySiren: true },
  });

  if (prospect.rgpdErasedAt) throw new Error('RGPD: prospect erased');
  // Note: pour le B2B, le consentement n'est pas toujours requis (intérêt légitime)
  // Mais vérifier la blacklist
  const blacklisted = await this.prisma.rgpdBlacklist.findFirst({
    where: { OR: [{ email: prospect.email }, { companySiren: prospect.companySiren }] },
  });
  if (blacklisted) throw new Error('RGPD: prospect blacklisted');
}
```

### Rate limiting Claude API (Fix F7)

```typescript
// Dans agent-redacteur.module.ts — BullMQ worker options
@Processor(QUEUE_NAMES.REDACTEUR_PIPELINE, {
  concurrency: 3,
  limiter: { max: 50, duration: 60000 }, // 50 jobs/min max
})
```

---

## 11. DÉVIATIONS CODE/SPEC DOCUMENTÉES

| Paramètre | Spec | Code | Décision |
|-----------|------|------|----------|
| `maxTokens` | 500 | 600 | **Adopter 500** (spec) pour réduire coûts |
| Retries | 3 (temp -0.15/retry) | 1 (temp 0.5) | **Adopter 3** retries : 0.7 → 0.55 → 0.40 |
| Bounce rate | `9.56 * ln(t) + 7` (log) | Step function | **Garder step function** (plus simple, résultat similaire) |
| Revenue loss | Tiers (0%/5%/12%/25%) | `0.02 * conversionImpactPct` | **Adopter tiers** (spec, plus précis) |
| Segment keys | `shopify_ecommerce` | `ecommerce` | **Garder `ecommerce`** (cohérent avec reste du système) |

---

## 12. ROADMAP MISE À JOUR (couvre les 43 gaps)

### Phase 0 — Fixes critiques + sécurité (2 jours)
- [ ] **B1** : Persister LinkedIn en DB + dispatch Suiveur
- [ ] **B2** : Fix placeholder `{entreprise}` LinkedIn
- [ ] **B3** : Validation LinkedIn (300/500/280 chars)
- [ ] **B4** : stepNumber propagé (pas hardcodé 1)
- [ ] **B5** : Utiliser category pour adapter le ton (HOT_A urgent, COLD exploratoire)
- [ ] **B7** : Injecter signaux dans le prompt (section 1 de ce doc)
- [ ] **B9** : Propager sequenceId au Suiveur
- [ ] **B10** : Fix segment lookup (enrichmentData.segment, pas score.segment)
- [ ] **S1** : Sanitizer output LLM (section 10)
- [ ] **S2** : Sanitizer champs prospect (section 1, fonction `sanitize()`)
- [ ] **S4** : Auth guard sur controller
- [ ] **S5** : Check RGPD avant génération (section 10)
- [ ] **F6** : Output complet au Suiveur (section 8)
- [ ] **F7** : Rate limiting Claude API (50 req/min)
- [ ] **F10** : Validation 6 checks (section 5)

### Phase 1 — Impact Calculator + prompts enrichis (1.5 jours)
- [ ] **B6** : 3 formules manquantes (attribution, RGAA, cart abandon) (section 4)
- [ ] **B8** : Few-shot examples 2/segment (section 3)
- [ ] System prompt complet avec tarifs, expressions interdites, anti-patterns (section 2)
- [ ] JSON output format (remplacer regex OBJET/CORPS)
- [ ] 3 retries avec température décroissante (0.7 → 0.55 → 0.40)
- [ ] maxTokens: 500 (alignement spec)

### Phase 2 — Personnalisation avancée (1 jour)
- [ ] **F2** : Role-based personalization (CMO/CTO/CEO angles)
- [ ] **F3** : Anti-AI-detection (variété syntaxique, pas de patterns répétitifs)
- [ ] Injecter données techniques (CMS version, stack, violations axe-core)
- [ ] Injecter données financières (CA, croissance) si disponibles
- [ ] Contexte temporel (saison, budget cycle)
- [ ] Historique outreach (référencer emails précédents)

### Phase 3 — LinkedIn complet (1 jour)
- [ ] **F1** : Comment generation sur posts prospect (section 7)
- [ ] Segment-specific LinkedIn prompts (section 7)
- [ ] Post-connection message avec ton plus familier
- [ ] Séquence LinkedIn : comment → connexion → message → relance

### Phase 4 — Multi-step séquences (1.5 jours)
- [ ] Contraintes par étape (section 6) : mots, angle, ton
- [ ] Prompts différents par step (pain → gain → question → break-up)
- [ ] Timer configurable entre steps (3/7/14 jours)
- [ ] Exit conditions (réponse, conversion, désabonnement)

### Phase 5 — Approval + A/B testing (1 jour)
- [ ] **G3** : Approval workflow (endpoint approve, gate Suiveur)
- [ ] **F5** : A/B testing (2 variants par prospect, hash bucketing)
- [ ] **F8** : Template adaptation referral leads
- [ ] **F11** : Human validation HOT leads (Slack n8n)

### Phase 6 — Monitoring + deliverability (1 jour)
- [ ] **S6** : Persister coûts LLM (Redis ou MetriquesDaily)
- [ ] **S9** : Écrire personalizationData JSON
- [ ] **S10** : Capturer langfuseTraceId
- [ ] **G4** : Dashboard Rédacteur (messages/jour, coûts, taux validation, temps moyen)
- [ ] **G5** : Fix llmCostEur dans dashboard
- [ ] **F4** : Deliverability (SPF/DKIM/DMARC docs, domain warming plan)

### Dépendances

```
Phase 0 (fixes) — BLOQUANTE
  ↓
Phase 1 (prompts) + Phase 3 (LinkedIn) — parallélisables
  ↓
Phase 2 (perso) — dépend de 1
Phase 4 (multi-step) — dépend de 0
  ↓
Phase 5 (approval/AB) — dépend de 0+4
Phase 6 (monitoring) — dépend de tout
```
