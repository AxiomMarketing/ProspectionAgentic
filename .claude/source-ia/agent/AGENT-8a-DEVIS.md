# SOUS-AGENT 8a — GENERATEUR DE DEVIS
**Agent parent** : AGENT-8-MASTER.md

**Version :** 1.0
**Date :** 2026-03-19

---

## 3a.1 Mission

Creer automatiquement un devis personnalise en moins de 30 secondes apres que Jonathan a valide ses notes de RDV. Le devis presente 3 tiers (Bronze/Silver/Gold) avec le tier recommande mis en evidence, et inclut le scope personnalise genere par Claude API a partir des notes de Jonathan.

## 3a.2 Architecture technique

```
DealmakerInput (post-RDV)
    |
    v
+---------------------------------------------------+
| SOUS-AGENT 8a : GENERATEUR DE DEVIS               |
| 1. Analyser notes RDV via Claude API (2-3s)       |
| 2. Selectionner template + tier recommande         |
| 3. Generer scope personnalise (Claude API)         |
| 4. Assembler HTML + variables (Handlebars)         |
| 5. Generer PDF (Puppeteer, 5-8s)                   |
| 6. Envoyer + tracker via email                     |
| 7. Logger en BDD + notifier Jonathan (Slack)       |
+---------------------------------------------------+
    |
    v
Devis PDF envoye --> Deal passe en stage "DEVIS_CREE"
```

## 3a.3 Solution technique : Puppeteer PDF maison

**Choix justifie pour Axiom :**

| Critere | PandaDoc API | Puppeteer (maison) |
|---------|-------------|-------------------|
| **Cout** | 240-440 EUR/mois (40 EUR + 4 EUR/doc) | 0 EUR (self-hosted) |
| **Controle** | Template PandaDoc limites | HTML/CSS illimite |
| **Vitesse** | 2-3s via API | 5-8s local |
| **Tracking** | Natif (ouvertures, vues) | Custom (pixel tracking) |
| **Dependance** | SaaS externe | Aucune |
| **CSS moderne** | Limite | Grid, Flexbox, CSS Paged Media |

**Recommandation :** Puppeteer pour la generation PDF (cout zero, controle total), avec tracking custom via pixel invisible + webhook maison.

**Alternative PandaDoc :** Si le volume depasse 100 devis/mois ou si le tracking natif devient critique, migrer vers PandaDoc API ($40/mois + $4/doc).

## 3a.4 Code TypeScript complet

```typescript
import puppeteer, { Browser } from 'puppeteer'
import Handlebars from 'handlebars'
import Anthropic from '@anthropic-ai/sdk'
import { v4 as uuidv4 } from 'uuid'
import { DealmakerInput } from './types/dealmaker'
import { db, slack, emailService, trackingService } from './services'

// ============================================================
// INTERFACES
// ============================================================

interface DevisGenere {
  devis_id: string
  deal_id: string
  prospect_id: string
  pdf_buffer: Buffer
  pdf_url: string
  tier_recommande: 'bronze' | 'silver' | 'gold'
  montant_bronze: number
  montant_silver: number
  montant_gold: number
  scope_personnalise: string
  validite_jours: number
  tracking_id: string
  created_at: string
}

interface ScopeAnalysis {
  type_projet: string
  description_scope: string
  livrables: string[]
  features_bronze: string[]
  features_silver: string[]
  features_gold: string[]
  timeline_estimee: {
    bronze_semaines: number
    silver_semaines: number
    gold_semaines: number
  }
  add_ons_suggeres: string[]
  notes_specifiques: string
}

interface TierConfig {
  nom: string
  prix_min: number
  prix_max: number
  prix_affiche: number
  features: string[]
  timeline_semaines: number
  label: string
  is_recommended: boolean
}

// ============================================================
// TEMPLATES PAR SERVICE
// ============================================================

const SERVICE_TEMPLATES: Record<string, {
  template_id: string
  display_name: string
  bronze: TierConfig
  silver: TierConfig
  gold: TierConfig
}> = {
  // --- SITE VITRINE ---
  site_vitrine: {
    template_id: 'TPL_SITE_VITRINE_V3',
    display_name: 'Site Vitrine',
    bronze: {
      nom: 'Essentiel',
      prix_min: 1500,
      prix_max: 3000,
      prix_affiche: 1500,
      features: [
        'Template WordPress/Webflow premium',
        '5-8 pages (Accueil, A propos, Services, Contact, Mentions legales)',
        'Design responsive mobile',
        'Formulaire de contact basique',
        'Hebergement + SSL 1 an inclus',
        'Mise en ligne et formation 1h',
      ],
      timeline_semaines: 3,
      label: 'Essentiel',
      is_recommended: false,
    },
    silver: {
      nom: 'Professionnel',
      prix_min: 5000,
      prix_max: 8000,
      prix_affiche: 5000,
      features: [
        'Design 100% sur-mesure Figma (maquettes validees)',
        '10-15 pages avec contenu optimise',
        'Micro-interactions et animations soignees',
        'SEO on-page complet + configuration GA4',
        'Formulaires avances + integration CRM (HubSpot/Pipedrive)',
        'Hebergement premium + SSL 1 an',
        '2 cycles de revision inclus',
        'Formation client 2h (back-office + analytics)',
      ],
      timeline_semaines: 5,
      label: 'Le plus choisi',
      is_recommended: true,
    },
    gold: {
      nom: 'Premium',
      prix_min: 10000,
      prix_max: 15000,
      prix_affiche: 9500,
      features: [
        'Tout le pack Professionnel +',
        'Interactions avancees (parallax, 3D, scroll animations)',
        'Blog integre avec CMS editorial complet',
        'Optimisation performance Lighthouse 95+',
        'Strategie SEO avancee + maillage interne',
        'Integration chatbot IA (FAQ automatisee)',
        '6 mois de support prioritaire inclus',
        'Formation client 4h (SEO + CMS + analytics)',
        'Maintenance technique 1 an incluse',
      ],
      timeline_semaines: 8,
      label: 'Premium',
      is_recommended: false,
    },
  },

  // --- E-COMMERCE SHOPIFY ---
  ecommerce_shopify: {
    template_id: 'TPL_ECOMMERCE_SHOPIFY_V2',
    display_name: 'Boutique E-commerce Shopify',
    bronze: {
      nom: 'Starter',
      prix_min: 5000,
      prix_max: 8000,
      prix_affiche: 5000,
      features: [
        'Theme Shopify premium personnalise',
        'Jusqu\'a 50 produits configures',
        'Paiement standard (Stripe, PayPal, CB)',
        'Livraison standard (Colissimo, Mondial Relay)',
        'Email marketing integration (Klaviyo basique)',
        'Plan Shopify Basic 1 an inclus',
        'Formation client 2h',
      ],
      timeline_semaines: 4,
      label: 'Starter',
      is_recommended: false,
    },
    silver: {
      nom: 'Growth',
      prix_min: 8000,
      prix_max: 12000,
      prix_affiche: 10000,
      features: [
        'Design semi-custom Figma + Shopify',
        'Jusqu\'a 500 produits avec variantes (tailles, couleurs)',
        'Apps Shopify strategiques (reviews, upsell, cross-sell)',
        'Configuration taxes + livraison multi-zones',
        'Klaviyo avance (flows automatises, segmentation)',
        'GA4 + tracking e-commerce avance',
        'Training client complet 4h',
        '3 cycles de revision inclus',
      ],
      timeline_semaines: 6,
      label: 'Le plus choisi',
      is_recommended: true,
    },
    gold: {
      nom: 'Scale',
      prix_min: 12000,
      prix_max: 15000,
      prix_affiche: 15000,
      features: [
        'Developpement Shopify custom (Liquid + API)',
        'Configurateur produit avance / visualisation 3D',
        'Synchronisation inventaire multi-canaux',
        'Abonnements et produits recurrents',
        'Analytics avance + tableaux de bord personnalises',
        'Optimisation performance (Core Web Vitals)',
        '6 mois support prioritaire inclus',
        'Migration donnees depuis ancienne plateforme',
      ],
      timeline_semaines: 10,
      label: 'Scale',
      is_recommended: false,
    },
  },

  // --- APP FLUTTER ---
  app_flutter: {
    template_id: 'TPL_APP_FLUTTER_V1',
    display_name: 'Application Mobile Flutter',
    bronze: {
      nom: 'MVP',
      prix_min: 15000,
      prix_max: 25000,
      prix_affiche: 15000,
      features: [
        'Application iOS + Android (Flutter cross-platform)',
        '6-8 ecrans critiques (parcours utilisateur principal)',
        'Design UI basique (Material Design / Cupertino)',
        'Integration API REST existante',
        'Authentification simple (email/password)',
        'Publication App Store + Google Play',
        'Support 1 mois post-lancement',
      ],
      timeline_semaines: 8,
      label: 'MVP',
      is_recommended: false,
    },
    silver: {
      nom: 'Complete',
      prix_min: 25000,
      prix_max: 50000,
      prix_affiche: 35000,
      features: [
        'Application complete iOS + Android',
        '15-25 ecrans avec navigation avancee',
        'Design UI/UX professionnel Figma (maquettes + prototype)',
        'Backend API sur-mesure (Node.js + PostgreSQL)',
        'Authentification avancee (OAuth, biometrie)',
        'Notifications push (Firebase)',
        'Mode hors-ligne avec synchronisation',
        'Tests unitaires + integration',
        'Support 2 mois post-lancement',
      ],
      timeline_semaines: 14,
      label: 'Le plus choisi',
      is_recommended: true,
    },
    gold: {
      nom: 'Enterprise',
      prix_min: 50000,
      prix_max: 80000,
      prix_affiche: 60000,
      features: [
        'Tout le pack Complete +',
        'Integrations tierces complexes (ERP, CRM, paiement)',
        'Analytics avancees + crash reporting (Sentry)',
        'CI/CD automatise (builds, tests, deploiements)',
        'Dashboard admin web (React)',
        'Architecture micro-services scalable',
        'Documentation technique complete',
        'Formation equipe technique client 8h',
        'Support prioritaire 6 mois',
      ],
      timeline_semaines: 22,
      label: 'Enterprise',
      is_recommended: false,
    },
  },

  // --- APP METIER ---
  app_metier: {
    template_id: 'TPL_APP_METIER_V1',
    display_name: 'Application Metier Sur-Mesure',
    bronze: {
      nom: 'Module Unique',
      prix_min: 25000,
      prix_max: 40000,
      prix_affiche: 25000,
      features: [
        'Application web sur-mesure (React + Node.js)',
        '1 module metier principal (ex: gestion stocks, planning, CRM)',
        'Interface utilisateur adaptee au workflow metier',
        'Base de donnees PostgreSQL dediee',
        'Gestion des utilisateurs et droits d\'acces',
        'Export donnees (CSV, PDF)',
        'Deploiement cloud (AWS/OVH)',
        'Support 2 mois',
      ],
      timeline_semaines: 10,
      label: 'Module Unique',
      is_recommended: false,
    },
    silver: {
      nom: 'Multi-Modules',
      prix_min: 40000,
      prix_max: 60000,
      prix_affiche: 50000,
      features: [
        'Application web + mobile (React + Flutter)',
        '3-5 modules metier interconnectes',
        'Design UX personnalise (parcours utilisateur optimise)',
        'API RESTful documentee (Swagger/OpenAPI)',
        'Integrations tierces (comptabilite, email, fichiers)',
        'Tableau de bord analytique temps reel',
        'Gestion multi-sites / multi-utilisateurs',
        'Tests automatises (unitaires + E2E)',
        'Support 4 mois',
      ],
      timeline_semaines: 18,
      label: 'Le plus choisi',
      is_recommended: true,
    },
    gold: {
      nom: 'Sur-Mesure Complet',
      prix_min: 60000,
      prix_max: 80000,
      prix_affiche: 75000,
      features: [
        'Tout le pack Multi-Modules +',
        'Architecture micro-services (scalabilite illimitee)',
        'Integrations ERP/SAP/Salesforce',
        'IA integree (predictions, automatisations intelligentes)',
        'Application mobile native (Flutter) dediee',
        'SSO (Single Sign-On) + LDAP',
        'Audit securite + conformite RGPD',
        'Documentation technique + fonctionnelle complete',
        'Formation equipe client 16h',
        'Support prioritaire 6 mois + SLA garanti',
      ],
      timeline_semaines: 26,
      label: 'Sur-Mesure Complet',
      is_recommended: false,
    },
  },

  // --- RGAA COLLECTIVITES ---
  rgaa: {
    template_id: 'TPL_RGAA_COLLECTIVITE_V1',
    display_name: 'Mise en Conformite RGAA (Accessibilite)',
    bronze: {
      nom: 'Audit + Corrections Essentielles',
      prix_min: 8000,
      prix_max: 15000,
      prix_affiche: 8000,
      features: [
        'Audit RGAA 4.1 complet (106 criteres, 50 pages)',
        'Rapport detaille avec prioritisation des non-conformites',
        'Corrections des non-conformites critiques (niveau A)',
        'Declaration d\'accessibilite conforme',
        'Formation equipe 2h (bonnes pratiques)',
        'Score RGAA cible : 50% --> 75%',
      ],
      timeline_semaines: 4,
      label: 'Audit + Essentiels',
      is_recommended: false,
    },
    silver: {
      nom: 'Refonte Partielle',
      prix_min: 15000,
      prix_max: 30000,
      prix_affiche: 20000,
      features: [
        'Audit RGAA 4.1 complet + tests utilisateurs handicapes',
        'Corrections niveaux A + AA (conformite legale)',
        'Refonte des composants critiques (navigation, formulaires, tableaux)',
        'Schema pluriannuel de mise en accessibilite',
        'Declaration d\'accessibilite + mention legale',
        'Formation equipe 4h (editeurs + developpeurs)',
        'Score RGAA cible : 50% --> 90%',
        'Support 3 mois post-livraison',
      ],
      timeline_semaines: 8,
      label: 'Le plus choisi',
      is_recommended: true,
    },
    gold: {
      nom: 'Refonte Complete',
      prix_min: 30000,
      prix_max: 50000,
      prix_affiche: 40000,
      features: [
        'Tout le pack Refonte Partielle +',
        'Refonte design complete orientee accessibilite (WCAG 2.2 AAA)',
        'Refonte technique (HTML semantique, ARIA, performances)',
        'Tests automatises d\'accessibilite en CI/CD',
        'Tests avec panel utilisateurs en situation de handicap',
        'Accompagnement schema pluriannuel 24 mois',
        'Formation complete equipe 8h (devs + editeurs + chefs projet)',
        'Audit de suivi a 6 mois et 12 mois',
        'Score RGAA cible : 100% conformite AA',
      ],
      timeline_semaines: 16,
      label: 'Conformite Totale',
      is_recommended: false,
    },
  },

  // --- TRACKING SERVER-SIDE ---
  tracking_server_side: {
    template_id: 'TPL_TRACKING_SS_V2',
    display_name: 'Tracking Server-Side (GTM SS)',
    bronze: {
      nom: 'Standard',
      prix_min: 990,
      prix_max: 990,
      prix_affiche: 990,
      features: [
        'Installation GTM Server-Side (Google Cloud Run)',
        'Configuration GA4 server-side',
        'Migration des tags existants (jusqu\'a 10 tags)',
        'Domaine personnalise (first-party cookies)',
        'Documentation technique',
        'Maintenance mensuelle : 89 EUR/mois',
      ],
      timeline_semaines: 1,
      label: 'Standard',
      is_recommended: false,
    },
    silver: {
      nom: 'Avance',
      prix_min: 1490,
      prix_max: 1490,
      prix_affiche: 1490,
      features: [
        'Tout le pack Standard +',
        'Configuration Meta Conversion API (CAPI)',
        'Configuration Google Ads Enhanced Conversions',
        'Migration jusqu\'a 25 tags',
        'Consent Mode V2 avance',
        'Dashboard monitoring temps reel',
        'Maintenance mensuelle : 129 EUR/mois',
      ],
      timeline_semaines: 2,
      label: 'Le plus choisi',
      is_recommended: true,
    },
    gold: {
      nom: 'Enterprise',
      prix_min: 2490,
      prix_max: 2490,
      prix_affiche: 2490,
      features: [
        'Tout le pack Avance +',
        'Configuration TikTok Events API',
        'Configuration LinkedIn Conversion API',
        'Data enrichment server-side',
        'A/B testing server-side',
        'Infrastructure haute disponibilite (multi-region)',
        'Formation equipe analytics 4h',
        'Audit performance + optimisation trimestriel',
        'Maintenance mensuelle : 189 EUR/mois',
      ],
      timeline_semaines: 3,
      label: 'Enterprise',
      is_recommended: false,
    },
  },
}

// ============================================================
// ANALYSE DU SCOPE VIA CLAUDE API
// ============================================================

const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

async function analyzeScope(input: DealmakerInput): Promise<ScopeAnalysis> {
  const besoins = input.rdv_decouverte.besoins_identifies.join(', ')
  const template = SERVICE_TEMPLATES[input.rdv_decouverte.besoins_identifies[0]] || SERVICE_TEMPLATES['site_vitrine']

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Tu es expert en devis pour agences de developpement web. Analyse ces notes de RDV decouverte et genere un scope personnalise pour un devis.

PROSPECT :
- Entreprise : ${input.entreprise.nom} (${input.entreprise.secteur}, ${input.entreprise.taille} salaries)
- Contact : ${input.prospect.prenom} ${input.prospect.nom} (${input.prospect.poste})
- Budget mentionne : ${input.rdv_decouverte.budget_mentionne ? input.rdv_decouverte.budget_mentionne + ' EUR' : 'Non precise'}
- Timeline : ${input.rdv_decouverte.timeline_souhaitee || 'Non precisee'}

NOTES DE RDV (Jonathan) :
${input.rdv_decouverte.notes_jonathan}

BESOINS IDENTIFIES :
${besoins}

OBJECTIONS DETECTEES :
${input.rdv_decouverte.objections_detectees?.join(', ') || 'Aucune'}

SERVICES AXIOM DISPONIBLES :
- Site vitrine : 1 500-15 000 EUR
- E-commerce Shopify : 5 000-15 000 EUR
- App Flutter : 15 000-80 000 EUR
- App metier : 25 000-80 000 EUR
- RGAA collectivites : 8 000-50 000 EUR
- Tracking server-side : 990 EUR + 89 EUR/mois

INSTRUCTIONS :
Genere un JSON strict avec :
1. Le type de projet principal
2. Une description du scope personnalisee (2-3 phrases reformulant le besoin du prospect)
3. Les livrables concrets pour chaque tier (Bronze/Silver/Gold)
4. Les features specifiques adaptees au secteur du prospect
5. Les timelines estimees par tier
6. Les add-ons pertinents
7. Les notes specifiques au contexte du prospect

Reponds UNIQUEMENT en JSON valide, pas de markdown.

FORMAT :
{
  "type_projet": "site_vitrine | ecommerce_shopify | app_flutter | app_metier | rgaa | tracking_server_side",
  "description_scope": "Description personnalisee...",
  "livrables": ["livrable 1", "livrable 2"],
  "features_bronze": ["feature specifique 1", "feature specifique 2"],
  "features_silver": ["feature specifique 1", "feature specifique 2"],
  "features_gold": ["feature specifique 1", "feature specifique 2"],
  "timeline_estimee": {
    "bronze_semaines": 4,
    "silver_semaines": 6,
    "gold_semaines": 10
  },
  "add_ons_suggeres": ["Maintenance mensuelle", "Formation", "SEO"],
  "notes_specifiques": "Points specifiques au prospect..."
}`
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return JSON.parse(text) as ScopeAnalysis
}

// ============================================================
// DETERMINATION DU TIER RECOMMANDE
// ============================================================

function calculateRecommendedTier(input: DealmakerInput, scope: ScopeAnalysis): 'bronze' | 'silver' | 'gold' {
  const template = SERVICE_TEMPLATES[scope.type_projet]
  if (!template) return 'silver' // Defaut : tier milieu

  const budget = input.rdv_decouverte.budget_mentionne
  const taille = input.entreprise.taille
  const ca = input.entreprise.ca_estime
  const score = input.scoring.score_total
  const urgence = input.rdv_decouverte.urgence_percue

  // --- Logique de recommandation ---

  // Si budget mentionne, aligner le tier
  if (budget) {
    if (budget <= template.bronze.prix_affiche * 1.2) return 'bronze'
    if (budget <= template.silver.prix_affiche * 1.2) return 'silver'
    return 'gold'
  }

  // Sans budget mentionne : scoring multi-criteres
  let tierScore = 0

  // Taille entreprise (0-30 points)
  if (taille > 200) tierScore += 30
  else if (taille > 50) tierScore += 20
  else if (taille > 10) tierScore += 10

  // CA estime (0-30 points)
  if (ca > 10000000) tierScore += 30
  else if (ca > 2000000) tierScore += 20
  else if (ca > 500000) tierScore += 10

  // Score prospect (0-20 points)
  if (score >= 80) tierScore += 20
  else if (score >= 60) tierScore += 10

  // Urgence (0-20 points)
  if (urgence === 'haute') tierScore += 20
  else if (urgence === 'moyenne') tierScore += 10

  // Decision
  if (tierScore >= 60) return 'gold'
  if (tierScore >= 30) return 'silver'
  return 'bronze'

  // NOTE : Le DECOY EFFECT fait que 60-70% des prospects choisissent Silver
  // meme quand Gold est recommande. Silver est toujours le tier par defaut.
}

// ============================================================
// GENERATION DU PDF VIA PUPPETEER
// ============================================================

// Template HTML Handlebars pour le devis
const DEVIS_HTML_TEMPLATE = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 25mm 20mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', 'Helvetica Neue', sans-serif; color: #1a1a2e; line-height: 1.6; }

    /* COUVERTURE */
    .cover { page-break-after: always; display: flex; flex-direction: column; justify-content: center; min-height: 100vh; padding: 60px; }
    .cover .logo { width: 180px; margin-bottom: 40px; }
    .cover h1 { font-size: 32px; color: #0f0f23; margin-bottom: 12px; }
    .cover .subtitle { font-size: 18px; color: #6c6c8a; }
    .cover .meta { margin-top: 40px; font-size: 14px; color: #9090a7; }

    /* SECTIONS */
    .section { margin-bottom: 32px; }
    .section h2 { font-size: 22px; color: #0f0f23; border-bottom: 2px solid #e8e8f0; padding-bottom: 8px; margin-bottom: 16px; }
    .section p { font-size: 14px; margin-bottom: 12px; }

    /* TIERING */
    .tiers { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin: 24px 0; }
    .tier-card { border: 2px solid #e8e8f0; border-radius: 12px; padding: 24px; position: relative; }
    .tier-card.recommended { border-color: #4f46e5; background: #f8f7ff; }
    .tier-card.recommended::before {
      content: '{{recommended_label}}';
      position: absolute; top: -12px; left: 50%; transform: translateX(-50%);
      background: #4f46e5; color: white; padding: 4px 16px; border-radius: 20px;
      font-size: 12px; font-weight: 600;
    }
    .tier-card h3 { font-size: 18px; margin-bottom: 8px; }
    .tier-card .price { font-size: 28px; font-weight: 700; color: #4f46e5; margin-bottom: 16px; }
    .tier-card .price span { font-size: 14px; font-weight: 400; color: #6c6c8a; }
    .tier-card ul { list-style: none; padding: 0; }
    .tier-card ul li { padding: 6px 0; font-size: 13px; border-bottom: 1px solid #f0f0f5; }
    .tier-card ul li::before { content: '\\2713'; color: #22c55e; margin-right: 8px; font-weight: bold; }

    /* TIMELINE */
    .timeline-bar { display: flex; align-items: center; gap: 8px; margin: 16px 0; }
    .timeline-step { flex: 1; text-align: center; padding: 12px; background: #f4f4f8; border-radius: 8px; }
    .timeline-step.active { background: #4f46e5; color: white; }

    /* ADD-ONS */
    .addon-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .addon-item { padding: 16px; border: 1px solid #e8e8f0; border-radius: 8px; }
    .addon-item .addon-price { color: #4f46e5; font-weight: 600; }

    /* CONDITIONS */
    .conditions { background: #f8f8fc; padding: 24px; border-radius: 12px; margin: 24px 0; }
    .conditions h3 { margin-bottom: 12px; }
    .conditions table { width: 100%; border-collapse: collapse; }
    .conditions table td { padding: 8px 12px; border-bottom: 1px solid #e8e8f0; font-size: 13px; }
    .conditions table td:last-child { text-align: right; font-weight: 600; }

    /* FOOTER */
    .footer { margin-top: 48px; padding-top: 24px; border-top: 2px solid #e8e8f0; font-size: 12px; color: #9090a7; text-align: center; }
    .footer .validite { font-size: 14px; color: #ef4444; font-weight: 600; }
  </style>
</head>
<body>

  <!-- PAGE 1 : COUVERTURE -->
  <div class="cover">
    <img src="data:image/svg+xml;base64,..." class="logo" alt="Axiom Marketing">
    <h1>Proposition commerciale</h1>
    <div class="subtitle">{{type_projet_display}} pour {{entreprise_nom}}</div>
    <div class="meta">
      <p>Prepare pour : {{prospect_prenom}} {{prospect_nom}} ({{prospect_poste}})</p>
      <p>Date : {{date_devis}}</p>
      <p>Reference : {{devis_reference}}</p>
      <p>Validite : {{validite_jours}} jours</p>
    </div>
  </div>

  <!-- PAGE 2 : CONTEXTE + SCOPE -->
  <div class="section">
    <h2>1. Votre besoin</h2>
    <p>{{scope_personnalise}}</p>
  </div>

  <div class="section">
    <h2>2. Livrables</h2>
    <ul>
      {{#each livrables}}
      <li>{{this}}</li>
      {{/each}}
    </ul>
  </div>

  <!-- TIERING -->
  <div class="section">
    <h2>3. Nos offres</h2>
    <div class="tiers">
      <div class="tier-card {{#if bronze_recommended}}recommended{{/if}}">
        <h3>{{bronze_nom}}</h3>
        <div class="price">{{bronze_prix}} EUR <span>HT</span></div>
        <ul>
          {{#each bronze_features}}
          <li>{{this}}</li>
          {{/each}}
        </ul>
        <p style="margin-top:12px;font-size:12px;color:#6c6c8a;">Livraison : {{bronze_timeline}} semaines</p>
      </div>
      <div class="tier-card {{#if silver_recommended}}recommended{{/if}}">
        <h3>{{silver_nom}}</h3>
        <div class="price">{{silver_prix}} EUR <span>HT</span></div>
        <ul>
          {{#each silver_features}}
          <li>{{this}}</li>
          {{/each}}
        </ul>
        <p style="margin-top:12px;font-size:12px;color:#6c6c8a;">Livraison : {{silver_timeline}} semaines</p>
      </div>
      <div class="tier-card {{#if gold_recommended}}recommended{{/if}}">
        <h3>{{gold_nom}}</h3>
        <div class="price">{{gold_prix}} EUR <span>HT</span></div>
        <ul>
          {{#each gold_features}}
          <li>{{this}}</li>
          {{/each}}
        </ul>
        <p style="margin-top:12px;font-size:12px;color:#6c6c8a;">Livraison : {{gold_timeline}} semaines</p>
      </div>
    </div>
  </div>

  <!-- ADD-ONS -->
  <div class="section">
    <h2>4. Options complementaires</h2>
    <div class="addon-grid">
      {{#each add_ons}}
      <div class="addon-item">
        <strong>{{this.nom}}</strong>
        <p style="font-size:13px;color:#6c6c8a;">{{this.description}}</p>
        <div class="addon-price">{{this.prix}}</div>
      </div>
      {{/each}}
    </div>
  </div>

  <!-- CONDITIONS DE PAIEMENT -->
  <div class="section">
    <h2>5. Conditions de paiement</h2>
    <div class="conditions">
      <table>
        <tr><td>Acompte a la signature</td><td>{{paiement_acompte_pct}}% ({{paiement_acompte_montant}} EUR HT)</td></tr>
        {{#if paiement_intermediaire}}
        <tr><td>Etape intermediaire (validation maquettes)</td><td>{{paiement_intermediaire_pct}}% ({{paiement_intermediaire_montant}} EUR HT)</td></tr>
        {{/if}}
        <tr><td>Solde a la livraison</td><td>{{paiement_solde_pct}}% ({{paiement_solde_montant}} EUR HT)</td></tr>
      </table>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <p class="validite">Ce devis est valable {{validite_jours}} jours (jusqu'au {{date_expiration}}).</p>
    <p>Axiom Marketing -- UNIVILE SAS | SIRET : XXXXXXXXX | TVA : FRXXXXXXXXX</p>
    <p>jonathan@axiom-marketing.fr | +33 6 XX XX XX XX | axiom-marketing.fr</p>
  </div>

</body>
</html>
`

// Helpers Handlebars
Handlebars.registerHelper('formatNumber', (num: number) => {
  return new Intl.NumberFormat('fr-FR').format(num)
})

// ============================================================
// CLASSE PRINCIPALE : GENERATEUR DE DEVIS
// ============================================================

class SubAgent8a_GenerateurDevis {
  private browser: Browser | null = null

  async process(input: DealmakerInput, deal: any): Promise<DevisGenere> {
    const startTime = Date.now()

    try {
      // 1. Analyser le scope via Claude API (2-3 sec)
      const scope = await analyzeScope(input)

      // 2. Determiner le tier recommande
      const tierRecommande = calculateRecommendedTier(input, scope)

      // 3. Recuperer le template de service
      const serviceTemplate = SERVICE_TEMPLATES[scope.type_projet] || SERVICE_TEMPLATES['site_vitrine']

      // 4. Calculer les conditions de paiement
      const paiement = this.calculatePaymentTerms(serviceTemplate[tierRecommande].prix_affiche)

      // 5. Preparer les add-ons
      const addOns = this.generateAddOns(scope)

      // 6. Compiler le template HTML avec les variables
      const compiledTemplate = Handlebars.compile(DEVIS_HTML_TEMPLATE)
      const devisId = `DEV-${new Date().getFullYear()}-${uuidv4().slice(0, 8).toUpperCase()}`
      const dateDevis = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
      const dateExpiration = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })

      const html = compiledTemplate({
        // Couverture
        type_projet_display: serviceTemplate.display_name,
        entreprise_nom: input.entreprise.nom,
        prospect_prenom: input.prospect.prenom,
        prospect_nom: input.prospect.nom,
        prospect_poste: input.prospect.poste,
        date_devis: dateDevis,
        devis_reference: devisId,
        validite_jours: 30,
        date_expiration: dateExpiration,

        // Scope
        scope_personnalise: scope.description_scope,
        livrables: scope.livrables,

        // Tiers
        bronze_nom: serviceTemplate.bronze.nom,
        bronze_prix: new Intl.NumberFormat('fr-FR').format(serviceTemplate.bronze.prix_affiche),
        bronze_features: [...serviceTemplate.bronze.features, ...scope.features_bronze],
        bronze_timeline: serviceTemplate.bronze.timeline_semaines,
        bronze_recommended: tierRecommande === 'bronze',

        silver_nom: serviceTemplate.silver.nom,
        silver_prix: new Intl.NumberFormat('fr-FR').format(serviceTemplate.silver.prix_affiche),
        silver_features: [...serviceTemplate.silver.features, ...scope.features_silver],
        silver_timeline: serviceTemplate.silver.timeline_semaines,
        silver_recommended: tierRecommande === 'silver',

        gold_nom: serviceTemplate.gold.nom,
        gold_prix: new Intl.NumberFormat('fr-FR').format(serviceTemplate.gold.prix_affiche),
        gold_features: [...serviceTemplate.gold.features, ...scope.features_gold],
        gold_timeline: serviceTemplate.gold.timeline_semaines,
        gold_recommended: tierRecommande === 'gold',

        recommended_label: serviceTemplate[tierRecommande].label,

        // Add-ons
        add_ons: addOns,

        // Paiement
        ...paiement,
      })

      // 7. Generer le PDF via Puppeteer (5-8 sec)
      const pdfBuffer = await this.generatePDF(html)

      // 8. Sauvegarder le PDF et obtenir l'URL
      const trackingId = uuidv4()
      const pdfUrl = await this.savePDF(pdfBuffer, devisId, trackingId)

      // 9. Envoyer le devis par email
      await this.sendDevisEmail(input, devisId, pdfUrl, pdfBuffer, trackingId, scope)

      // 10. Mettre a jour le deal en BDD
      const devisResult: DevisGenere = {
        devis_id: devisId,
        deal_id: input.deal_id,
        prospect_id: input.prospect_id,
        pdf_buffer: pdfBuffer,
        pdf_url: pdfUrl,
        tier_recommande: tierRecommande,
        montant_bronze: serviceTemplate.bronze.prix_affiche,
        montant_silver: serviceTemplate.silver.prix_affiche,
        montant_gold: serviceTemplate.gold.prix_affiche,
        scope_personnalise: scope.description_scope,
        validite_jours: 30,
        tracking_id: trackingId,
        created_at: new Date().toISOString(),
      }

      await db.deals.update({
        deal_id: input.deal_id,
        stage: 'DEVIS_CREE',
        devis_id: devisId,
        devis_url: pdfUrl,
        montant_estime: serviceTemplate[tierRecommande].prix_affiche,
        tier_recommande: tierRecommande,
        devis_envoye_at: new Date(),
        tracking_id: trackingId,
      })

      // 11. Notifier Jonathan sur Slack
      const generationTimeMs = Date.now() - startTime
      await this.notifyJonathan(input, devisResult, scope, generationTimeMs)

      // 12. Planifier la premiere relance (J+3)
      await this.scheduleFirstFollowUp(input, devisResult)

      return devisResult

    } catch (error: any) {
      console.error(`[Agent8a] Erreur generation devis pour deal ${input.deal_id}:`, error)
      await slack.send('#deals-errors', {
        text: `Erreur generation devis : ${input.entreprise.nom} - ${error.message}`
      })
      throw error
    }
  }

  private calculatePaymentTerms(montant: number): Record<string, any> {
    // Projets < 10 000 EUR : 50/50
    if (montant < 10000) {
      return {
        paiement_acompte_pct: 50,
        paiement_acompte_montant: new Intl.NumberFormat('fr-FR').format(Math.round(montant * 0.5)),
        paiement_intermediaire: false,
        paiement_solde_pct: 50,
        paiement_solde_montant: new Intl.NumberFormat('fr-FR').format(Math.round(montant * 0.5)),
      }
    }

    // Projets >= 10 000 EUR : 30/40/30
    return {
      paiement_acompte_pct: 30,
      paiement_acompte_montant: new Intl.NumberFormat('fr-FR').format(Math.round(montant * 0.3)),
      paiement_intermediaire: true,
      paiement_intermediaire_pct: 40,
      paiement_intermediaire_montant: new Intl.NumberFormat('fr-FR').format(Math.round(montant * 0.4)),
      paiement_solde_pct: 30,
      paiement_solde_montant: new Intl.NumberFormat('fr-FR').format(Math.round(montant * 0.3)),
    }
  }

  private generateAddOns(scope: ScopeAnalysis): Array<{ nom: string; description: string; prix: string }> {
    const addOns: Array<{ nom: string; description: string; prix: string }> = []

    // Maintenance mensuelle
    addOns.push({
      nom: 'Maintenance mensuelle',
      description: 'Mises a jour, sauvegardes, monitoring, corrections bugs',
      prix: 'A partir de 89 EUR/mois',
    })

    // Formation
    addOns.push({
      nom: 'Formation supplementaire',
      description: 'Sessions de formation equipe (back-office, analytics, SEO)',
      prix: '150 EUR/heure',
    })

    // Support prioritaire
    if (scope.type_projet !== 'tracking_server_side') {
      addOns.push({
        nom: 'Support prioritaire',
        description: 'Temps de reponse garanti < 4h, canal Slack dedie',
        prix: '299 EUR/mois',
      })
    }

    // Add-ons specifiques au projet
    for (const addon of scope.add_ons_suggeres) {
      if (addon.toLowerCase().includes('seo')) {
        addOns.push({
          nom: 'Accompagnement SEO',
          description: 'Audit SEO mensuel, reporting, recommandations',
          prix: '490 EUR/mois',
        })
      }
      if (addon.toLowerCase().includes('migration')) {
        addOns.push({
          nom: 'Migration de donnees',
          description: 'Migration des contenus/produits depuis l\'ancien site',
          prix: 'Sur devis (selon volume)',
        })
      }
    }

    return addOns
  }

  private async generatePDF(html: string): Promise<Buffer> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      })
    }

    const page = await this.browser.newPage()
    try {
      await page.setContent(html, { waitUntil: 'networkidle0' })
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '25mm', right: '20mm', bottom: '25mm', left: '20mm' },
        displayHeaderFooter: false,
      })
      return Buffer.from(pdfBuffer)
    } finally {
      await page.close()
    }
  }

  private async savePDF(buffer: Buffer, devisId: string, trackingId: string): Promise<string> {
    // Sauvegarder sur S3/Minio ou filesystem local
    const filename = `devis/${devisId}.pdf`
    const url = await storageService.upload(filename, buffer, 'application/pdf')

    // Creer un lien de tracking (proxy qui log les ouvertures)
    const trackingUrl = `${process.env.AXIOM_API_URL}/devis/view/${trackingId}`
    await db.devis_tracking.create({
      tracking_id: trackingId,
      devis_id: devisId,
      pdf_url: url,
      created_at: new Date(),
      opens: 0,
      last_opened_at: null,
    })

    return trackingUrl
  }

  private async sendDevisEmail(
    input: DealmakerInput,
    devisId: string,
    pdfUrl: string,
    pdfBuffer: Buffer,
    trackingId: string,
    scope: ScopeAnalysis
  ): Promise<void> {
    const tierRecommande = calculateRecommendedTier(input, scope)
    const template = SERVICE_TEMPLATES[scope.type_projet]

    const subject = `Proposition Axiom - ${template.display_name} pour ${input.entreprise.nom}`
    const body = `Bonjour ${input.prospect.prenom},

Suite a notre echange du ${new Date(input.rdv_decouverte.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}, je vous transmets notre proposition pour votre projet de ${template.display_name.toLowerCase()}.

${scope.description_scope}

Vous trouverez dans le document ci-joint trois formules adaptees a vos besoins. Je recommande la formule "${template[tierRecommande].nom}" qui correspond le mieux a ce que nous avons evoque ensemble.

Le devis est accessible ici : ${pdfUrl}

Je reste disponible pour echanger sur le contenu de la proposition ou l'adapter si necessaire.

A tres bientot,

Jonathan Dewaele
Axiom Marketing
jonathan@axiom-marketing.fr
+33 6 XX XX XX XX`

    await emailService.send({
      from: 'Jonathan Dewaele <jonathan@axiom-marketing.fr>',
      to: `${input.prospect.prenom} ${input.prospect.nom} <${input.prospect.email}>`,
      subject,
      text: body,
      attachments: [{
        filename: `Devis_Axiom_${input.entreprise.nom.replace(/\s+/g, '_')}_${devisId}.pdf`,
        content: pdfBuffer,
      }],
      headers: {
        'X-Axiom-Devis-ID': devisId,
        'X-Axiom-Deal-ID': input.deal_id,
        'X-Axiom-Tracking-ID': trackingId,
      }
    })
  }

  private async notifyJonathan(
    input: DealmakerInput,
    devis: DevisGenere,
    scope: ScopeAnalysis,
    generationTimeMs: number
  ): Promise<void> {
    await slack.send('#deals', {
      text: `Devis genere et envoye`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `Devis envoye : ${input.entreprise.nom}` }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Prospect :* ${input.prospect.prenom} ${input.prospect.nom}` },
            { type: 'mrkdwn', text: `*Poste :* ${input.prospect.poste}` },
            { type: 'mrkdwn', text: `*Type :* ${scope.type_projet}` },
            { type: 'mrkdwn', text: `*Tier recommande :* ${devis.tier_recommande.toUpperCase()}` },
            { type: 'mrkdwn', text: `*Montant :* ${new Intl.NumberFormat('fr-FR').format(SERVICE_TEMPLATES[scope.type_projet][devis.tier_recommande].prix_affiche)} EUR HT` },
            { type: 'mrkdwn', text: `*Genere en :* ${(generationTimeMs / 1000).toFixed(1)}s` },
          ]
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Voir le devis' },
              url: devis.pdf_url,
              action_id: 'view_devis',
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Modifier le devis' },
              action_id: 'edit_devis',
              value: devis.devis_id,
            }
          ]
        }
      ]
    })
  }

  private async scheduleFirstFollowUp(input: DealmakerInput, devis: DevisGenere): Promise<void> {
    // Planifier la premiere relance a J+3
    await dealmakerQueue.add(
      `followup-${input.deal_id}`,
      {
        type: 'FOLLOW_UP',
        deal_id: input.deal_id,
        prospect_id: input.prospect_id,
        devis_id: devis.devis_id,
        step: 1,
        tracking_id: devis.tracking_id,
      },
      {
        delay: 3 * 24 * 60 * 60 * 1000, // 3 jours
        priority: 3,
      }
    )
  }
}
```

## 3a.5 Tracking d'ouverture du devis

```typescript
// Endpoint de tracking des ouvertures de devis
// Route : GET /devis/view/:trackingId
async function handleDevisView(trackingId: string, req: Request, res: Response): Promise<void> {
  const tracking = await db.devis_tracking.findByTrackingId(trackingId)
  if (!tracking) {
    res.status(404).send('Devis non trouve')
    return
  }

  // Logger l'ouverture
  const openData = {
    tracking_id: trackingId,
    opened_at: new Date(),
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    referer: req.headers['referer'] || null,
  }

  await db.devis_opens.create(openData)

  // Incrementer le compteur
  const newCount = tracking.opens + 1
  await db.devis_tracking.update({
    tracking_id: trackingId,
    opens: newCount,
    last_opened_at: new Date(),
  })

  // Signaux d'achat basee sur les ouvertures
  if (newCount === 1) {
    // Premiere ouverture : signal faible (+1 point)
    await updateEngagementScore(tracking.devis_id, 'devis_ouvert', 1)
  } else if (newCount >= 3) {
    // 3+ ouvertures : signal fort (+20 points) -- probable partage interne
    await updateEngagementScore(tracking.devis_id, 'devis_multi_ouvert', 20)

    // Alerter Jonathan
    const deal = await db.deals.findByDevisId(tracking.devis_id)
    await slack.send('#deals', {
      text: `Signal d'achat fort : le devis pour ${deal.entreprise_nom} a ete ouvert ${newCount} fois. Probable partage interne.`,
    })
  }

  // Rediriger vers le PDF reel
  res.redirect(tracking.pdf_url)
}
```

## 3a.6 Psychologie du tiering (Decoy Effect)

**Principe applique :**

Le Decoy Effect (effet de leurre) consiste a presenter une option "decoy" (leurre) qui rend l'option cible plus attractive par comparaison.

**Application Axiom :**

| Role | Tier | Objectif |
|------|------|----------|
| **Decoy d'entree** | Bronze | Attirer l'attention, montrer qu'un prix bas existe, mais les features limitees poussent vers Silver |
| **Cible** | Silver | Sweet spot valeur/prix. Badge "Le plus choisi". 60-70% des conversions attendues |
| **Ancrage haut** | Gold | Justifie le prix du Silver par contraste. Donne une perception de "bonne affaire" sur Silver |

**Donnees attendues :**
- Bronze : 10-15% des conversions
- Silver : 60-70% des conversions (cible)
- Gold : 15-25% des conversions

**Tactiques visuelles dans le PDF :**
- Silver toujours au centre (center-stage effect)
- Badge "Le plus choisi" en couleur (#4F46E5)
- Carte Silver sureleve (border plus epaisse, fond colore)
- Prix Gold affiche en premier (ancrage psychologique)

---

**Fin du Sous-Agent 8a -- Generateur de Devis**
