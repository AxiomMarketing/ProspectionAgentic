# 09 — Matrice Décisionnelle — Build vs Buy

## Notation (1-10)

| Service | Faisabilité technique | Coût dev | Fiabilité DIY | RGPD | Scalabilité | **Score pondéré** | **Décision** |
|---------|:----:|:----:|:----:|:----:|:----:|:----:|---|
| | 30% | 20% | 20% | 20% | 10% | /10 | |
| **Dropcontact** | 9 | 8 | 7 | 9 | 6 | **8.0** | BUILD (Reacher) |
| **Hunter.io** | 2 | — | — | 6 | 9 | **3.4** | SKIP (inutile) |
| **ZeroBounce** | 8 | 9 | 7 | 9 | 6 | **7.9** | BUILD (Reacher) |
| **Kaspr** | 5 | — | — | 1 | — | **1.8** | SKIP (interdit) |
| **Pappers** | 9 | 8 | 7 | 10 | 8 | **8.4** | BUILD (APIs publiques) |

## Décisions finales

### REMPLACER (Build)

| Service remplacé | Par quoi | Économie/mois | Dev initial | Maintenance/an |
|-----------------|----------|:------------:|:-----------:|:--------------:|
| Dropcontact (39 EUR) | Reacher self-hosted + pattern generator | 39 EUR | ~12h | ~4h |
| ZeroBounce (15 EUR) | Reacher self-hosted (même instance) | 15 EUR | 0h (inclus ci-dessus) | 0h |
| Pappers (60 EUR) | INSEE + BODACC + INPI APIs | 60 EUR | ~8h | ~6h |

### SUPPRIMER (Skip)

| Service supprimé | Raison | Économie/mois |
|-----------------|--------|:------------:|
| Hunter.io (49 EUR) | Redondant avec Reacher, gain marginal | 49 EUR |
| Kaspr (79 EUR) | Risque RGPD majeur, non prioritaire | 79 EUR |

### CONSERVER (Buy) — Aucun

Tous les services peuvent être remplacés ou supprimés en Phase 0-1.

---

## Bilan économique

### Investissement initial (one-time)

| Poste | Estimation |
|-------|-----------|
| Reacher adapter NestJS + pattern generator | 12h |
| BODACC adapter NestJS | 3h |
| INPI/RNE adapter NestJS | 4h |
| Annuaire Entreprises adapter (backup) | 2h |
| Tests unitaires + intégration | 4h |
| **Total développement** | **~25h** |

### Économie récurrente

| Période | SaaS (Buy all) | DIY (Build) | Économie |
|---------|:--------------:|:-----------:|:--------:|
| **Mensuel** | 242 EUR | 0 EUR | **242 EUR/mois** |
| **Annuel** | 2 904 EUR | ~10h maintenance | **~2 800 EUR/an** |
| **Sur 3 ans** | 8 712 EUR | ~30h maintenance | **~8 400 EUR** |

### Seuil de rentabilité

Avec un coût de dev estimé à 25h :
- Si valorisation du dev à 50 EUR/h → investissement = 1 250 EUR
- **Rentabilisé en ~5.2 mois**
- Si valorisation à 100 EUR/h → investissement = 2 500 EUR
- **Rentabilisé en ~10.3 mois**

---

## Scénarios de fallback

### Si le DIY ne suffit pas (Phase 2+)

| Problème | Service à réintroduire | Coût |
|----------|----------------------|------|
| IP blacklistée pour SMTP check | ZeroBounce (vérification seule) | 15 EUR/mois |
| Besoin de 500+ prospects/mois avec emails fiables | Dropcontact | 39 EUR/mois |
| Données financières incomplètes via INPI | Pappers | 60 EUR/mois |

L'architecture est conçue pour que **les adapters SaaS puissent être réactivés à tout moment** sans changer le code métier (Adapter Pattern).

---

## Matrice de risque

| Risque | Probabilité | Impact | Mitigation |
|--------|:-----------:|:------:|------------|
| IP blacklistée SMTP | Moyenne | Moyen | Container Reacher sur IP dédiée |
| API INSEE down | Faible | Faible | Cache Redis 24h + retry |
| API INPI down | Moyenne | Faible | Graceful degradation (données partielles OK) |
| BODACC format change | Faible | Faible | Tests d'intégration + alerting |
| Reacher abandonnée (OSS) | Très faible | Élevé | Fork possible (15K stars = communauté active) |
| Catch-all domains → emails incorrects | Moyenne | Moyen | Score de confiance + vérification manuelle HOT leads |
