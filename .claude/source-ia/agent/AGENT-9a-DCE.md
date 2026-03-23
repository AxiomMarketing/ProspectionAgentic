# SOUS-AGENT 9a — ANALYSEUR DCE
**Agent parent** : AGENT-9-MASTER.md

---

---

## 3.1 SOUS-AGENT 9a -- ANALYSEUR DCE

> Ancien nom : "Analyseur CCTP" -- renomme "Analyseur DCE" car il analyse l'ENSEMBLE du DCE (RC + CCTP + CCAP), pas seulement le CCTP. **[FUSION]**

## 9a.1 Mission precise

**Ce qu'il fait** :
- **[JONATHAN]** Parse le DCE COMPLET : RC (Reglement de la Consultation), CCTP (Cahier des Clauses Techniques Particulieres), CCAP (Cahier des Clauses Administratives Particulieres), AE, BPU
- **[JONATHAN]** Analyse le RC : criteres d'attribution, sous-criteres, ponderations, pieces exigees
- **[JONATHAN]** Analyse le CCAP : penalites, garanties, assurances, delais contractuels
- **[JONATHAN]** Extrait CHAQUE exigence individuellement avec classification (ELIMINATOIRE / OBLIGATOIRE / SOUHAITABLE) et identifiant unique (EX-001, EX-002...)
- **[JONATHAN]** Detecte automatiquement les criteres RSE/DD/RGAA avec FLAGS conditionnels (ACTIVER_SECTION_RSE, ACTIVER_VOLET_SOCIAL, ACTIVER_SECTION_RGAA)
- **[JONATHAN]** Genere des questions pertinentes a poser a l'acheteur
- **[JONATHAN]** Detecte les marches "fausses" (cahier des charges sur-mesure pour un prestataire sortant)
- **[JONATHAN]** Repere les ambiguites et incoherences du cahier des charges
- **[NOUS]** Utilise une approche hybride : PyMuPDF (texte brut) + Claude Vision API (tableaux/mise en page complexe)
- **[NOUS]** Produit un JSON structure via Structured Outputs (schema garanti, pas de deviation)
- **[NOUS]** Identifie les "mots-cles miroir" a reprendre verbatim dans le memoire technique
- **[NOUS]** Detecte automatiquement si le PDF est natif ou scan (pour activer OCR si necessaire)
- **[NOUS]** Gere les CCTP > 100 pages par chunking intelligent

**Ce qu'il ne fait PAS** :
- Il ne prend PAS la decision GO/NO-GO (c'est le 9b)
- Il ne redige PAS le memoire (c'est le 9c)
- Il ne contacte PAS l'acheteur

---

## 9a.2 Architecture technique **[NOUS]**

| Composant | Service | Cout | Notes |
|-----------|---------|------|-------|
| **PyMuPDF (fitz)** | Extraction texte PDF | 0 EUR | Open source, < 1 sec/page |
| **pdfplumber** | Extraction tableaux | 0 EUR | Complement pour tableaux |
| **Claude Vision API** | Analyse visuelle pages complexes | ~0.50-1.50 EUR/CCTP | 1,500-3,000 tokens/page |
| **Tesseract OCR** | OCR pour CCTP scannes | 0 EUR | Fallback si scan ancien |
| **Azure Document Intelligence** | OCR premium (optionnel) | ~0.05-0.10 EUR/page | Si precision critique |

### Comparaison des outils de parsing **[NOUS]**

| Critere | Claude Vision (PDF) | PyMuPDF (fitz) | pdfplumber | Azure Doc Intel | Tesseract OCR |
|---------|-------------------|-----------------|-------------|-----------------|---------------|
| **Tableaux complexes** | Excellent | Faible | Bon | Excellent | Faible |
| **Mise en page dense** | Excellent | Moyen | Moyen | Excellent | Bon |
| **PDF scanne (OCR)** | Moyen | Non supporte | Non supporte | Excellent | Bon |
| **Extraction JSON** | Excellent | Moyen | Bon | Bon | Faible |
| **Cout par page** | 1,500-3,000 tokens | Gratuit | Gratuit | ~0.05-0.10 EUR | Gratuit |
| **Temps reponse** | 2-5 sec | < 1 sec | < 1 sec | 3-10 sec | 5-30 sec |

---

## 9a.3 Approche hybride recommandee **[NOUS]**

```
ETAPE 1 : Detection type PDF
+-- PyMuPDF : extraire texte brut
+-- Si texte > 100 caracteres/page : PDF natif (OK)
+-- Si texte < 100 caracteres/page : PDF scanne (activer OCR)
+-- Stocker metadata : nb_pages, taille, date_creation

ETAPE 2 : Extraction texte + structure (PyMuPDF/pdfplumber)
+-- PyMuPDF : texte brut par page, headers, footers
+-- pdfplumber : extraction tableaux (criteres evaluation, lots, etc.)
+-- Temps : 5-10 secondes pour CCTP 50-100 pages
+-- Resultat : texte_brut + tableaux_json

ETAPE 3 : Analyse IA (Claude Vision API)
+-- Envoyer texte_brut + tableaux a Claude avec Structured Outputs
+-- Si pages complexes detectees : envoyer images (Vision)
+-- Extraction JSON structuree (sections fusionnees RC + CCTP + CCAP)
+-- Temps : 10-30 secondes
+-- Resultat : JSON DCEAnalysis complet

ETAPE 4 : Post-traitement
+-- Validation du JSON (schema validation)
+-- Calcul champs derives (jours_avant_deadline, etc.)
+-- Generation des FLAGS conditionnels [JONATHAN]
+-- Generation de la liste d'exigences EX-001..EX-NNN [JONATHAN]
+-- Detection marche "fausse" [JONATHAN]
+-- Stockage PostgreSQL
+-- Transmission au sous-agent 9b (Qualificateur + Decideur)
```

---

## 9a.4 Schema JSON de sortie FUSIONNE **[FUSION]**

> Ce schema combine nos 12 sections originales + les exigences individuelles de Jonathan (EX-001...) + les FLAGS conditionnels de Jonathan + l'analyse RC/CCAP de Jonathan.

```typescript
// agents/appels-offres/9a-analyseur-dce/types.ts

// ============================================================
// FORMAT D'EXIGENCE INDIVIDUELLE [JONATHAN]
// Chaque exigence du DCE est extraite avec un ID unique
// ============================================================
interface ExigenceIndividuelle {
  id: string                                    // "EX-001", "EX-002", etc.
  classification: 'ELIMINATOIRE' | 'OBLIGATOIRE' | 'SOUHAITABLE'
  source_document: 'RC' | 'CCTP' | 'CCAP' | 'AE' | 'BPU' | 'AUTRE'
  source_article: string                        // "CCTP article 4.2.1"
  libelle: string                               // "Le site doit etre conforme RGAA 4.1 niveau AA"
  type_exigence: 'conformite_reglementaire' | 'technique' | 'fonctionnelle' |
                 'performance' | 'infrastructure' | 'integration' | 'securite' |
                 'accessibilite' | 'formation' | 'maintenance' | 'organisationnelle' |
                 'administrative' | 'financiere'
  impact_axiom: string                          // "Axiom maitrise — reference Cyclea"
  preuve_requise: string | null                 // "Fournir attestation de conformite post-livraison"
  score_axiom: 1 | 2 | 3 | 4 | 5              // Pre-scoring capacite Axiom
  lot_concerne: number | null                   // Numero de lot si multi-lot
}

// ============================================================
// FLAGS CONDITIONNELS [JONATHAN]
// Determinent quelles sections le Redacteur 9c doit activer
// ============================================================
interface FlagsConditionnels {
  ACTIVER_SECTION_RSE: boolean                  // RC mentionne "RSE", "eco-conception", "RGESN", etc.
  ACTIVER_VOLET_SOCIAL: boolean                 // RC mentionne "insertion", "clause sociale", "RQTH", etc.
  ACTIVER_SECTION_RGAA: boolean                 // RC/CCTP mentionne "RGAA", "accessibilite", "WCAG"
  details_rse: string | null                    // Verbatim du critere RSE si active
  details_social: string | null                 // Verbatim du critere social si active
  details_rgaa: string | null                   // Verbatim du critere RGAA si active
  sources_a_utiliser: string[]                  // ["SECTION-ECOCONCEPTION-MEMOIRE.md", "FICHE-RSE-AXIOM.md"]
}

// ============================================================
// ANALYSE DU RC [JONATHAN] — Nouveau par rapport a v1
// Le RC est le document MAITRE : il definit les criteres
// ============================================================
interface AnalyseRC {
  criteres_attribution: Array<{
    nom: string                                 // "Valeur technique"
    ponderation_pourcent: number                 // 60
    sous_criteres: Array<{
      nom: string                               // "Methodologie de projet"
      ponderation_pourcent: number              // 20
      recommandation_axiom: string              // "Mettre en avant : process 4-6 semaines, demos hebdo, Figma"
    }>
  }>
  ordre_importance: string                      // "Technique first (60%) > Prix (30%) > Delai (10%)"
  strategie_prix_recommandee: string | null     // "Se positionner 10-15% sous la moyenne estimee"
  variantes_autorisees: boolean
  pieces_exigees: string[]                      // ["Memoire technique", "BPU", "Planning", "DUME"]
  format_reponse: string | null                 // "PDF signe electroniquement"
  nombre_pages_max: number | null               // Si limite de pages imposee
}

// ============================================================
// ANALYSE DU CCAP [JONATHAN] — Nouveau par rapport a v1
// Clauses administratives : penalites, garanties, assurances
// ============================================================
interface AnalyseCCAP {
  penalites: Array<{
    type: string                                // "Retard de livraison"
    montant_ou_pourcentage: string              // "1/1000eme du montant par jour de retard"
    plafond: string | null                      // "Plafonne a 10% du montant du marche"
    severite: 1 | 2 | 3 | 4 | 5
  }>
  garanties: {
    retenue_garantie_pourcent: number | null     // 5
    garantie_premiere_demande: boolean
    caution_bancaire: boolean
  }
  assurances_requises: string[]                 // ["RC Professionnelle", "Garantie decennale"]
  delais_contractuels: {
    delai_execution_jours: number | null
    delai_maintenance_mois: number | null
    delai_paiement_jours: number | null         // Generalement 30j
    periode_garantie_mois: number | null
  }
  conditions_resiliation: string | null
  clause_revision_prix: boolean
  sous_traitance_autorisee: boolean
  groupement_autorise: boolean
  type_groupement: 'solidaire' | 'conjoint' | null
}

// ============================================================
// DETECTION MARCHE FAUSSE [JONATHAN]
// ============================================================
interface DetectionMarcheFausse {
  est_suspecte: boolean
  score_suspicion: number                       // 0-100
  indicateurs: Array<{
    type: 'specifications_ultra_specifiques' | 'delai_anormalement_court' |
          'criteres_sur_mesure' | 'reference_sortant_dans_cctp' |
          'budget_etrangement_precis' | 'techno_proprietaire_imposee'
    description: string
    severite: 1 | 2 | 3 | 4 | 5
  }>
  recommandation: string                        // "Probable renouvellement sortant — risque eleve"
}

// ============================================================
// QUESTIONS POUR L'ACHETEUR [JONATHAN]
// ============================================================
interface QuestionAcheteur {
  id: string                                    // "Q-001"
  question: string                              // "Pouvez-vous preciser les specs de l'API existante ?"
  source_ambiguite: string                      // "CCTP article 6.3 — pas de documentation API fournie"
  priorite: 'haute' | 'moyenne' | 'basse'
  impact_si_non_resolue: string                 // "Impossible de chiffrer l'integration correctement"
  deadline_question: string | null              // Date limite pour poser la question
}

// ============================================================
// SCHEMA PRINCIPAL DCEAnalysis [FUSION]
// Combine nos 12 sections + ajouts Jonathan
// ============================================================
interface DCEAnalysis {
  // --- SECTION 1 : Metadata [NOUS] ---
  metadata: {
    source_dce_filename: string                 // Renomme de source_cctp_filename
    documents_analyses: string[]                // [JONATHAN] Liste : ["RC", "CCTP", "CCAP", "AE"]
    acheteur: {
      nom: string
      siret: string | null
      contact_email: string | null
      region: string
    }
    marche_public_id: string | null
    boamp_reference: string
    date_publication: string | null
    date_deadline_candidature: string | null
    date_deadline_offre: string
    jours_avant_deadline: number
  }

  // --- SECTION 2 : Caracteristiques du marche [NOUS] ---
  caracteristiques_marche: {
    type_procedure: 'MAPA' | 'AO Ouvert' | 'AO Restreint' | 'Dialogue Competitif'
    estimation_budget: {
      montant_total_ht: number | null
      montant_annuel: number | null
      duree_marche_mois: number | null
      devise: 'EUR'
      inclus_tva: boolean
      fiabilite_estimation: string
    }
    lot_possible: boolean
    description_courte: string
    mots_cles: string[]
  }

  // --- SECTION 3 : Exigences techniques [NOUS] ---
  exigences_techniques: {
    lots: Array<{
      numero_lot: number
      nom: string
      type: 'IT' | 'Non-IT' | 'Infra' | 'Cloud' | 'Maintenance' | 'Support' | 'Formation'
      montant_estime: number | null
      description: string
      specs_cles: Array<{
        exigence: string
        valeur_requise: string
        cardinality: 'OBLIGATOIRE' | 'SOUHAITE' | 'OPTIONNEL'
        score_axiom: number
        raison: string
      }>
    }>
    technos_interdites: string[]
    versions_minimales_exigees: Record<string, string>
  }

  // --- SECTION 4 : Criteres d'evaluation [FUSION] ---
  // Enrichi avec l'analyse RC de Jonathan
  criteres_evaluation: Array<{
    nom: string
    ponderation_pourcent: number
    sous_criteres: Array<{
      nom: string
      ponderation_pourcent: number | null       // [JONATHAN] Ajout ponderation sous-critere
      recommandation_axiom: string | null       // [JONATHAN] Recommandation strategique par critere
    }>
  }>

  // --- SECTION 5 : Conditions de participation [NOUS] ---
  conditions_participation: {
    capacite_financiere: {
      chiffre_affaires_minimum: number | null
      ratio_endettement_max: number | null
      exigences: string
    }
    capacite_technique: string[]
    documents_obligatoires: string[]
    score_axiom_capacite: number
    raison_score: string
  }

  // --- SECTION 6 : Clauses RSE [NOUS] ---
  clauses_rse: Array<{
    type: 'Environnemental' | 'Social' | 'Economique' | 'Gouvernance'
    exigence: string
    poids_evaluation: string
    axiom_capacite: number
  }>

  // --- SECTION 7 : Delais et jalons [NOUS] ---
  delais: {
    delai_reponse: number
    delai_realisation_mois: number | null
    delai_maintenance_mois: number | null
    jalons_cles: Array<{
      nom: string
      mois: number
      deliverable: string | null
    }>
  }

  // --- SECTION 8 : Mots-cles miroir [NOUS] ---
  mots_cles_miroir: string[]

  // --- SECTION 9 : Risques Axiom [NOUS] ---
  risques_axiom: Array<{
    type: 'technique' | 'commercial' | 'delai' | 'rse' | 'juridique'
    description: string
    mitigation: string
    severite: 1 | 2 | 3 | 4 | 5
  }>

  // --- SECTION 10 : Scoring Axiom preliminaire [NOUS] ---
  scoring_axiom: {
    adequation_technique: {
      score: number
      justification: string
      briques_faibles: string[]
    }
    budget_rentabilite: {
      score: number
      estime_tjm_moyen: number | null
      margin_previsionnelle: number | null
      justification: string
    }
    delai_reponse: {
      score: number
      jours_avant_deadline: number
      justification: string
    }
    concurrence: {
      score: number
      estimation_concurrent: number | null
      justification: string
    }
    probabilite_gain: {
      score: number
      justification: string
      actions_augmenter: string[]
    }
    localisation: {
      score: number
      justification: string
    }
    rse_durabilite: {
      score: number
      justification: string
    }
  }

  // --- SECTION 11 : Decision preliminaire [NOUS] ---
  decision_preliminaire: {
    score_final: number
    decision: 'GO' | 'REVIEW' | 'NO-GO'
    reasoning: string
    conditions_go: string[]
  }

  // --- SECTION 12 : Template memoire [NOUS] ---
  template_memoire: {
    section_1_understanding: string
    section_2_expertise: string
    section_3_organisation: string
  }

  // ============================================================
  // SECTIONS AJOUTEES PAR LA FUSION [JONATHAN + FUSION]
  // ============================================================

  // --- SECTION 13 : Analyse RC detaillee [JONATHAN] ---
  analyse_rc: AnalyseRC

  // --- SECTION 14 : Analyse CCAP detaillee [JONATHAN] ---
  analyse_ccap: AnalyseCCAP

  // --- SECTION 15 : Exigences individuelles [JONATHAN] ---
  exigences_individuelles: ExigenceIndividuelle[]

  // --- SECTION 16 : FLAGS conditionnels [JONATHAN] ---
  flags_conditionnels: FlagsConditionnels

  // --- SECTION 17 : Detection marche fausse [JONATHAN] ---
  detection_marche_fausse: DetectionMarcheFausse

  // --- SECTION 18 : Questions pour l'acheteur [JONATHAN] ---
  questions_acheteur: QuestionAcheteur[]
}
```

---

## 9a.5 Extraction PDF avec PyMuPDF **[NOUS]**

```python
# agents/appels-offres/9a-analyseur-dce/extract_pdf.py

import fitz  # PyMuPDF
import pdfplumber
import json
import sys
from pathlib import Path


def extract_dce(pdf_path: str) -> dict:
    """
    Extraction hybride PyMuPDF + pdfplumber.
    Retourne le texte brut + tableaux + metadata.
    Fonctionne pour RC, CCTP, CCAP ou tout document du DCE.
    """
    result = {
        "metadata": {},
        "pages": [],
        "tables": [],
        "is_scanned": False,
        "total_pages": 0,
        "total_chars": 0
    }

    # --- ETAPE 1 : PyMuPDF pour texte brut ---
    doc = fitz.open(pdf_path)
    result["total_pages"] = len(doc)
    result["metadata"] = {
        "title": doc.metadata.get("title", ""),
        "author": doc.metadata.get("author", ""),
        "creation_date": doc.metadata.get("creationDate", ""),
        "page_count": len(doc)
    }

    total_chars = 0
    pages_with_little_text = 0

    for page_num, page in enumerate(doc):
        text = page.get_text("text")
        total_chars += len(text)

        if len(text) < 100:
            pages_with_little_text += 1

        result["pages"].append({
            "page_num": page_num + 1,
            "text": text,
            "char_count": len(text)
        })

    result["total_chars"] = total_chars

    # Detection scan : si > 50% des pages ont peu de texte
    if result["total_pages"] > 0:
        scan_ratio = pages_with_little_text / result["total_pages"]
        result["is_scanned"] = scan_ratio > 0.5

    doc.close()

    # --- ETAPE 2 : pdfplumber pour les tableaux ---
    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages):
            tables = page.extract_tables()
            for table_idx, table in enumerate(tables):
                if table and len(table) > 1:  # Au moins header + 1 ligne
                    result["tables"].append({
                        "page_num": page_num + 1,
                        "table_index": table_idx,
                        "headers": table[0] if table[0] else [],
                        "rows": table[1:],
                        "row_count": len(table) - 1
                    })

    return result


def run_ocr_if_scanned(pdf_path: str) -> str:
    """
    Si le PDF est scanne, lancer Tesseract OCR.
    Retourne le texte OCR.
    """
    import subprocess

    output_text = ""
    doc = fitz.open(pdf_path)

    for page_num in range(len(doc)):
        page = doc[page_num]
        pix = page.get_pixmap(matrix=fitz.Matrix(300/72, 300/72))
        img_path = f"/tmp/dce_page_{page_num}.png"
        pix.save(img_path)

        try:
            result = subprocess.run(
                ["tesseract", img_path, "stdout", "-l", "fra", "--oem", "3"],
                capture_output=True, text=True, timeout=60
            )
            output_text += f"\n--- PAGE {page_num + 1} ---\n"
            output_text += result.stdout
        except Exception as e:
            output_text += f"\n--- PAGE {page_num + 1} : OCR ECHOUE ({e}) ---\n"

    doc.close()
    return output_text


if __name__ == "__main__":
    pdf_path = sys.argv[1]
    result = extract_dce(pdf_path)

    if result["is_scanned"]:
        ocr_text = run_ocr_if_scanned(pdf_path)
        result["ocr_text"] = ocr_text

    print(json.dumps(result, ensure_ascii=False, indent=2))
```

---

## 9a.6 Prompt Claude pour extraction structuree **[FUSION]**

> Ce prompt fusionne notre prompt original (12 sections) avec les exigences de Jonathan (analyse RC, CCAP, exigences individuelles, FLAGS, detection marche fausse, questions acheteur).

```
SYSTEM PROMPT :

Tu es un expert analyste de marches publics francais specialise en appels d'offres IT.
Ta tache : extraire TOUS les elements critiques d'un DCE (Dossier de Consultation des Entreprises)
comprenant le RC, le CCTP et le CCAP, et structurer le resultat en JSON rigoureusement schematise.

REGLES ABSOLUES :
1. Extraction fidele : reprendre verbatim criteres/montants/delais du DCE
2. Pas de hallucination : si info absente, indiquer null ou "NON SPECIFIE" explicitement
3. Reaction seuils critiques : si delai < 10j OU budget < 40k EUR OU techno incompatible, SIGNALER
4. Schema JSON strict : respecter le format fourni, pas de deviation
5. ANALYSER TOUS LES DOCUMENTS : RC + CCTP + CCAP (pas juste le CCTP)
6. CHAQUE exigence = 1 entree EX-NNN avec classification ELIMINATOIRE/OBLIGATOIRE/SOUHAITABLE
7. DETECTER les FLAGS conditionnels (RSE, Social, RGAA)
8. EVALUER si le marche semble "faux" (sur-mesure pour sortant)

CONTEXTE AXIOM MARKETING :
- Agence web/mobile fondee en 2010 par Jonathan Dewaele (15+ ans experience)
- Stack : React, TypeScript, AdonisJS (Node.js), Flutter, Shopify
- Equipe : Jonathan (fondateur, direction), Marty (5+ ans, dev fullstack)
- References : Cyclea, Pop and Shoes, Iconic, Ivimed, collectivites
- Base : France et international (PAS juste La Reunion)
- Sweet spot budget : 5k-300k EUR (optimal 15-80k)
- Forces : accessibilite RGAA, e-commerce, applications metier, sites publics

---

EXTRACTION DEMANDEE :

**SECTION 1 - METADATA (Obligatoire)**
- Acheteur (nom, siret, region, contact email)
- Numero marche public + ref BOAMP
- Dates publication + deadline reponse + deadline offre
- Jours avant deadline (calcule automatiquement)
- LISTE des documents analyses (RC, CCTP, CCAP, etc.) [JONATHAN]

**SECTION 2 - CARACTERISTIQUES MARCHE**
- Type procedure (MAPA / AO Ouvert / AO Restreint)
- Montant estimation total HT + montant annuel + devise
- Duree marche (mois)
- Decomposition en lots (Y/N)
- Description courte (max 200 mots)
- Mots-cles extraits (10-15 mots cles techniques)

**SECTION 3 - EXIGENCES TECHNIQUES**
Pour CHAQUE lot (si multi-lot) :
  - Numero + nom lot
  - Type lot (IT / Non-IT / Infra / Cloud / Maintenance / etc)
  - Montant estime lot
  - Description courte
  - Specifications CLES :
    * Champ exigence, valeur requise, cardinality, score Axiom 1-5, raison score

**SECTION 4 - CRITERES D'EVALUATION (ENRICHI)** [FUSION]
- Listage complet criteres d'attribution (du RC)
- Ponderation chacun (% ou points)
- Sous-criteres avec leur ponderation individuelle [JONATHAN]
- Recommandation strategique Axiom PAR sous-critere [JONATHAN]
- Strategie prix recommandee [JONATHAN]
- Variantes autorisees ? [JONATHAN]
- Order importance (technique first ? prix first ?)

**SECTION 5 - CONDITIONS PARTICIPATION**
- Capacite financiere (CA minimum, ratio endettement, etc)
- Capacite technique (references minimum, equipe, certifications)
- Documents obligatoires
- Score Axiom realisme participation (1-5)

**SECTION 6 - CLAUSES RSE**
Pour chaque clause RSE identifiee :
- Type (Environnemental / Social / Economique / Gouvernance)
- Exigence exacte (verbatim DCE)
- Poids notation (Critere ? Clause d'execution ?)
- Score Axiom capacite (1-5)

**SECTION 7 - DELAIS & JALONS**
- Delai reponse + delai realisation + delai maintenance
- Jalons cles (mois + deliverable)

**SECTION 8 - MOTS-CLES MIROIR**
15-20 mots-cles du DCE a reprendre VERBATIM dans le memoire technique

**SECTION 9 - RISQUES AXIOM**
3-5 risques specifiques avec mitigation proposee

**SECTION 10 - SCORING AXIOM PRELIMINAIRE**
Pre-scorer 7 criteres GO/NO-GO (0-5 chacun)
Calculer SCORE FINAL = Somme(Critere_i x Poids_i)

**SECTION 11 - DECISION PRELIMINAIRE**
DECISION : "GO" / "REVIEW" / "NO-GO" avec reasoning

**SECTION 12 - TEMPLATE MEMOIRE TECHNIQUE**
Sections understanding, expertise, organisation

**SECTION 13 - ANALYSE RC DETAILLEE** [JONATHAN]
- Criteres d'attribution avec sous-criteres ET recommandations par critere
- Pieces exigees, format reponse, limite de pages
- Strategie prix si applicable

**SECTION 14 - ANALYSE CCAP** [JONATHAN]
- Penalites (type, montant, plafond, severite)
- Garanties (retenue garantie, caution bancaire)
- Assurances requises
- Delais contractuels (execution, maintenance, paiement, garantie)
- Sous-traitance/groupement autorise ?

**SECTION 15 - EXIGENCES INDIVIDUELLES** [JONATHAN]
Pour CHAQUE exigence du DCE, creer une entree :
  EX-NNN [ELIMINATOIRE|OBLIGATOIRE|SOUHAITABLE]
  Source  : [Document] article [X.Y.Z]
  Libelle : [Texte exact]
  Type    : [Classification]
  Impact  : [Evaluation capacite Axiom]
  Preuve  : [Ce qui est demande comme preuve]
  Score   : [1-5]

**SECTION 16 - FLAGS CONDITIONNELS** [JONATHAN]
Scanner le RC + CCTP pour detecter :
- RSE / Developpement durable / Eco-conception / RGESN → ACTIVER_SECTION_RSE
- Insertion / Clause sociale / RQTH / Apprentissage → ACTIVER_VOLET_SOCIAL
- RGAA / Accessibilite / WCAG / Handicap numerique → ACTIVER_SECTION_RGAA
REGLE : Ne deployer les sections QUE si le RC les demande

**SECTION 17 - DETECTION MARCHE FAUSSE** [JONATHAN]
Evaluer les indicateurs de suspicion :
- Specifications ultra-specifiques (marque/modele impose)
- Delai anormalement court
- Criteres sur-mesure pour un sortant
- Reference au prestataire sortant dans le CCTP
- Budget etrangement precis
- Techno proprietaire imposee
Score suspicion 0-100 + recommandation

**SECTION 18 - QUESTIONS POUR L'ACHETEUR** [JONATHAN]
Generer les questions pertinentes :
- Q-NNN : Question + source ambiguite + priorite + impact si non resolue + deadline

---

OUTPUT FORMAT : JSON STRICT (Structured Outputs)
Respecter le schema JSON-Schema fourni en annexe, pas de deviation.
Si champ absent du DCE -> null ou "NON SPECIFIE" explicitement.
```

---

## 9a.7 Appel API Claude pour extraction **[FUSION]**

```typescript
// agents/appels-offres/9a-analyseur-dce/claude-extract.ts

import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs'
import * as path from 'path'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ============================================================
// Schema JSON pour Structured Outputs [FUSION]
// Combine notre schema original + champs Jonathan
// ============================================================
const dceExtractionSchema = {
  type: 'object' as const,
  properties: {
    // --- Sections 1-12 : identiques a v1 (voir schema complet ci-dessus) ---
    metadata: {
      type: 'object' as const,
      properties: {
        source_dce_filename: { type: 'string' as const },
        documents_analyses: { type: 'array' as const, items: { type: 'string' as const } },
        acheteur: {
          type: 'object' as const,
          properties: {
            nom: { type: 'string' as const },
            siret: { type: ['string', 'null'] as const },
            contact_email: { type: ['string', 'null'] as const },
            region: { type: 'string' as const }
          },
          required: ['nom', 'region']
        },
        boamp_reference: { type: 'string' as const },
        date_deadline_offre: { type: 'string' as const },
        jours_avant_deadline: { type: 'integer' as const }
      },
      required: ['acheteur', 'date_deadline_offre', 'documents_analyses']
    },
    caracteristiques_marche: {
      type: 'object' as const,
      properties: {
        type_procedure: {
          type: 'string' as const,
          enum: ['MAPA', 'AO Ouvert', 'AO Restreint', 'Dialogue Competitif']
        },
        estimation_budget: {
          type: 'object' as const,
          properties: {
            montant_total_ht: { type: ['integer', 'null'] as const },
            montant_annuel: { type: ['integer', 'null'] as const },
            duree_marche_mois: { type: ['integer', 'null'] as const }
          }
        },
        lot_possible: { type: 'boolean' as const },
        description_courte: { type: 'string' as const },
        mots_cles: { type: 'array' as const, items: { type: 'string' as const } }
      }
    },
    exigences_techniques: {
      type: 'object' as const,
      properties: {
        lots: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              numero_lot: { type: 'integer' as const },
              nom: { type: 'string' as const },
              type: {
                type: 'string' as const,
                enum: ['IT', 'Non-IT', 'Infra', 'Cloud', 'Maintenance', 'Support', 'Formation']
              },
              montant_estime: { type: ['integer', 'null'] as const },
              specs_cles: {
                type: 'array' as const,
                items: {
                  type: 'object' as const,
                  properties: {
                    exigence: { type: 'string' as const },
                    valeur_requise: { type: 'string' as const },
                    cardinality: {
                      type: 'string' as const,
                      enum: ['OBLIGATOIRE', 'SOUHAITE', 'OPTIONNEL']
                    },
                    score_axiom: { type: 'integer' as const, minimum: 1, maximum: 5 },
                    raison: { type: 'string' as const }
                  }
                }
              }
            }
          }
        },
        technos_interdites: { type: 'array' as const, items: { type: 'string' as const } }
      }
    },
    criteres_evaluation: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          nom: { type: 'string' as const },
          ponderation_pourcent: { type: 'number' as const },
          sous_criteres: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                nom: { type: 'string' as const },
                ponderation_pourcent: { type: ['number', 'null'] as const },
                recommandation_axiom: { type: ['string', 'null'] as const }
              }
            }
          }
        }
      }
    },
    conditions_participation: {
      type: 'object' as const,
      properties: {
        capacite_financiere: {
          type: 'object' as const,
          properties: {
            chiffre_affaires_minimum: { type: ['number', 'null'] as const },
            exigences: { type: 'string' as const }
          }
        },
        capacite_technique: { type: 'array' as const, items: { type: 'string' as const } },
        documents_obligatoires: { type: 'array' as const, items: { type: 'string' as const } },
        score_axiom_capacite: { type: 'integer' as const, minimum: 1, maximum: 5 }
      }
    },
    clauses_rse: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          type: { type: 'string' as const, enum: ['Environnemental', 'Social', 'Economique', 'Gouvernance'] },
          exigence: { type: 'string' as const },
          poids_evaluation: { type: 'string' as const },
          axiom_capacite: { type: 'integer' as const, minimum: 1, maximum: 5 }
        }
      }
    },
    delais: {
      type: 'object' as const,
      properties: {
        delai_reponse: { type: 'integer' as const },
        delai_realisation_mois: { type: ['integer', 'null'] as const },
        delai_maintenance_mois: { type: ['integer', 'null'] as const },
        jalons_cles: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              nom: { type: 'string' as const },
              mois: { type: 'integer' as const },
              deliverable: { type: ['string', 'null'] as const }
            }
          }
        }
      }
    },
    mots_cles_miroir: { type: 'array' as const, items: { type: 'string' as const } },
    risques_axiom: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          type: { type: 'string' as const, enum: ['technique', 'commercial', 'delai', 'rse', 'juridique'] },
          description: { type: 'string' as const },
          mitigation: { type: 'string' as const },
          severite: { type: 'integer' as const, minimum: 1, maximum: 5 }
        }
      }
    },
    scoring_axiom: {
      type: 'object' as const,
      properties: {
        adequation_technique: {
          type: 'object' as const,
          properties: {
            score: { type: 'integer' as const, minimum: 0, maximum: 5 },
            justification: { type: 'string' as const },
            briques_faibles: { type: 'array' as const, items: { type: 'string' as const } }
          }
        },
        budget_rentabilite: {
          type: 'object' as const,
          properties: {
            score: { type: 'integer' as const, minimum: 0, maximum: 5 },
            estime_tjm_moyen: { type: ['number', 'null'] as const },
            margin_previsionnelle: { type: ['number', 'null'] as const },
            justification: { type: 'string' as const }
          }
        },
        delai_reponse: {
          type: 'object' as const,
          properties: {
            score: { type: 'integer' as const, minimum: 0, maximum: 5 },
            jours_avant_deadline: { type: 'integer' as const },
            justification: { type: 'string' as const }
          }
        },
        concurrence: {
          type: 'object' as const,
          properties: {
            score: { type: 'integer' as const, minimum: 0, maximum: 5 },
            estimation_concurrent: { type: ['integer', 'null'] as const },
            justification: { type: 'string' as const }
          }
        },
        probabilite_gain: {
          type: 'object' as const,
          properties: {
            score: { type: 'integer' as const, minimum: 0, maximum: 5 },
            justification: { type: 'string' as const },
            actions_augmenter: { type: 'array' as const, items: { type: 'string' as const } }
          }
        },
        localisation: {
          type: 'object' as const,
          properties: {
            score: { type: 'integer' as const, minimum: 0, maximum: 5 },
            justification: { type: 'string' as const }
          }
        },
        rse_durabilite: {
          type: 'object' as const,
          properties: {
            score: { type: 'integer' as const, minimum: 0, maximum: 5 },
            justification: { type: 'string' as const }
          }
        }
      }
    },
    decision_preliminaire: {
      type: 'object' as const,
      properties: {
        score_final: { type: 'number' as const },
        decision: { type: 'string' as const, enum: ['GO', 'REVIEW', 'NO-GO'] },
        reasoning: { type: 'string' as const },
        conditions_go: { type: 'array' as const, items: { type: 'string' as const } }
      },
      required: ['score_final', 'decision', 'reasoning']
    },

    // ============================================================
    // SECTIONS AJOUTEES [JONATHAN]
    // ============================================================
    analyse_rc: {
      type: 'object' as const,
      properties: {
        criteres_attribution: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              nom: { type: 'string' as const },
              ponderation_pourcent: { type: 'number' as const },
              sous_criteres: {
                type: 'array' as const,
                items: {
                  type: 'object' as const,
                  properties: {
                    nom: { type: 'string' as const },
                    ponderation_pourcent: { type: 'number' as const },
                    recommandation_axiom: { type: 'string' as const }
                  }
                }
              }
            }
          }
        },
        ordre_importance: { type: 'string' as const },
        strategie_prix_recommandee: { type: ['string', 'null'] as const },
        variantes_autorisees: { type: 'boolean' as const },
        pieces_exigees: { type: 'array' as const, items: { type: 'string' as const } },
        format_reponse: { type: ['string', 'null'] as const },
        nombre_pages_max: { type: ['integer', 'null'] as const }
      }
    },
    analyse_ccap: {
      type: 'object' as const,
      properties: {
        penalites: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              type: { type: 'string' as const },
              montant_ou_pourcentage: { type: 'string' as const },
              plafond: { type: ['string', 'null'] as const },
              severite: { type: 'integer' as const, minimum: 1, maximum: 5 }
            }
          }
        },
        garanties: {
          type: 'object' as const,
          properties: {
            retenue_garantie_pourcent: { type: ['number', 'null'] as const },
            garantie_premiere_demande: { type: 'boolean' as const },
            caution_bancaire: { type: 'boolean' as const }
          }
        },
        assurances_requises: { type: 'array' as const, items: { type: 'string' as const } },
        delais_contractuels: {
          type: 'object' as const,
          properties: {
            delai_execution_jours: { type: ['integer', 'null'] as const },
            delai_maintenance_mois: { type: ['integer', 'null'] as const },
            delai_paiement_jours: { type: ['integer', 'null'] as const },
            periode_garantie_mois: { type: ['integer', 'null'] as const }
          }
        },
        sous_traitance_autorisee: { type: 'boolean' as const },
        groupement_autorise: { type: 'boolean' as const },
        type_groupement: { type: ['string', 'null'] as const, enum: ['solidaire', 'conjoint', null] }
      }
    },
    exigences_individuelles: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          id: { type: 'string' as const },
          classification: { type: 'string' as const, enum: ['ELIMINATOIRE', 'OBLIGATOIRE', 'SOUHAITABLE'] },
          source_document: { type: 'string' as const, enum: ['RC', 'CCTP', 'CCAP', 'AE', 'BPU', 'AUTRE'] },
          source_article: { type: 'string' as const },
          libelle: { type: 'string' as const },
          type_exigence: { type: 'string' as const },
          impact_axiom: { type: 'string' as const },
          preuve_requise: { type: ['string', 'null'] as const },
          score_axiom: { type: 'integer' as const, minimum: 1, maximum: 5 },
          lot_concerne: { type: ['integer', 'null'] as const }
        }
      }
    },
    flags_conditionnels: {
      type: 'object' as const,
      properties: {
        ACTIVER_SECTION_RSE: { type: 'boolean' as const },
        ACTIVER_VOLET_SOCIAL: { type: 'boolean' as const },
        ACTIVER_SECTION_RGAA: { type: 'boolean' as const },
        details_rse: { type: ['string', 'null'] as const },
        details_social: { type: ['string', 'null'] as const },
        details_rgaa: { type: ['string', 'null'] as const },
        sources_a_utiliser: { type: 'array' as const, items: { type: 'string' as const } }
      }
    },
    detection_marche_fausse: {
      type: 'object' as const,
      properties: {
        est_suspecte: { type: 'boolean' as const },
        score_suspicion: { type: 'integer' as const, minimum: 0, maximum: 100 },
        indicateurs: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              type: { type: 'string' as const },
              description: { type: 'string' as const },
              severite: { type: 'integer' as const, minimum: 1, maximum: 5 }
            }
          }
        },
        recommandation: { type: 'string' as const }
      }
    },
    questions_acheteur: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          id: { type: 'string' as const },
          question: { type: 'string' as const },
          source_ambiguite: { type: 'string' as const },
          priorite: { type: 'string' as const, enum: ['haute', 'moyenne', 'basse'] },
          impact_si_non_resolue: { type: 'string' as const },
          deadline_question: { type: ['string', 'null'] as const }
        }
      }
    }
  },
  required: ['metadata', 'caracteristiques_marche', 'decision_preliminaire',
             'analyse_rc', 'exigences_individuelles', 'flags_conditionnels',
             'detection_marche_fausse']
}


// ============================================================
// FONCTION PRINCIPALE [FUSION]
// Analyse multi-documents : RC + CCTP + CCAP
// ============================================================
async function analyzeDCE(
  dceFiles: Array<{ path: string; type: 'RC' | 'CCTP' | 'CCAP' | 'AE' | 'BPU' | 'AUTRE' }>,
  boampReference: string,
  extractedTexts: Record<string, string>,        // { RC: "...", CCTP: "...", CCAP: "..." }
  extractedTables: any[]
): Promise<DCEAnalysis> {

  const userContent: any[] = []

  // [FUSION] Construire le prompt avec TOUS les documents du DCE
  let fullPrompt = `Tu es analyste DCE pour Axiom Marketing (agence web IT, France et international).

Analyse ce DCE COMPLET (tous les documents fournis) et extrais TOUS les champs du schema JSON.

DOCUMENTS FOURNIS :`

  for (const [docType, text] of Object.entries(extractedTexts)) {
    fullPrompt += `\n\n=== ${docType} ===\n${text.substring(0, 60000)}\n=== FIN ${docType} ===`
  }

  if (extractedTables.length > 0) {
    fullPrompt += `\n\n=== TABLEAUX EXTRAITS ===\n${JSON.stringify(extractedTables, null, 2).substring(0, 30000)}\n=== FIN TABLEAUX ===`
  }

  fullPrompt += `\n\nReference BOAMP : ${boampReference}

INSTRUCTIONS CRITIQUES :
1. Analyser le RC en priorite pour les criteres d'attribution et ponderations
2. Pour CHAQUE exigence trouvee, creer une entree EX-NNN
3. Scanner pour les FLAGS conditionnels (RSE, Social, RGAA)
4. Evaluer si le marche semble "faux" (sur-mesure sortant)
5. Generer les questions pertinentes pour l'acheteur
6. Pre-scorer les 7 criteres GO/NO-GO

OUTPUT : JSON STRICT, pas de deviation schema.`

  userContent.push({ type: 'text', text: fullPrompt })

  // [NOUS] Ajouter les PDFs en documents si taille raisonnable
  for (const file of dceFiles) {
    const fileStats = fs.statSync(file.path)
    if (fileStats.size < 30 * 1024 * 1024) {
      const pdfBuffer = fs.readFileSync(file.path)
      userContent.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: pdfBuffer.toString('base64')
        }
      })
    }
  }

  // [NOUS] Appel Claude API avec Structured Outputs
  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16384,        // Augmente de 8192 a 16384 pour les sections additionnelles
    messages: [
      {
        role: 'user',
        content: userContent
      }
    ],
    // @ts-ignore - Structured Outputs beta
    output_format: {
      type: 'json_schema',
      json_schema: {
        name: 'dce_analysis',
        schema: dceExtractionSchema,
        strict: true
      }
    }
  })

  const resultJson: DCEAnalysis = JSON.parse(
    message.content[0].type === 'text' ? message.content[0].text : '{}'
  )

  // [NOUS] Post-traitement : calculer jours avant deadline
  if (resultJson.metadata?.date_deadline_offre) {
    const deadline = new Date(resultJson.metadata.date_deadline_offre)
    resultJson.metadata.jours_avant_deadline = Math.floor(
      (deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    )
  }

  return resultJson
}

export { analyzeDCE, DCEAnalysis }
```

---

## 9a.8 Gestion des DCE > 100 pages **[NOUS]**

```typescript
// agents/appels-offres/9a-analyseur-dce/chunking.ts

/**
 * Si le DCE depasse 100 pages, le decouper en segments
 * pour respecter les limites Claude API.
 * [FUSION] Adapte pour gerer multi-documents (RC + CCTP + CCAP)
 */
async function analyzeChunkedDCE(
  extractedPages: Record<string, Array<{ page_num: number; text: string }>>,
  boampReference: string,
  dceFiles: Array<{ path: string; type: string }>
): Promise<DCEAnalysis> {

  const CHUNK_SIZE = 80  // pages par chunk

  // Calculer le total de pages tous documents confondus
  const totalPages = Object.values(extractedPages).reduce(
    (sum, pages) => sum + pages.length, 0
  )

  if (totalPages <= CHUNK_SIZE) {
    // Pas besoin de chunking
    const extractedTexts: Record<string, string> = {}
    for (const [docType, pages] of Object.entries(extractedPages)) {
      extractedTexts[docType] = pages.map(p => p.text).join('\n\n')
    }
    return analyzeDCE(dceFiles, boampReference, extractedTexts, [])
  }

  // [FUSION] Strategie : toujours analyser RC et CCAP en entier (courts),
  // chunker seulement le CCTP (le plus long)
  const extractedTexts: Record<string, string> = {}

  // RC et CCAP : toujours en entier
  if (extractedPages['RC']) {
    extractedTexts['RC'] = extractedPages['RC'].map(p => p.text).join('\n\n')
  }
  if (extractedPages['CCAP']) {
    extractedTexts['CCAP'] = extractedPages['CCAP'].map(p => p.text).join('\n\n')
  }

  // CCTP : chunker si necessaire
  const cctpPages = extractedPages['CCTP'] || []
  if (cctpPages.length <= CHUNK_SIZE) {
    extractedTexts['CCTP'] = cctpPages.map(p => p.text).join('\n\n')
    return analyzeDCE(dceFiles, boampReference, extractedTexts, [])
  }

  // Chunker le CCTP
  const chunks: string[] = []
  for (let i = 0; i < cctpPages.length; i += CHUNK_SIZE) {
    const chunk = cctpPages.slice(i, i + CHUNK_SIZE)
    chunks.push(chunk.map(p => `--- PAGE ${p.page_num} ---\n${p.text}`).join('\n\n'))
  }

  // Analyser chaque chunk avec le RC et CCAP complets
  const partialResults: Partial<DCEAnalysis>[] = []
  for (const [idx, chunk] of chunks.entries()) {
    console.log(`Analyse chunk CCTP ${idx + 1}/${chunks.length}...`)
    const chunkTexts = { ...extractedTexts, CCTP: chunk }
    const partial = await analyzeDCE(dceFiles, boampReference, chunkTexts, [])
    partialResults.push(partial)
  }

  return mergeDCEAnalyses(partialResults)
}

function mergeDCEAnalyses(parts: Partial<DCEAnalysis>[]): DCEAnalysis {
  const base = parts[0] as DCEAnalysis

  // Fusionner les lots de tous les chunks
  const allLots: DCEAnalysis['exigences_techniques']['lots'] = []
  for (const part of parts) {
    if (part.exigences_techniques?.lots) {
      allLots.push(...part.exigences_techniques.lots)
    }
  }
  base.exigences_techniques.lots = deduplicateLots(allLots)

  // Fusionner les criteres d'evaluation (dedup par nom)
  const criteresSeen = new Set<string>()
  const mergedCriteres: DCEAnalysis['criteres_evaluation'] = []
  for (const part of parts) {
    if (part.criteres_evaluation) {
      for (const c of part.criteres_evaluation) {
        if (!criteresSeen.has(c.nom)) {
          criteresSeen.add(c.nom)
          mergedCriteres.push(c)
        }
      }
    }
  }
  base.criteres_evaluation = mergedCriteres

  // Fusionner mots-cles miroir (union)
  const allKeywords = new Set<string>()
  for (const part of parts) {
    if (part.mots_cles_miroir) {
      part.mots_cles_miroir.forEach(k => allKeywords.add(k))
    }
  }
  base.mots_cles_miroir = Array.from(allKeywords).slice(0, 20)

  // [JONATHAN] Fusionner exigences individuelles (union par ID, dedup)
  const exigencesSeen = new Set<string>()
  const mergedExigences: ExigenceIndividuelle[] = []
  for (const part of parts) {
    if (part.exigences_individuelles) {
      for (const ex of part.exigences_individuelles) {
        if (!exigencesSeen.has(ex.id)) {
          exigencesSeen.add(ex.id)
          mergedExigences.push(ex)
        }
      }
    }
  }
  base.exigences_individuelles = mergedExigences

  // [JONATHAN] Fusionner questions acheteur (union)
  const questionsSeen = new Set<string>()
  const mergedQuestions: QuestionAcheteur[] = []
  for (const part of parts) {
    if (part.questions_acheteur) {
      for (const q of part.questions_acheteur) {
        if (!questionsSeen.has(q.id)) {
          questionsSeen.add(q.id)
          mergedQuestions.push(q)
        }
      }
    }
  }
  base.questions_acheteur = mergedQuestions

  // Recalculer scoring avec le dernier chunk (vision la plus complete)
  const lastPart = parts[parts.length - 1]
  if (lastPart.scoring_axiom) {
    base.scoring_axiom = lastPart.scoring_axiom as DCEAnalysis['scoring_axiom']
  }
  if (lastPart.decision_preliminaire) {
    base.decision_preliminaire = lastPart.decision_preliminaire as DCEAnalysis['decision_preliminaire']
  }

  // RC et CCAP : prendre du premier chunk (toujours complets)
  if (parts[0].analyse_rc) base.analyse_rc = parts[0].analyse_rc as AnalyseRC
  if (parts[0].analyse_ccap) base.analyse_ccap = parts[0].analyse_ccap as AnalyseCCAP
  if (parts[0].flags_conditionnels) base.flags_conditionnels = parts[0].flags_conditionnels as FlagsConditionnels
  if (parts[0].detection_marche_fausse) base.detection_marche_fausse = parts[0].detection_marche_fausse as DetectionMarcheFausse

  return base
}

function deduplicateLots(lots: DCEAnalysis['exigences_techniques']['lots']): DCEAnalysis['exigences_techniques']['lots'] {
  const seen = new Map<number, typeof lots[0]>()
  for (const lot of lots) {
    if (!seen.has(lot.numero_lot)) {
      seen.set(lot.numero_lot, lot)
    } else {
      const existing = seen.get(lot.numero_lot)!
      existing.specs_cles = [...existing.specs_cles, ...lot.specs_cles]
    }
  }
  return Array.from(seen.values())
}

export { analyzeChunkedDCE }
```

---

## 9a.9 Stockage PostgreSQL **[FUSION]**

```sql
-- Table pour les analyses DCE (v2 : enrichie avec champs Jonathan)
CREATE TABLE ao_analyses (
  id SERIAL PRIMARY KEY,
  boamp_reference VARCHAR(50) UNIQUE NOT NULL,
  lead_id INTEGER REFERENCES leads_bruts(id),

  -- Metadata
  dce_filenames TEXT[],                          -- [FUSION] Plusieurs fichiers, pas un seul
  documents_analyses TEXT[],                     -- [JONATHAN] ["RC", "CCTP", "CCAP"]
  acheteur_nom VARCHAR(300),
  acheteur_siret VARCHAR(20),
  type_procedure VARCHAR(50),
  montant_estime_ht NUMERIC,
  date_deadline TIMESTAMP WITH TIME ZONE,
  jours_avant_deadline INTEGER,

  -- Extraction complete
  extraction_json JSONB NOT NULL,                -- DCEAnalysis complet (toutes sections)

  -- Scoring et decision
  score_go_no_go NUMERIC,
  decision VARCHAR(15) CHECK (decision IN ('RECOMMANDE', 'POSSIBLE', 'MARGINAL', 'ECARTE')),
  decision_finale VARCHAR(15),                   -- [FUSION] 4 niveaux au lieu de 3
  validated_by VARCHAR(100),
  validated_at TIMESTAMP WITH TIME ZONE,

  -- Champs Jonathan
  nb_exigences_eliminatoires INTEGER DEFAULT 0,  -- [JONATHAN] Compteur auto
  nb_exigences_total INTEGER DEFAULT 0,          -- [JONATHAN]
  est_marche_fausse BOOLEAN DEFAULT FALSE,       -- [JONATHAN]
  score_suspicion INTEGER DEFAULT 0,             -- [JONATHAN] 0-100
  flags_rse BOOLEAN DEFAULT FALSE,               -- [JONATHAN]
  flags_social BOOLEAN DEFAULT FALSE,            -- [JONATHAN]
  flags_rgaa BOOLEAN DEFAULT FALSE,              -- [JONATHAN]

  -- Statut
  status VARCHAR(20) DEFAULT 'draft'
    CHECK (status IN ('draft', 'validated', 'in_progress', 'submitted', 'won', 'lost', 'abandoned')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ao_analyses_decision ON ao_analyses(decision);
CREATE INDEX idx_ao_analyses_status ON ao_analyses(status);
CREATE INDEX idx_ao_analyses_deadline ON ao_analyses(date_deadline);
CREATE INDEX idx_ao_analyses_marche_fausse ON ao_analyses(est_marche_fausse);

-- [JONATHAN] Table pour les exigences individuelles (EX-001...)
CREATE TABLE ao_exigences (
  id SERIAL PRIMARY KEY,
  ao_analysis_id INTEGER REFERENCES ao_analyses(id) ON DELETE CASCADE,
  exigence_id VARCHAR(10) NOT NULL,              -- "EX-001"
  classification VARCHAR(15) NOT NULL
    CHECK (classification IN ('ELIMINATOIRE', 'OBLIGATOIRE', 'SOUHAITABLE')),
  source_document VARCHAR(10),
  source_article VARCHAR(100),
  libelle TEXT NOT NULL,
  type_exigence VARCHAR(50),
  impact_axiom TEXT,
  preuve_requise TEXT,
  score_axiom INTEGER CHECK (score_axiom BETWEEN 1 AND 5),
  lot_concerne INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ao_exigences_ao_id ON ao_exigences(ao_analysis_id);
CREATE INDEX idx_ao_exigences_classification ON ao_exigences(classification);

-- [JONATHAN] Table pour les questions a poser a l'acheteur
CREATE TABLE ao_questions_acheteur (
  id SERIAL PRIMARY KEY,
  ao_analysis_id INTEGER REFERENCES ao_analyses(id) ON DELETE CASCADE,
  question_id VARCHAR(10) NOT NULL,              -- "Q-001"
  question TEXT NOT NULL,
  source_ambiguite TEXT,
  priorite VARCHAR(10) CHECK (priorite IN ('haute', 'moyenne', 'basse')),
  impact_si_non_resolue TEXT,
  deadline_question DATE,
  statut VARCHAR(20) DEFAULT 'a_poser'
    CHECK (statut IN ('a_poser', 'posee', 'repondue', 'non_posee')),
  reponse_acheteur TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

---
