# Budget Détaillé et Total Cost of Ownership (TCO)

**Ce document présente 3 scénarios budgétaires** : version gratuite maximale, version standard, et version premium. Inclut le TCO sur 2 ans.

---

## 1. Coûts API Mensuels par Agent

### Scénario 1 : Version Gratuite Maximale (~50-100 EUR/mois)

Basé sur l'analyse "ANALYSE-VERSION-GRATUITE.md" des specs. 95% du système fonctionnel sans APIs payantes.

| Agent | Coût | Alternative gratuite utilisée |
|-------|------|-------------------------------|
| 1 - Veilleur | 4€ (VPS) | Custom Playwright au lieu de Netrows/Apify/SignalsAPI |
| 2 - Enrichisseur | 0€ | INSEE Sirene + pattern matching email + SMTP check |
| 3 - Scoreur | 0€ | Calcul local |
| 4 - Rédacteur | 5€ | Claude Haiku pour génération basique |
| 5 - Suiveur | 10€ | Gmail API + warm-up self-hosted |
| 6 - Nurtureur | 3€ | Gmail + Wappalyzer npm |
| 7 - Analyste | 0€ | SQL + Metabase |
| 8 - Dealmaker | 5€ | Puppeteer + Claude pour devis |
| 9 - Appels d'Offres | 10€ | PyMuPDF + Claude pour analyse DCE |
| 10 - CSM | 0€ | Gmail + spreadsheet |
| Infrastructure | 15€ | VPS Hetzner CAX11 |
| **TOTAL** | **~52 EUR/mois** | |

**Limitations :** Précision email 60-70% (vs 95-98% avec Dropcontact), pas de téléphones, volume LinkedIn réduit, scraping custom = plus de maintenance.

### Scénario 2 : Version Standard (~500-700 EUR/mois)

L'approche recommandée par le brainstorm (Phase 1-3 de la roadmap).

| Agent | Coût | Services utilisés |
|-------|------|-------------------|
| 1 - Veilleur (simplifié) | 80€ | Crawlee self-hosted (jobs), BOAMP gratuit, pas de LinkedIn payant |
| 2 - Enrichisseur | 80€ | Dropcontact (39€), Pappers free tier, INSEE gratuit |
| 3 - Scoreur | 0€ | Calcul local |
| 4 - Rédacteur | 25€ | Claude Sonnet (routing optimisé) |
| 5 - Suiveur | 70€ | Gmail + Mailgun (30€) + warm-up Instantly (37$) |
| 6 - Nurtureur | 15€ | Gmail + Claude Haiku |
| 7 - Analyste | 5€ | Claude Haiku pour résumés |
| 8 - Dealmaker | 80€ | Yousign (75€) + Claude |
| 9 - Appels d'Offres | 20€ | Claude Vision + PyMuPDF |
| 10 - CSM | 30€ | Typeform + Gmail |
| Infrastructure | 30€ | VPS Hetzner CAX21 (15€) + backups (5€) + domaines (10€) |
| Observabilité | 0€ | Langfuse + Metabase (self-hosted) |
| **TOTAL** | **~470-570 EUR/mois** | |

### Scénario 3 : Version Premium (~957-1267 EUR/mois)

Tel que décrit dans les specs originales (toutes les APIs payantes).

| Agent | Coût | Services utilisés |
|-------|------|-------------------|
| 1 - Veilleur | 401€ | Netrows, SignalsAPI, n8n (self-hosted), Hunter.io, Apify, HasData |
| 2 - Enrichisseur | 278€ | Dropcontact, Hunter.io, ZeroBounce, Kaspr, Pappers, Societe.com, Wappalyzer API |
| 3 - Scoreur | 0€ | Calcul local |
| 4 - Rédacteur | 12€ | Claude Sonnet |
| 5 - Suiveur | 150€ | Gmail, Mailgun, Waalaxy, Claude |
| 6 - Nurtureur | 37€ | Gmail, Claude, BuiltWith, Google Search |
| 7 - Analyste | 50€ | Claude API (rapports), Slack, Metabase partagé |
| 8 - Dealmaker | 60€ | Yousign, Claude, Puppeteer |
| 9 - Appels d'Offres | 30€ | Claude Vision, PyMuPDF |
| 10 - CSM | 125-255€ | Typeform, Gmail, plateformes avis |
| Infrastructure | 50€ | VPS + monitoring + backups |
| **TOTAL** | **~957-1267 EUR/mois** | |

---

## 2. Total Cost of Ownership (TCO) sur 2 Ans

### Au-delà des APIs : Coûts Cachés

| Poste | Estimation annuelle | Note |
|-------|-------------------|------|
| **APIs (scénario standard)** | 6-8K€ | Variable selon volume |
| **Infrastructure (VPS, DNS, SSL)** | 500-1K€ | Hetzner + domaines |
| **Développement initial** | 15-40K€ | 2-4 mois dev (freelance ou interne) |
| **Maintenance corrective** | 5-10K€/an | Bug fixes, API changes, upgrades |
| **Maintenance évolutive** | 5-15K€/an | Nouvelles fonctionnalités, optimisations |
| **Consultation juridique RGPD** | 2-5K€ | Initial + revue annuelle |
| **Warm-up email** | 500€/an | Instantly.ai ou MailReach |
| **Formation / Onboarding** | 2-5K€ | Si nouveau développeur rejoint |
| **Incidents / Urgences** | 2-5K€/an | Temps passé sur les pannes |

### TCO Comparatif sur 2 Ans

| Scénario | Année 1 | Année 2 | Total 2 ans |
|----------|---------|---------|-------------|
| **Gratuit max** | ~20-30K€ (dev + infra) | ~10-15K€ (maintenance) | **30-45K€** |
| **Standard** | ~30-50K€ (dev + APIs + infra) | ~15-25K€ (maintenance + APIs) | **45-75K€** |
| **Premium** | ~40-70K€ (dev + APIs + infra) | ~20-35K€ (maintenance + APIs) | **60-105K€** |

**Note :** Ces estimations supposent 1-2 développeurs. Avec une équipe de 5+, multiplier par 2-3x.

### Comparaison avec Solutions SaaS

| Solution | Coût/mois | Coût 2 ans | Couverture |
|----------|-----------|-----------|-----------|
| Lemlist + Apollo + Pipedrive | ~300€ | 7,200€ | Prospection email + enrichissement + CRM |
| Instantly + Hunter + HubSpot Free | ~200€ | 4,800€ | Cold email + enrichissement basique + CRM |
| 11x.ai (Alice AI SDR) | ~5,000€ | 120,000€ | Agent AI prospection complet |
| **Axiom Custom (standard)** | ~500€ APIs + dev | **45-75K€** | Système complet personnalisé |

**Analyse :**
- Les solutions SaaS basiques (Lemlist/Instantly) sont 6-15x moins chères mais moins personnalisées
- 11x.ai est 2x plus cher mais prêt à l'emploi
- La solution custom Axiom est le sweet spot SI le volume justifie l'investissement (>100 leads/mois)

---

## 3. ROI Estimé

### Hypothèses (scénario conservateur)

| Paramètre | Valeur |
|-----------|--------|
| Leads qualifiés/mois | 50-100 |
| Taux de réponse email | 3% (conservateur) |
| Taux de conversion RDV → Deal | 20% (conservateur) |
| Taille moyenne deal | 8,000€ (conservateur) |
| Cycle de vente | 45 jours |

### Calcul ROI (scénario standard — 500€/mois API)

```
Leads/mois :                  75
Réponses (3%) :               2.25
RDV obtenus (~50% des réponses) : 1.1
Deals signés (20% win rate) : 0.22/mois → ~2.7 deals/an
CA généré :                   2.7 × 8,000€ = 21,600€/an
Coût système :                ~25-35K€/an (TCO standard)
ROI Année 1 :                 NÉGATIF (-3 à -13K€)
ROI Année 2 :                 POSITIF (+1 à +6K€) si maintenance réduite

MAIS si taux de réponse = 5% et win rate = 30% :
Deals/an :                    6.75
CA généré :                   54,000€/an
ROI Année 1 :                 +19-29K€ = TRÈS POSITIF
```

**Conclusion ROI :** Le ROI dépend ENTIÈREMENT du taux de conversion. D'où l'importance critique du test manuel Phase 0 pour valider les hypothèses.

---

## 4. Optimisations de Coûts

### Model Routing LLM — Économie de 60-80%

| Avant (tout Sonnet) | Après (routing) | Économie |
|---------------------|-----------------|----------|
| Classification : Sonnet (0.005€) | Haiku (0.001€) | -80% |
| Email : Sonnet (0.005€) | Sonnet (0.005€) | 0% |
| Résumé : Sonnet (0.01€) | Haiku (0.002€) | -80% |
| Analyse DCE : Sonnet (0.03€) | Opus (0.15€) | +400% (mais qualité critique) |
| **Total mensuel** | **~75€ → ~25€** | **-67%** |

### Prompt Caching — Économie de 90% sur system prompts

Chaque agent a un system prompt stable (~2000 tokens). Avec prompt caching Anthropic :
- Sans caching : 2000 tokens × 3$/M × 5000 appels/mois = 30€/mois en system prompts
- Avec caching : 2000 tokens × 0.30$/M × 5000 appels/mois = 3€/mois
- **Économie : ~27€/mois**

### Sources Gratuites vs Payantes

| Donnée | Payant | Gratuit | Delta qualité |
|--------|--------|---------|--------------|
| Entreprises | Pappers 25€ | INSEE Sirene API | Pappers a plus de détails financiers |
| BODACC | Pappers inclus | data.gouv.fr | Identique |
| Tech stack | Wappalyzer API 30€ | Wappalyzer npm | Identique (même moteur) |
| Performance | N/A | Lighthouse CLI | Aucune alternative payante nécessaire |
| Accessibilité | N/A | axe-core | Aucune alternative payante nécessaire |
| Marchés publics | N/A | BOAMP API | Gratuit et officiel |

**Économie sources gratuites : ~55€/mois** par rapport à la version premium.

---

*Ce document complète le brainstorm. Tous les fichiers sont disponibles dans `.claude/brainstorming/`.*
