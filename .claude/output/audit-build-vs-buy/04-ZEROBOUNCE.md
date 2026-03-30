# 04 — ZeroBounce — Email Verification

## Fiche Service

| Attribut | Valeur |
|----------|--------|
| **Service** | ZeroBounce |
| **URL** | https://www.zerobounce.net |
| **Rôle** | Vérification email systématique avant envoi (Agent 2a) |
| **Coût** | ~16 USD (~15 EUR)/mois (2 000 vérifications) |
| **Plan évalué** | Pay-as-you-go — 2 000 credits |

## Comment ça fonctionne (analyse technique)

### Couche 1 — Validation syntaxique
- Format RFC 5322 valide
- Pas de caractères interdits
- TLD existant

### Couche 2 — DNS/MX Verification
- Le domaine existe-t-il ?
- A-t-il des enregistrements MX (serveurs mail) ?
- Les serveurs MX répondent-ils ?

### Couche 3 — SMTP Verification
- Connexion au serveur mail
- `RCPT TO:` test (même technique que Dropcontact)
- Détection des réponses `250 OK` vs `550 User not found`

### Couche 4 — Catch-All Detection
- Test avec adresse aléatoire
- Si le domaine accepte tout → flag `catch-all`

### Couche 5 — Fonctionnalités avancées (propriétaire)
| Fonctionnalité | Description | Reproductible ? |
|----------------|-------------|-----------------|
| **Spam trap detection** | Base de données de known spam traps | Non — base propriétaire |
| **Abuse email detection** | Emails connus pour signaler du spam | Non — base propriétaire |
| **Toxic email scoring** | IA qui prédit le risque de plainte | Non — modèle propriétaire |
| **Disposable email detection** | Emails temporaires (guerrillamail, etc.) | Oui — listes open-source |
| **Role-based detection** | info@, contact@, support@ | Oui — trivial |

## Peut-on reproduire ?

### Couches 1-4 : OUI — Open-source disponible

**Reacher** (déjà identifié pour Dropcontact) couvre :
- Validation syntaxique
- MX verification
- SMTP handshake
- Catch-all detection
- Disposable email detection (base intégrée de 40 000+ domaines)

**Autres alternatives open-source :**

| Outil | Langage | Stars GitHub | Licence |
|-------|---------|-------------|---------|
| [Reacher](https://reacher.email/) | Rust | 15K+ | AGPL-3.0 |
| [check-if-email-exists](https://github.com/reacherhq/check-if-email-exists) | Rust | 15K+ | AGPL-3.0 (c'est le cœur de Reacher) |
| [email-verify](https://github.com/EmailVerify/email-verify) | Node.js | 1K+ | MIT |
| [truemail](https://github.com/truemail-rb/truemail) | Ruby | 1K+ | MIT |
| [email-verifier](https://github.com/AfterShip/email-verifier) | Go | 1K+ | MIT |

### Couche 5 : NON — Propriétaire

Les fonctionnalités avancées (spam traps, abuse emails, toxic scoring) ne sont **pas reproductibles** car elles reposent sur des bases de données propriétaires que ZeroBounce a construites sur des années.

### Impact de la couche 5 sur le projet

**Pour 200 prospects/mois, la couche 5 est non-critique** :
- Les spam traps sont un risque pour les envois en masse (10 000+/mois)
- La détection d'abuse emails est utile mais pas bloquante en cold email B2B
- Le toxic scoring est un "nice to have"

**En revanche, pour la Phase 2+ (envois massifs)**, ZeroBounce à 15 EUR/mois pourrait valoir le coup comme filet de sécurité.

## Verdict

| Critère | Score | Commentaire |
|---------|-------|-------------|
| Faisabilité technique | 8/10 | 80% reproductible via Reacher, 20% propriétaire |
| Coût de développement | 9/10 | Zéro dev supplémentaire si Reacher est déjà déployé |
| Fiabilité | 7/10 | Reacher est fiable pour le SMTP, mais pas de spam trap detection |
| Conformité RGPD | 9/10 | Vérification SMTP = pas de collecte de données |
| Scalabilité | 6/10 | Même contrainte d'IP que pour l'email finding |

**Recommandation : REMPLACER par Reacher pour les phases 0-1**
- Économie : 15 EUR/mois = 180 EUR/an
- Réintroduire ZeroBounce en Phase 2 si les volumes dépassent 500/mois
- Alternative intermédiaire : garder ZeroBounce **uniquement** comme vérification finale (15 EUR = le service le moins cher de la liste)

## Sources

- [ZeroBounce — How it works](https://www.zerobounce.net)
- [Reacher — Open-Source Email Verification](https://reacher.email/)
- [Open-source Email Verification Tools](https://www.usebouncer.com/open-source-email-verification/)
- [Top Open-Source Email Validation Libraries 2026](https://www.abstractapi.com/guides/email-validation/open-source-email-validation)
