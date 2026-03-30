# Audit Build vs Buy — Services d'Enrichissement B2B

**Date :** 24 mars 2026
**Auteur :** Claude (Opus 4.6) — Brainstorm assisté
**Projet :** ProspectionAgentic — Axiom Marketing
**Objectif :** Déterminer pour chaque service externe s'il est possible de le remplacer par une solution maison (DIY), en analysant le fonctionnement interne, les risques, les coûts et la faisabilité.

---

## Sommaire

| # | Document | Contenu |
|---|----------|---------|
| 01 | [Contexte & Méthodologie](./01-CONTEXTE.md) | Pourquoi cet audit, périmètre, critères d'évaluation |
| 02 | [Dropcontact — Email Finder](./02-DROPCONTACT.md) | Analyse technique, fonctionnement interne, alternative DIY |
| 03 | [Hunter.io — Email Database](./03-HUNTER.md) | Crawling web, base 500M emails, pertinence pour le projet |
| 04 | [ZeroBounce — Email Verification](./04-ZEROBOUNCE.md) | SMTP verification, spam traps, alternatives open-source |
| 05 | [Kaspr — LinkedIn Phone Extraction](./05-KASPR.md) | Scraping LinkedIn, sanction CNIL, risques RGPD |
| 06 | [Pappers — Données Entreprise France](./06-PAPPERS.md) | Sources open data, APIs publiques gratuites |
| 07 | [Reacher — Alternative OSS Centrale](./07-REACHER.md) | Solution self-hosted qui remplace 3 services |
| 08 | [APIs Publiques France](./08-APIS-PUBLIQUES.md) | INSEE, BODACC, INPI, Annuaire Entreprises |
| 09 | [Matrice Décisionnelle](./09-MATRICE-DECISION.md) | Tableau comparatif final Build vs Buy |
| 10 | [Guide d'Implémentation](./10-GUIDE-IMPLEMENTATION.md) | Plan technique pour coder les adapters DIY |
| 11 | [Roadmap d'Intégration](./11-ROADMAP-INTEGRATION.md) | Planning semaine par semaine |
| 12 | [Risques & Mitigations](./12-RISQUES.md) | IP blacklisting, RGPD, fiabilité, maintenance |
| 13 | [.env Complet Révisé](./13-ENV-REVISE.md) | Nouveau .env.example avec toutes les variables |
| 14 | [Registre CVE](./14-CVE-REGISTRE.md) | Vulnérabilités connues, versions patchées, actions requises |
| 15 | [Edge Cases & Bonnes Pratiques](./15-EDGE-CASES-BONNES-PRATIQUES.md) | Cas limites, anti-patterns, sécurité, tests obligatoires |

---

## Audit de version (24 mars 2026)

| Composant | Version projet | Dernière version | CVE connue | Status |
|-----------|:--------------:|:----------------:|:----------:|:------:|
| Redis (Docker) | 7.4.8 | 7.4.8 | CVE-2025-49844 patchée | ✅ |
| Axios | 1.13.6 | 1.13.6 | CVE-2025-27152 patchée | ✅ |
| NestJS | 11.1.17 | 11.1.17 | CVE-2025-15284 non affecté (Express) | ✅ |
| Prisma | 6.19.2 | 6.19.2 | Aucune | ✅ |
| @anthropic-ai/sdk | **0.39.0** | **0.80.0** | Aucune CVE mais 41 versions de retard | ⚠️ UPGRADE |
| Reacher (à ajouter) | — | v0.7.x | Aucune | ✅ |

---

## Résultat clé

**Économie potentielle : 242 EUR/mois (2 904 EUR/an)** en remplaçant 5 services payants par :
- **Reacher** (open-source, self-hosted) → remplace Dropcontact + Hunter + ZeroBounce
- **APIs publiques gratuites** (INSEE + BODACC + INPI) → remplace Pappers
- **Suppression Kaspr** → risque RGPD trop élevé, non prioritaire
