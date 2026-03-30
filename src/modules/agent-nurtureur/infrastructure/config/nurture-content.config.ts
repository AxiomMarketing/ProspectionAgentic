export interface NurtureContent {
  id: string;
  segments: string[]; // pme_metro, ecommerce, collectivite, startup, agence_wl
  journeyStage: 'awareness' | 'consideration' | 'decision';
  contentType: 'valeur' | 'promo';
  title: string;
  summary: string;
  url?: string;
  tags: string[];
}

export const NURTURE_CONTENT_POOL: NurtureContent[] = [
  // --- AWARENESS (6 items) ---
  {
    id: 'aw-001',
    segments: ['pme_metro', 'ecommerce', 'startup', 'agence_wl'],
    journeyStage: 'awareness',
    contentType: 'valeur',
    title: '5 tendances web 2026 pour les PME',
    summary:
      'Découvrez les cinq évolutions majeures du web qui vont transformer la relation client pour les PME en 2026 : IA conversationnelle, Core Web Vitals, personnalisation comportementale, accessibilité obligatoire et mobile-first indexing.',
    url: 'https://axiom-marketing.fr/blog/tendances-web-2026-pme',
    tags: ['tendances', 'web', 'pme', '2026'],
  },
  {
    id: 'aw-002',
    segments: ['pme_metro', 'collectivite', 'startup'],
    journeyStage: 'awareness',
    contentType: 'valeur',
    title: 'Guide : pourquoi votre site perd des clients sans que vous le sachiez',
    summary:
      "Un site trop lent, une navigation confuse ou une absence de preuve sociale peuvent faire fuir vos visiteurs en quelques secondes. Ce guide identifie les 7 signaux d'alerte les plus courants et explique comment les détecter gratuitement.",
    url: 'https://axiom-marketing.fr/blog/site-perd-clients',
    tags: ['ux', 'conversion', 'diagnostic', 'site'],
  },
  {
    id: 'aw-003',
    segments: ['ecommerce', 'pme_metro'],
    journeyStage: 'awareness',
    contentType: 'valeur',
    title: "L'impact d'un site lent sur votre chiffre d'affaires",
    summary:
      "Chaque seconde de délai de chargement supplémentaire réduit significativement le taux de conversion. Cette analyse explique le lien entre performance technique et revenus, avec des repères sectoriels concrets.",
    url: 'https://axiom-marketing.fr/blog/impact-vitesse-site-ca',
    tags: ['performance', 'vitesse', 'ecommerce', 'conversion'],
  },
  {
    id: 'aw-004',
    segments: ['collectivite', 'pme_metro'],
    journeyStage: 'awareness',
    contentType: 'valeur',
    title: "Accessibilité numérique : ce que la loi impose dès 2026",
    summary:
      "Le RGAA et la directive européenne EAA rendent l'accessibilité obligatoire pour un nombre croissant d'organisations. Découvrez ce que cela signifie concrètement pour votre présence en ligne et comment vous y préparer sereinement.",
    url: 'https://axiom-marketing.fr/blog/accessibilite-numerique-obligations-2026',
    tags: ['accessibilite', 'rgaa', 'conformite', 'collectivite'],
  },
  {
    id: 'aw-005',
    segments: ['agence_wl', 'startup'],
    journeyStage: 'awareness',
    contentType: 'valeur',
    title: 'SEO en 2026 : les pratiques qui fonctionnent encore (et celles à abandonner)',
    summary:
      "Les algorithmes de Google ont profondément évolué avec l'IA générative. Ce panorama distingue les fondamentaux durables des tactiques obsolètes, pour vous aider à concentrer vos efforts là où ils produisent des résultats.",
    url: 'https://axiom-marketing.fr/blog/seo-2026-bonnes-pratiques',
    tags: ['seo', 'google', 'ia', 'tendances'],
  },
  {
    id: 'aw-006',
    segments: ['startup', 'pme_metro', 'ecommerce'],
    journeyStage: 'awareness',
    contentType: 'valeur',
    title: 'Marketing digital : combien investissent vraiment vos concurrents ?',
    summary:
      "Une étude sectorielle sur les budgets marketing digital des entreprises françaises de 10 à 200 salariés. Des benchmarks par taille, secteur et canal pour vous aider à calibrer votre propre investissement.",
    url: 'https://axiom-marketing.fr/blog/budget-marketing-digital-benchmark',
    tags: ['benchmark', 'budget', 'marche', 'concurrence'],
  },

  // --- CONSIDERATION (6 items) ---
  {
    id: 'co-001',
    segments: ['pme_metro', 'startup'],
    journeyStage: 'consideration',
    contentType: 'valeur',
    title: 'Case study : +40 % de leads pour TechCorp en 3 mois',
    summary:
      'Comment une refonte de l\'architecture de contenu et l\'optimisation des landing pages a permis à TechCorp de tripler son taux de conversion organique. Détail complet de la stratégie, des outils utilisés et des résultats mesurés.',
    url: 'https://axiom-marketing.fr/case-studies/techcorp-leads',
    tags: ['case-study', 'leads', 'conversion', 'pme'],
  },
  {
    id: 'co-002',
    segments: ['pme_metro', 'collectivite', 'agence_wl'],
    journeyStage: 'consideration',
    contentType: 'valeur',
    title: 'Agence vs freelance vs équipe interne : le vrai comparatif 2026',
    summary:
      'Coûts réels, délais, qualité, flexibilité, continuité de service : un comparatif objectif des trois options pour piloter votre marketing digital. Avec une grille d\'aide à la décision adaptable à votre contexte.',
    url: 'https://axiom-marketing.fr/blog/agence-freelance-interne-comparatif',
    tags: ['comparatif', 'agence', 'freelance', 'strategie'],
  },
  {
    id: 'co-003',
    segments: ['ecommerce', 'pme_metro', 'startup'],
    journeyStage: 'consideration',
    contentType: 'valeur',
    title: 'Calculateur ROI marketing digital : estimez votre retour sur investissement',
    summary:
      'Un outil interactif pour estimer le ROI attendu de vos actions marketing selon votre secteur, votre panier moyen et votre taux de conversion actuel. Gratuit, sans inscription.',
    url: 'https://axiom-marketing.fr/outils/calculateur-roi',
    tags: ['roi', 'calculateur', 'outil', 'investissement'],
  },
  {
    id: 'co-004',
    segments: ['collectivite', 'pme_metro'],
    journeyStage: 'consideration',
    contentType: 'valeur',
    title: 'Refonte de site : les 12 questions à poser avant de signer',
    summary:
      'Périmètre, maintenance, propriété du code, hébergement, SEO existant, accessibilité… Ce guide de questions vous permet d\'évaluer sereinement n\'importe quelle proposition d\'agence avant de vous engager.',
    url: 'https://axiom-marketing.fr/blog/questions-avant-refonte-site',
    tags: ['refonte', 'site', 'questions', 'contrat'],
  },
  {
    id: 'co-005',
    segments: ['startup', 'agence_wl'],
    journeyStage: 'consideration',
    contentType: 'valeur',
    title: 'Automatisation marketing : par où commencer sans se perdre',
    summary:
      'Email, CRM, scoring, nurture, social… L\'automatisation peut tout toucher. Ce guide pragmatique propose un ordre de déploiement adapté aux ressources des startups et des agences, avec des outils concrets à chaque étape.',
    url: 'https://axiom-marketing.fr/blog/automatisation-marketing-par-ou-commencer',
    tags: ['automatisation', 'crm', 'email', 'startup'],
  },
  {
    id: 'co-006',
    segments: ['ecommerce', 'pme_metro'],
    journeyStage: 'consideration',
    contentType: 'valeur',
    title: 'Audit gratuit : identifiez les 5 freins qui bloquent votre croissance',
    summary:
      'Une checklist de diagnostic en 5 dimensions (technique, contenu, acquisition, conversion, fidélisation) pour localiser rapidement où votre marketing sous-performe et prioriser vos actions.',
    url: 'https://axiom-marketing.fr/outils/audit-croissance',
    tags: ['audit', 'diagnostic', 'checklist', 'croissance'],
  },

  // --- DECISION (5 items) ---
  {
    id: 'de-001',
    segments: ['pme_metro', 'ecommerce', 'startup', 'collectivite', 'agence_wl'],
    journeyStage: 'decision',
    contentType: 'promo',
    title: 'Demandez une démonstration personnalisée',
    summary:
      'Voyez concrètement comment Axiom Marketing peut travailler sur votre secteur spécifique. Démonstration de 30 minutes, sans engagement, adaptée à votre situation actuelle.',
    url: 'https://axiom-marketing.fr/demo',
    tags: ['demo', 'rdv', 'personnalise', 'cta'],
  },
  {
    id: 'de-002',
    segments: ['pme_metro', 'ecommerce', 'startup', 'collectivite', 'agence_wl'],
    journeyStage: 'decision',
    contentType: 'promo',
    title: 'Nos formules et tarifs 2026',
    summary:
      'Découvrez nos offres Essentiel, Croissance et Performance : ce qui est inclus, les engagements, et les options à la carte. Comparez et choisissez la formule adaptée à votre ambition.',
    url: 'https://axiom-marketing.fr/tarifs',
    tags: ['tarifs', 'pricing', 'formules', 'offres'],
  },
  {
    id: 'de-003',
    segments: ['pme_metro', 'startup', 'ecommerce'],
    journeyStage: 'decision',
    contentType: 'valeur',
    title: "Témoignage : comment nous avons transformé la visibilité d'une PME industrielle",
    summary:
      "Récit complet d'un projet de 6 mois : diagnostic initial, stratégie déployée, obstacles rencontrés et résultats obtenus. Un retour d'expérience honnête pour vous aider à vous projeter.",
    url: 'https://axiom-marketing.fr/temoignages/pme-industrielle',
    tags: ['temoignage', 'client', 'resultat', 'pme'],
  },
  {
    id: 'de-004',
    segments: ['startup', 'agence_wl'],
    journeyStage: 'decision',
    contentType: 'promo',
    title: 'Essai gratuit 14 jours — sans carte bancaire',
    summary:
      "Accédez à l'ensemble de nos outils et à une heure de conseil stratégique offerte. Aucune obligation, aucune carte requise. Résiliable en un clic.",
    url: 'https://axiom-marketing.fr/essai-gratuit',
    tags: ['essai', 'gratuit', 'trial', 'cta'],
  },
  {
    id: 'de-005',
    segments: ['collectivite', 'agence_wl'],
    journeyStage: 'decision',
    contentType: 'valeur',
    title: 'Références secteur public et collectivités territoriales',
    summary:
      "Découvrez nos réalisations pour des collectivités, EPCI et établissements publics : refonte de portails citoyens, stratégie de communication locale, accessibilité RGAA. Des projets similaires au vôtre.",
    url: 'https://axiom-marketing.fr/references/secteur-public',
    tags: ['collectivite', 'references', 'public', 'rgaa'],
  },
];
