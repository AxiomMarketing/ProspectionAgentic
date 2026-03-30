# 02 — Dropcontact — Email Finder

## Fiche Service

| Attribut | Valeur |
|----------|--------|
| **Service** | Dropcontact |
| **URL** | https://www.dropcontact.com |
| **Rôle** | Email finder principal (Agent 2a Enrichisseur Contact) |
| **Coût** | 39 EUR/mois (2 500 crédits) |
| **Plan évalué** | Email Finder — 2 500 recherches/mois |

## Comment ça fonctionne (analyse technique)

### Étape 1 — Pattern Generation
À partir de `prénom` + `nom` + `domaine`, Dropcontact génère toutes les permutations possibles :

```
jean.dupont@company.fr
j.dupont@company.fr
jdupont@company.fr
jean-dupont@company.fr
dupont.jean@company.fr
jean_dupont@company.fr
jeandupont@company.fr
jean.d@company.fr
jd@company.fr
dupont@company.fr
jean@company.fr
j.d@company.fr
...
```

Selon une étude sur les entreprises Fortune 500, les patterns les plus courants sont :
- **PME (<50 salariés)** : `prenom@` domine à 70%+
- **Grands groupes (>1000)** : `prenom.nom@` à 48%+
- **Transition** à 51-200 salariés : `pnom@` et `prenom.nom@` prennent le dessus
- **Tech** : `prenom@` à ~60%
- **Finance/juridique** : `nom.prenom@` à ~25%

### Étape 2 — MX Record Lookup
Vérifie que le domaine a des serveurs mail actifs :
```
dns.resolveMx('company.fr') → [{ exchange: 'mx1.google.com', priority: 10 }]
```

### Étape 3 — SMTP Handshake (sans envoi)
Pour chaque permutation, Dropcontact établit une connexion SMTP :
```
HELO verify.dropcontact.com
MAIL FROM: <verify@dropcontact.com>
RCPT TO: <jean.dupont@company.fr>
→ 250 OK = email existe
→ 550 User not found = email n'existe pas
QUIT (pas d'envoi de message)
```

### Étape 4 — Catch-All Detection
Teste avec une adresse aléatoire (`xyzrandom123@company.fr`) :
- Si le serveur répond `250 OK` → domaine catch-all (accepte tout)
- Résultat : on ne peut pas confirmer l'email, mais la meilleure permutation est retournée avec un score de confiance réduit

### Étape 5 — Scoring
- Email vérifié SMTP + pas catch-all = **confiance 99%**
- Email vérifié SMTP + catch-all = **confiance ~60-70%**
- Pattern match sans vérification = **confiance ~40%**

## Claim RGPD de Dropcontact

Dropcontact affirme être "100% RGPD compliant" car :
- **Pas de base de données** d'emails — tout est calculé algorithmiquement en temps réel
- Les données ne sont **pas stockées** après le traitement
- Le traitement est basé sur l'**intérêt légitime B2B** (considérant 47 du RGPD)

**Analyse critique** : Ce claim est crédible. L'algorithme ne fait que deviner et vérifier — il ne scrappe pas de données personnelles. C'est comparable à essayer d'appeler un numéro de téléphone professionnel pour vérifier s'il existe.

## Peut-on reproduire ?

### Ce qui est trivial à reproduire

| Composant | Complexité | Temps estimé |
|-----------|------------|--------------|
| Pattern generator (15 permutations) | Facile | 2h |
| MX record lookup | Facile | 1h |
| SMTP check basique | Moyen | 4h |
| Catch-all detection | Moyen | 2h |
| Score de confiance | Facile | 1h |
| **Total** | | **~10h de dev** |

### Ce qui est DIFFICILE à reproduire

**La rotation d'IPs.** Dropcontact opère depuis des centaines de serveurs avec des IPs en rotation. Si tu fais 200 vérifications SMTP depuis une seule IP :
- Après ~50 vérifications sur le même serveur mail, tu risques un **temporary block**
- Après des blocages répétés, ton IP peut être **blacklistée** (Spamhaus, etc.)
- Si ton IP de vérification est la même que ton IP d'envoi d'emails → **catastrophe pour la délivrabilité**

### Alternative open-source : Reacher

[Reacher](https://reacher.email/) fait exactement le même travail :
- Écrit en **Rust** (performances maximales)
- SMTP verification, MX check, catch-all detection, disposable email detection
- **Self-hosted** dans un container Docker
- Licence **AGPL** (contrainte : si tu modifies le code, tu dois publier les modifications)
- Prix self-hosted : **gratuit** (tu fournis juste le serveur)

## Verdict

| Critère | Score | Commentaire |
|---------|-------|-------------|
| Faisabilité technique | 9/10 | Reacher fait tout, prêt à déployer |
| Coût de développement | 8/10 | Adapter NestJS = ~1 jour de dev |
| Fiabilité | 7/10 | Moins fiable que Dropcontact sur les domaines complexes |
| Conformité RGPD | 9/10 | Même approche algorithmique, pas de base de données |
| Scalabilité | 6/10 | Limité par la rotation d'IP — problème à >500/mois |

**Recommandation : REMPLACER par Reacher self-hosted**
- Économie : 39 EUR/mois = 468 EUR/an
- Risque principal : IP blacklisting → mitigation via container dédié avec IP séparée

## Sources

- [Dropcontact — Email Verifier](https://www.dropcontact.com/email-verifier)
- [Dropcontact — Main Features](https://www.dropcontact.com/main-features)
- [Email Pattern Analysis: Fortune 500](https://emailsearch.io/p/email-pattern-analysis)
- [Reacher — Open-Source Email Verification](https://reacher.email/)
- [email-verify npm package](https://github.com/EmailVerify/email-verify)
