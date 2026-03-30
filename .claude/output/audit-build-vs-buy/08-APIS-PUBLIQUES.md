# 08 — APIs Publiques France — Données Entreprise Gratuites

## Vue d'ensemble

La France a un écosystème d'open data parmi les plus riches d'Europe pour les données d'entreprise. Voici les 4 APIs principales qui, ensemble, remplacent Pappers.

---

## 1. INSEE SIRENE — Identité Entreprise

### Accès
| Attribut | Valeur |
|----------|--------|
| **URL** | https://api.insee.fr/entreprises/sirene/V3.11 |
| **Portail** | https://api.gouv.fr/les-api/sirene_v3 |
| **Authentification** | Bearer token (gratuit, inscription sur api.insee.fr) |
| **Rate limit** | 30 requêtes/minute |
| **Coût** | **Gratuit** |
| **Status dans le projet** | **Déjà implémenté** (`insee.adapter.ts`) |

### Données disponibles

| Donnée | Champ API | Exemple |
|--------|-----------|---------|
| SIREN | `siren` | 443061841 |
| SIRET | `siret` | 44306184100015 |
| Raison sociale | `denominationUniteLegale` | AXIOM MARKETING |
| Forme juridique | `categorieJuridiqueUniteLegale` | 5710 (SAS) |
| Code NAF/APE | `activitePrincipaleUniteLegale` | 73.11Z |
| Date de création | `dateCreationUniteLegale` | 2020-03-15 |
| Effectif (tranche) | `trancheEffectifsUniteLegale` | 03 (6-9 salariés) |
| Adresse | `adresseEtablissement` | Complète |
| État | `etatAdministratifUniteLegale` | A (Actif) |

### Limitations
- Pas de données financières (CA, résultat)
- Pas de dirigeants/bénéficiaires
- Pas d'annonces légales
- Effectif en tranches seulement (pas le chiffre exact)

### Exemple de requête
```bash
curl -H "Authorization: Bearer TOKEN" \
  "https://api.insee.fr/entreprises/sirene/V3.11/siret/44306184100015"
```

---

## 2. BODACC — Annonces Légales

### Accès
| Attribut | Valeur |
|----------|--------|
| **URL** | https://bodacc-datadila.opendatasoft.com/api/v2/ |
| **Alternative** | https://www.bodacc.fr/api/ |
| **Authentification** | Aucune (open data) |
| **Rate limit** | Non documenté (raisonnable) |
| **Coût** | **Gratuit** |
| **Status dans le projet** | **À implémenter** |

### Données disponibles

| Type d'annonce | Intérêt pour la prospection |
|----------------|---------------------------|
| **Créations d'entreprise** | Détection de nouveaux prospects potentiels |
| **Modifications** (changement de dirigeant, siège, capital) | Signaux de changement = opportunité de contact |
| **Procédures collectives** (redressement, liquidation) | Prospects à éviter |
| **Cessions** | Opportunités de contact post-acquisition |
| **Avis de dépôt des comptes** | Signal d'entreprise structurée |

### Exemple de requête
```bash
# Rechercher les annonces pour un SIREN
curl "https://bodacc-datadila.opendatasoft.com/api/v2/catalog/datasets/annonces-commerciales/records?where=registre%20like%20%22443061841%22"
```

### Données retournées
```json
{
  "numeroDepartement": "75",
  "tribunal": "Tribunal de commerce de Paris",
  "typeAnnonce": "creation",
  "registre": "443 061 841 RCS Paris",
  "denomination": "AXIOM MARKETING",
  "datePublication": "2020-04-01",
  "details": "..."
}
```

---

## 3. INPI / RNE — Dirigeants & Comptes Annuels

### Accès
| Attribut | Valeur |
|----------|--------|
| **URL** | https://data.inpi.fr/api/ |
| **Portail** | https://data.inpi.fr |
| **Authentification** | Compte gratuit (inscription obligatoire) |
| **Rate limit** | Non documenté |
| **Coût** | **Gratuit** |
| **Status dans le projet** | **À implémenter** |

### Données disponibles

| Donnée | Source | Intérêt |
|--------|--------|---------|
| **Dirigeants** (nom, prénom, fonction, date de naissance) | RNE | Identification du décideur pour la prospection |
| **Bénéficiaires effectifs** | RNE | Comprendre la structure de propriété |
| **Comptes annuels** (CA, résultat, bilan) | Greffe via INPI | Qualification financière du prospect |
| **Statuts** (PDF) | Greffe via INPI | Compréhension juridique |
| **Actes** (PV AG, cessions) | Greffe via INPI | Signaux de changement |

### Accès aux données financières
Les comptes annuels déposés aux greffes sont accessibles gratuitement via l'INPI depuis la loi PACTE (2019). C'est la source principale de Pappers pour les données financières.

### Limitations
- L'API INPI peut être lente (1-5s par requête)
- Downtimes fréquents (maintenance)
- Toutes les entreprises ne déposent pas leurs comptes (micro-entreprises, certaines SCI)
- Format des données pas toujours uniforme

---

## 4. Annuaire Entreprises — API de recherche (DINUM)

### Accès
| Attribut | Valeur |
|----------|--------|
| **URL** | https://recherche-entreprises.api.gouv.fr |
| **Site web** | https://annuaire-entreprises.data.gouv.fr |
| **Authentification** | Aucune |
| **Rate limit** | 7 requêtes/seconde |
| **Coût** | **Gratuit** |
| **Status dans le projet** | **Backup optionnel** |

### Pourquoi c'est intéressant

L'Annuaire des Entreprises est développé par la **DINUM** (Direction interministérielle du numérique). Il **agrège déjà** INSEE + INPI + RNA en une seule API. C'est essentiellement un "Pappers gratuit" fait par l'État.

### Données disponibles
- Identité complète (SIREN, SIRET, adresse, NAF)
- Dirigeants
- Effectifs
- Situation financière (quand disponible)
- Conventions collectives

### Limitations
- Moins de données que Pappers (pas de BODACC intégré)
- Pas de comptes annuels détaillés
- API plus lente que Pappers

### Exemple de requête
```bash
# Recherche par nom
curl "https://recherche-entreprises.api.gouv.fr/search?q=axiom+marketing&page=1&per_page=5"
```

---

## 5. API Entreprise (DINUM) — Accès restreint

### Important
**API Entreprise est réservée aux administrations et organismes publics.** Elle n'est pas accessible aux entreprises privées.

Elle donne accès à des données supplémentaires (attestations URSSAF, DGFIP, etc.) mais n'est pas pertinente pour le projet.

---

## Tableau récapitulatif

| API | Données clés | Auth | Gratuit | Fiabilité | Déjà codé |
|-----|-------------|------|---------|-----------|-----------|
| **INSEE SIRENE** | Identité, SIRET, NAF, effectif | Token | Oui | Bonne | Oui |
| **BODACC** | Annonces légales, procédures | Aucune | Oui | Bonne | Non |
| **INPI/RNE** | Dirigeants, comptes annuels | Compte | Oui | Moyenne | Non |
| **Annuaire Entreprises** | Agrégé (backup) | Aucune | Oui | Bonne | Non |

### Couverture par rapport à Pappers

| Donnée Pappers | Source gratuite | Couverture |
|----------------|----------------|------------|
| SIREN/SIRET | INSEE SIRENE | 100% |
| Adresse | INSEE SIRENE | 100% |
| NAF/APE | INSEE SIRENE | 100% |
| Effectif | INSEE SIRENE | 100% (tranches) |
| Dirigeants | INPI/RNE | ~95% |
| Bénéficiaires effectifs | INPI/RNE | ~90% |
| CA / Résultat | INPI/RNE (comptes annuels) | ~70% (dépend du dépôt) |
| Procédures collectives | BODACC | 100% |
| Créations/modifications | BODACC | 100% |
| Recherche full-text | Annuaire Entreprises | ~80% |

## Sources

- [API SIRENE — api.gouv.fr](https://api.gouv.fr/les-api/sirene_v3)
- [BODACC — Données ouvertes et API](https://www.bodacc.fr/pages/donnees-ouvertes-et-api/)
- [INPI — Accès API Entreprises](https://data.inpi.fr/content/editorial/Acces_API_Entreprises)
- [Annuaire Entreprises — data.gouv.fr](https://www.data.gouv.fr/dataservices/api-recherche-dentreprises)
- [API Entreprise — DINUM](https://entreprise.api.gouv.fr/catalogue)
- [INSEE — Base Sirene](https://www.insee.fr/fr/information/3591226)
