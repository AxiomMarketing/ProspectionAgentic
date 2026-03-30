# 12 — Risques & Mitigations

## Matrice de risque complète

### R-001 — IP Blacklisting SMTP

| Attribut | Valeur |
|----------|--------|
| **Probabilité** | Moyenne (3/5) |
| **Impact** | Élevé (4/5) — Si l'IP d'envoi est blacklistée, plus aucun email ne passe |
| **Score** | 12/25 |

**Description :** Lorsque Reacher vérifie des emails via SMTP (`RCPT TO:`), les serveurs mail distants peuvent détecter un comportement "non humain" (beaucoup de vérifications sans envoi) et blacklister l'IP source.

**Mitigations :**
1. **IP séparée** — Le container Reacher DOIT avoir une IP différente du serveur d'envoi d'emails. En Docker, c'est automatique si le container n'utilise pas le host network.
2. **Throttling strict** — Max 5 vérifications/seconde, max 500/jour (configuré dans Reacher)
3. **Pas de vérification le week-end** — Les systèmes anti-abus sont plus sensibles aux patterns non-business-hours
4. **Monitoring** — Vérifier régulièrement l'IP de Reacher sur [MXToolbox Blacklist Check](https://mxtoolbox.com/blacklists.aspx)
5. **Fallback SaaS** — Si l'IP est blacklistée, réactiver ZeroBounce (15 EUR/mois) le temps de résoudre

**Plan d'escalade :**
- Niveau 1 : Réduire le throttling à 2 req/s
- Niveau 2 : Changer l'IP du container (redéploiement)
- Niveau 3 : Passer sur des cloud functions (1 IP par vérification)
- Niveau 4 : Réactiver ZeroBounce comme service principal

---

### R-002 — APIs Publiques Indisponibles

| Attribut | Valeur |
|----------|--------|
| **Probabilité** | Moyenne (3/5) — L'API INPI est connue pour ses downtimes |
| **Impact** | Faible (2/5) — L'enrichissement est partiel, pas bloquant |
| **Score** | 6/25 |

**Description :** Les APIs publiques (INSEE, BODACC, INPI) ont un uptime inférieur aux SaaS commerciaux. L'INPI en particulier a des maintenances fréquentes.

**Mitigations :**
1. **Cache Redis** — Toute réponse d'API publique est cachée (TTL 24h pour INSEE, 7j pour BODACC/INPI)
2. **Graceful degradation** — Si une API est down, l'enrichissement continue avec les données disponibles. Un flag `source_unavailable: ['inpi']` est ajouté au résultat.
3. **Retry avec backoff** — 3 retries avec backoff exponentiel (1s, 3s, 9s) avant de déclarer l'API down
4. **Annuaire Entreprises comme backup** — Si INSEE est down, l'Annuaire Entreprises (DINUM) fournit une partie des mêmes données
5. **Circuit breaker** — Si une API échoue 5 fois consécutives, le circuit breaker s'ouvre et on ne tente plus pendant 5 minutes

---

### R-003 — Données Financières Incomplètes

| Attribut | Valeur |
|----------|--------|
| **Probabilité** | Élevée (4/5) |
| **Impact** | Moyen (3/5) — Le scoring est dégradé sans données financières |
| **Score** | 12/25 |

**Description :** Toutes les entreprises ne déposent pas leurs comptes annuels :
- Micro-entreprises : pas d'obligation
- SCI : souvent pas de dépôt
- Entreprises récentes (< 1 an) : pas encore de bilan
- Option de confidentialité : certaines PME activent la confidentialité des comptes

**Impact :** ~30% des PME ciblées pourraient ne pas avoir de données financières via l'INPI.

**Mitigations :**
1. **Score adaptatif** — Si pas de données financières, le scoring utilise les autres axes (ICP, signaux, tech, engagement) avec repondération
2. **Indicateurs proxy** — Utiliser la tranche effectif INSEE + le code NAF + l'ancienneté comme proxy du CA
3. **Enrichissement manuel** — Pour les prospects HOT sans données financières, l'équipe peut vérifier manuellement (Societe.com, LinkedIn)
4. **Pappers en fallback** — Si le taux de données financières est trop faible (<50%), réactiver Pappers (60 EUR/mois) qui a parfois des données complémentaires

---

### R-004 — Catch-All Domains → Faux Positifs

| Attribut | Valeur |
|----------|--------|
| **Probabilité** | Élevée (4/5) — ~30% des domaines PME sont catch-all |
| **Impact** | Moyen (3/5) — Emails envoyés à des adresses inexistantes = bounce |
| **Score** | 12/25 |

**Description :** Un domaine catch-all accepte tous les emails, même ceux adressés à des utilisateurs inexistants. Le SMTP check retourne `250 OK` pour n'importe quelle adresse, rendant la vérification impossible.

**Impact :** Pour ~30% des prospects, le score de confiance sera limité à 60%.

**Mitigations :**
1. **Score de confiance transparent** — L'UI du dashboard affiche clairement la confiance (99% vs 60%)
2. **Pattern optimization** — Pour les domaines catch-all, utiliser le pattern le plus probable selon la taille de l'entreprise (ex: `prenom.nom@` pour les >50 salariés)
3. **Vérification post-envoi** — Si le premier email bounce, essayer le pattern #2
4. **Enrichissement par d'autres canaux** — Page contact du site web, LinkedIn, signatures email publiques

---

### R-005 — Abandon du Projet Reacher (OSS)

| Attribut | Valeur |
|----------|--------|
| **Probabilité** | Très faible (1/5) — 15K stars, maintenu activement |
| **Impact** | Élevé (4/5) — Perte du composant central de vérification email |
| **Score** | 4/25 |

**Description :** Reacher est un projet open-source. S'il est abandonné, on perd la maintenance et les mises à jour.

**Mitigations :**
1. **Fork** — Avec 15K+ stars et une base en Rust, la communauté peut forker si nécessaire
2. **Alternatives** — `email-verifier` (Go), `truemail` (Ruby) existent comme fallback
3. **DIY Node.js** — La librairie `email-verify` sur npm fait du SMTP check basique. On peut migrer si nécessaire.
4. **Version pinée** — Utiliser une version Docker spécifique (pas `latest`) pour éviter les breaking changes

---

### R-006 — Conformité RGPD de la vérification SMTP

| Attribut | Valeur |
|----------|--------|
| **Probabilité** | Faible (2/5) |
| **Impact** | Élevé (4/5) — Amende CNIL potentielle |
| **Score** | 8/25 |

**Description :** La vérification SMTP implique de "tester" si une adresse email existe, ce qui pourrait être considéré comme un traitement de données personnelles.

**Analyse juridique :**
- La CNIL a sanctionné **Kaspr** pour la **collecte et le stockage** de données. La vérification SMTP ne stocke rien — elle teste et oublie.
- Dropcontact utilise exactement la même technique et se revendique "100% RGPD compliant"
- L'intérêt légitime B2B (considérant 47 du RGPD) couvre la prospection commerciale entre professionnels
- La vérification SMTP ne donne accès à aucune donnée personnelle — elle confirme uniquement l'existence d'une boîte mail

**Mitigations :**
1. **Pas de stockage des résultats négatifs** — Ne pas conserver les emails qui n'existent pas
2. **Log minimal** — Logger uniquement le résultat (valid/invalid), pas le détail SMTP
3. **Base légale documentée** — Documenter l'intérêt légitime B2B dans le registre des traitements
4. **Opt-out respecté** — Si une personne demande à être supprimée, supprimer aussi le résultat de vérification

---

## Résumé des risques

| # | Risque | Score | Priorité | Mitigation principale |
|---|--------|:-----:|:--------:|----------------------|
| R-001 | IP Blacklisting SMTP | 12 | HAUTE | IP dédiée + throttling |
| R-002 | APIs publiques down | 6 | BASSE | Cache Redis + graceful degradation |
| R-003 | Données financières incomplètes | 12 | HAUTE | Score adaptatif + proxies |
| R-004 | Catch-all faux positifs | 12 | HAUTE | Score de confiance + pattern optimization |
| R-005 | Abandon Reacher | 4 | BASSE | Fork + alternatives |
| R-006 | RGPD vérification SMTP | 8 | MOYENNE | Pas de stockage + base légale documentée |
