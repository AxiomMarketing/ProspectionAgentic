# Brainstorm : Toutes les sources de détection d'entreprises B2B en France

**Date :** 26 mars 2026
**Objectif :** Inventaire exhaustif des sources pour alimenter le système de prospection automatique Axiom Marketing

---

## INVENTAIRE COMPLET — 20 Sources identifiées

### CATÉGORIE 1 : Données publiques gratuites (Open Data)

#### 1. API SIRENE (INSEE)
| Attribut | Valeur |
|----------|--------|
| **URL** | `portail-api.insee.fr` / `api.gouv.fr/les-api/sirene_v3` |
| **Accès** | API REST, token gratuit |
| **Coût** | **Gratuit** |
| **Volume** | **25 millions d'entreprises + 36 millions d'établissements** |
| **Données** | SIREN, SIRET, raison sociale, NAF/APE, adresse, effectif (tranche), date création, forme juridique |
| **Filtrage** | Par code NAF, département, taille, date création |
| **Signaux détectables** | Nouvelle création d'entreprise (date < 6 mois), changement d'activité |
| **Déjà implémenté** | ✅ Oui (adapter INSEE) |

**Usage pour Axiom :** Filtrer par code NAF (agences web 6201Z, e-commerce 4791B, etc.) + département (974 La Réunion, 75 Paris) → liste de base pour le scan 1c.

---

#### 2. Annuaire des Entreprises (DINUM)
| Attribut | Valeur |
|----------|--------|
| **URL** | `annuaire-entreprises.data.gouv.fr` / `recherche-entreprises.api.gouv.fr` |
| **Accès** | API REST, aucune authentification |
| **Coût** | **Gratuit** |
| **Volume** | Même base que SIRENE + données INPI + RNA |
| **Données** | Agrégation SIRENE + dirigeants + conventions collectives |
| **Filtrage** | Full-text search, département, activité, effectif, date création |
| **Rate limit** | 7 req/seconde |

**Usage pour Axiom :** Recherche full-text ("agence web", "développeur", "e-commerce") + filtrage géographique.

---

#### 3. BODACC (Annonces légales)
| Attribut | Valeur |
|----------|--------|
| **URL** | `bodacc-datadila.opendatasoft.com` |
| **Accès** | API REST, aucune authentification |
| **Coût** | **Gratuit** |
| **Données** | Créations, modifications, procédures collectives, cessions, radiations |
| **Signaux détectables** | **Création d'entreprise** (nouveau prospect potentiel), changement de dirigeant, cession (nouveau propriétaire = opportunité) |
| **Déjà implémenté** | ✅ Oui (adapter BODACC dans enrichisseur) |

**Usage pour Axiom :** Alertes sur créations d'entreprise dans les secteurs cibles → prospect très chaud (besoin de site web).

---

#### 4. BOAMP (Marchés publics)
| Attribut | Valeur |
|----------|--------|
| **URL** | `boamp-datadila.opendatasoft.com` |
| **Accès** | API REST, aucune authentification |
| **Coût** | **Gratuit** |
| **Signaux** | Appels d'offres IT/web/digital |
| **Déjà implémenté** | ✅ Oui (adapter BOAMP dans veilleur) |

---

#### 5. DECP (Marchés attribués — veille concurrentielle)
| Attribut | Valeur |
|----------|--------|
| **URL** | `data.economie.gouv.fr/explore/dataset/decp-v3-marches-valides/api/` |
| **Accès** | API REST, gratuit |
| **Coût** | **Gratuit** |
| **Données** | Marchés attribués : titulaire, SIRET, montant, CPV |
| **Signaux** | Identifier les concurrents qui gagnent des AO + les acheteurs récurrents |

**Usage pour Axiom :** Savoir qui remporte les marchés IT → benchmark concurrentiel.

---

#### 6. INPI / RNE (Dirigeants, comptes)
| Attribut | Valeur |
|----------|--------|
| **URL** | `data.inpi.fr` |
| **Accès** | API REST, compte gratuit |
| **Coût** | **Gratuit** |
| **Données** | Dirigeants, bénéficiaires effectifs, comptes annuels, statuts |
| **Déjà implémenté** | ✅ Oui (adapter INPI dans enrichisseur) |

---

### CATÉGORIE 2 : Annuaires et moteurs de recherche

#### 7. Google Maps / Google Places
| Attribut | Valeur |
|----------|--------|
| **Accès** | API officielle ($17/1000 req) ou scraping (Apify, Outscraper, Scrap.io) |
| **Coût** | Outscraper: ~$3/1000 résultats | Apify: $39/mois | API officielle: cher |
| **Volume** | **200+ millions d'entreprises mondiales** |
| **Données** | Nom, adresse, téléphone, site web, horaires, avis, note, catégorie, photos |
| **Signaux** | Avis négatifs (besoin d'amélioration web), pas de site web (opportunité), site lent (détecté après) |
| **Filtrage** | Par catégorie ("agence immobilière", "restaurant"), zone géographique, note |

**Usage pour Axiom :** Scraper toutes les entreprises d'une zone (La Réunion, Paris) par catégorie → extraire celles qui n'ont pas de site web OU qui ont un site obsolète → prospect chaud.

**Recommandation :** Outscraper (pay-as-you-go) pour le meilleur rapport qualité/prix.

---

#### 8. Pages Jaunes (PagesJaunes.fr)
| Attribut | Valeur |
|----------|--------|
| **Accès** | API officielle (developer.pagesjaunes.fr) + scrapers (Apify, Piloterr) |
| **Coût** | Scraper Apify: inclus dans abonnement | Piloterr: freemium |
| **Volume** | **4,5 millions d'entreprises françaises** |
| **Données** | Nom, adresse, téléphone, site web, SIRET, catégorie, horaires, avis |
| **Signaux** | Pas de site web, site web obsolète, mauvais avis |
| **130+ champs** extractibles |

**Usage pour Axiom :** Source complémentaire à Google Maps, spécifiquement française. Scraper par catégorie + département.

---

#### 9. Google Search (résultats organiques)
| Attribut | Valeur |
|----------|--------|
| **Accès** | SerpAPI ($50/mois), Apify Google Search actor |
| **Coût** | $50-100/mois |
| **Données** | URLs de sites web, snippets, positions |
| **Signaux** | Entreprises mal positionnées (page 2+) = besoin SEO |

**Usage pour Axiom :** Rechercher "agence immobilière [ville]" → les résultats page 2+ ont un site mais mal référencé → prospect SEO.

---

### CATÉGORIE 3 : Plateformes de données entreprises (SaaS)

#### 10. Pappers
| Attribut | Valeur |
|----------|--------|
| **URL** | pappers.fr/api |
| **Coût** | API: 100 crédits gratuits, puis ~60€/mois (3000 req) |
| **Données** | SIRENE + INPI + BODACC agrégés, dirigeants, comptes annuels, actes |
| **Signal clé** | **Alertes de surveillance** : création d'entreprise, changement de dirigeant, dépôt de comptes, procédure collective |
| **Uptime** | 99.9% |

**Usage pour Axiom :** Surveillance automatique des nouvelles créations d'entreprise dans les secteurs cibles. Quand une entreprise se crée → elle a besoin d'un site web → prospect très chaud.

---

#### 11. SocieteInfo
| Attribut | Valeur |
|----------|--------|
| **URL** | societeinfo.com |
| **Coût** | À partir de 39€/mois |
| **Volume** | **10 millions d'établissements** (SIRENE) + données web enrichies |
| **Données** | SIRENE + sites web + réseaux sociaux + emails |
| **Signal clé** | Données web croisées avec données légales : entreprise qui a un site web vs entreprise qui n'en a pas |
| **API** | Oui, + connecteurs Zapier/HubSpot/Pipedrive |

**Usage pour Axiom :** Enrichissement batch — identifier les entreprises sans site web ou avec site obsolète dans un secteur donné.

---

#### 12. Pharow
| Attribut | Valeur |
|----------|--------|
| **URL** | pharow.com |
| **Coût** | 15 jours gratuit, puis abonnement |
| **Volume** | **4 millions d'entreprises actives** + **10 millions de prospects** |
| **Données** | 1300+ filtres de segmentation : légal, financier, technologique |
| **Signal clé** | Stack technique détectée (WordPress, Shopify, etc.), taille, croissance |
| **Couverture** | Email: 78.7%, Téléphone: 76% |

**Usage pour Axiom :** Segmentation ultra-fine des prospects. Ex: "entreprises 50-200 salariés, à Paris, utilisant WordPress, CA > 1M€".

---

### CATÉGORIE 4 : Signaux business / LinkedIn

#### 13. LinkedIn (via APIs tierces)
| Attribut | Valeur |
|----------|--------|
| **APIs** | Netrows (99€/mois), SignalsAPI (99$/mois), People Data Labs (98$/mois) |
| **Signaux** | Changement de poste, recrutement, levée de fonds, croissance équipe, posts avec mots-clés |
| **Déjà documenté** | ✅ Dans la spec Agent 1a |

---

#### 14. Job Boards (signal d'achat)
| Attribut | Valeur |
|----------|--------|
| **Plateformes** | LinkedIn Jobs, WTTJ, Indeed, HelloWork, APEC |
| **APIs** | Apify ($49/mois), HasData ($50/mois) |
| **Signal** | Entreprise recrute dev web = budget tech = besoin externalisable |
| **Déjà documenté** | ✅ Dans la spec Agent 1d |

---

#### 15. Crunchbase / TechCrunch (levées de fonds)
| Attribut | Valeur |
|----------|--------|
| **Accès** | RSS gratuit (Maddyness, BPI) + Crunchbase API (payant) |
| **Coût** | RSS: 0€ | Crunchbase Basic: $29/mois |
| **Signal** | Levée de fonds = budget disponible pour investir en digital |

---

### CATÉGORIE 5 : Audit technique (sites web existants)

#### 16. Lighthouse / PageSpeed Insights
| Attribut | Valeur |
|----------|--------|
| **Accès** | CLI npm (gratuit) + API Google (25K req/jour gratuites) |
| **Signal** | Site lent, non accessible, mauvais SEO → opportunité |
| **Déjà documenté** | ✅ Dans la spec Agent 1c |

---

#### 17. Wappalyzer / BuiltWith
| Attribut | Valeur |
|----------|--------|
| **Accès** | Wappalyzer npm (gratuit) | BuiltWith API (payant) |
| **Signal** | Stack obsolète (WordPress ancien, jQuery, PHP < 7) → besoin de refonte |
| **Données** | CMS, framework, serveur, plugins, analytics |

---

#### 18. SSL/WHOIS monitoring
| Attribut | Valeur |
|----------|--------|
| **Accès** | Node.js tls (gratuit) + WhoisFreaks ($29/mois) |
| **Signal** | Certificat SSL expire bientôt → urgence | Domaine expire → opportunité |

---

### CATÉGORIE 6 : Sources spécialisées

#### 19. CCI (Chambres de Commerce et d'Industrie)
| Attribut | Valeur |
|----------|--------|
| **Accès** | Annuaires en ligne, parfois API locale |
| **Coût** | Gratuit (consultation) |
| **Données** | Entreprises adhérentes, événements, formations |
| **Signal** | Entreprise qui participe à des formations "digital" = besoin identifié |

---

#### 20. Avis Google / Trustpilot / Avis Vérifiés
| Attribut | Valeur |
|----------|--------|
| **Accès** | Scraping Google Maps (déjà inclus) + API Trustpilot |
| **Signal** | Avis négatifs mentionnant "site web", "commande en ligne", "application" → besoin digital |

---

## MATRICE DE RECOMMANDATION

### Sources prioritaires pour Axiom Marketing

| Priorité | Source | Coût | Volume | Signaux | Implémentation |
|:--------:|--------|:----:|:------:|---------|:--------------:|
| **P0** | API SIRENE | 0€ | 25M | Création, activité | ✅ Fait |
| **P0** | BODACC | 0€ | N/A | Créations, changements | ✅ Fait |
| **P0** | BOAMP | 0€ | N/A | Marchés publics | ✅ Fait |
| **P1** | **Google Maps** | ~$3/1K | 200M | Pas de site, avis | ❌ À faire |
| **P1** | **Pages Jaunes** | ~$10/mois | 4.5M | Pas de site, SIRET | ❌ À faire |
| **P1** | **Pappers alertes** | 60€/mois | 10M | Créations, dirigeants | ❌ À faire |
| **P1** | **Lighthouse scan** | 0€ | Illimité | Site lent/obsolète | ❌ À faire |
| **P2** | LinkedIn (Netrows) | 99€/mois | N/A | Signaux business | ❌ À faire |
| **P2** | Job Boards (Apify) | ~$60/mois | N/A | Recrutement tech | ❌ À faire |
| **P2** | SocieteInfo | 39€/mois | 10M | Enrichissement | ❌ Optionnel |
| **P2** | DECP | 0€ | N/A | Veille concurrentielle | ❌ À faire |
| **P3** | Pharow | Abonnement | 4M | Segmentation avancée | ❌ Optionnel |
| **P3** | Crunchbase RSS | 0€ | N/A | Levées de fonds | ❌ À faire |
| **P3** | Google Search | $50/mois | N/A | Positionnement SEO | ❌ Optionnel |

### Coût total estimé pour couverture complète

| Niveau | Sources | Coût mensuel |
|--------|---------|:------------:|
| **Gratuit** | SIRENE + BODACC + BOAMP + DECP + Annuaire + Lighthouse + Wappalyzer + RSS | **0€** |
| **Minimum viable** | + Google Maps (Outscraper) + Pages Jaunes (Apify) + Pappers | **~110€/mois** |
| **Complet** | + LinkedIn (Netrows) + Job Boards (Apify+HasData) + SocieteInfo | **~500€/mois** |
| **Maximum** | + Pharow + Crunchbase + Google Search | **~700€/mois** |

---

## STRATÉGIE DE DÉTECTION — Par segment Axiom

### Segment "PME Métro" (Paris, Lyon, etc.)
```
Sources : SIRENE (filtre NAF+taille+département) → Google Maps (vérifier site web)
→ Lighthouse (scanner le site) → Signal si site obsolète/lent
```

### Segment "E-commerce Shopify"
```
Sources : Wappalyzer/BuiltWith (détecter les sites Shopify) → Lighthouse (performance)
→ Avis Google (satisfaction client) → Signal si site lent ou mauvais UX
```

### Segment "Collectivités DOM-TOM"
```
Sources : BOAMP (marchés publics 974) → DECP (historique marchés)
→ Profils acheteurs (scraping) → Signal si AO IT/web ouvert
```

### Segment "Startups"
```
Sources : LinkedIn (levées de fonds, recrutement) → Crunchbase RSS
→ Job Boards (recrute dev) → Signal si croissance tech
```

### Segment "Agences White Label"
```
Sources : Google Maps ("agence marketing" + ville) → Wappalyzer (vérifie stack)
→ Pages Jaunes → Signal si petite agence sans dev interne
```

---

## SIGNAUX D'ACHAT — Les plus forts

| Signal | Score | Source | Explication |
|--------|:-----:|--------|-------------|
| Entreprise vient de se créer (<6 mois) | 35 | BODACC/SIRENE | Besoin immédiat de site web |
| Pas de site web du tout | 30 | Google Maps/Pages Jaunes | Opportunité évidente |
| Site web extrêmement lent (Lighthouse <30) | 30 | Lighthouse | Perte de CA mesurable |
| Recrute un dev web/digital | 25 | Job Boards | Budget tech alloué |
| Nouveau dirigeant/CMO | 25 | LinkedIn/BODACC | Veut marquer son arrivée |
| Levée de fonds récente | 25 | Crunchbase/LinkedIn | Budget disponible |
| Techno obsolète (WP ancien, PHP <7) | 20 | Wappalyzer | Refonte nécessaire |
| Avis négatifs mentionnant le web | 20 | Google Maps | Douleur identifiée |
| AO marché public IT/web | 20 | BOAMP | Besoin officiel budgeté |
| SSL expire bientôt | 15 | TLS check | Urgence technique |
| Mauvais référencement (page 2+) | 15 | Google Search | Manque à gagner SEO |
| Recrutement multiple tech | 15 | Job Boards | Forte croissance |
