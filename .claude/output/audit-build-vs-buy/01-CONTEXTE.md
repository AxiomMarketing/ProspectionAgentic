# 01 — Contexte & Méthodologie

## Pourquoi cet audit

Le `.env.example` du projet ProspectionAgentic listait 6 services externes payants pour l'enrichissement des données prospects. Avant d'engager ~242 EUR/mois de frais récurrents, il est pertinent d'analyser :

1. **Ce que fait réellement chaque service** (technologie sous-jacente)
2. **Si on peut le reproduire** avec des outils open-source ou des APIs gratuites
3. **Les risques** de chaque approche (juridique, technique, opérationnel)
4. **Le rapport coût/bénéfice** pour un volume de 200-500 prospects/mois

## Périmètre

| Service | Rôle dans le projet | Coût mensuel |
|---------|---------------------|--------------|
| Dropcontact | Email finder principal (Agent 2 Enrichisseur) | 39 EUR |
| Hunter.io | Email finder fallback + domain search | 49 EUR |
| ZeroBounce | Vérification email (bounce prevention) | ~15 EUR |
| Kaspr | Extraction téléphone depuis LinkedIn | 79 EUR |
| Pappers | Données entreprise France (SIRET, CA, dirigeants) | ~60 EUR |
| **Total** | | **242 EUR/mois** |

Services **hors périmètre** (conservés tels quels) :
- **Anthropic Claude API** — cœur du système, irremplaçable
- **Waalaxy** — automation LinkedIn, pas de scraping direct
- **Gmail API** — envoi d'emails, gratuit
- **Mailgun** — envoi cold email en masse, pas d'alternative DIY simple
- **Langfuse** — self-hosted, déjà gratuit
- **Slack** — notifications, webhook gratuit

## Critères d'évaluation

Pour chaque service, on évalue sur 5 axes :

| Critère | Poids | Description |
|---------|-------|-------------|
| **Faisabilité technique** | 30% | Peut-on techniquement reproduire le service ? |
| **Coût de développement** | 20% | Temps de dev initial + maintenance annuelle |
| **Fiabilité** | 20% | Précision et disponibilité de la solution DIY vs le SaaS |
| **Conformité RGPD** | 20% | Risques juridiques de chaque approche |
| **Scalabilité** | 10% | La solution DIY tient-elle à 1 000+ prospects/mois ? |

## Méthodologie

1. **Recherche web** — Documentation officielle, articles techniques, forums
2. **Analyse du code existant** — Adapters déjà codés dans le projet
3. **Cross-référence documentation projet** — `.claude/docs/03-FEATURES/02-agent-2-enrichisseur.md`
4. **Challenge contradictoire** — Pour chaque recommandation "DIY", identifier les risques cachés
5. **Validation légale** — Vérification des implications RGPD de chaque approche
