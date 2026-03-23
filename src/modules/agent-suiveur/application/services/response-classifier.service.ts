import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '@modules/llm/llm.service';
import { LlmTask } from '@modules/llm/llm.types';

export type ReplyCategory =
  | 'INTERESSE'
  | 'INTERESSE_SOFT'
  | 'PAS_MAINTENANT'
  | 'PAS_INTERESSE'
  | 'MAUVAISE_PERSONNE'
  | 'DEMANDE_INFO'
  | 'OUT_OF_OFFICE'
  | 'SPAM';

export interface ClassificationResult {
  category: ReplyCategory;
  confidence: number;
  sentiment: 'positif' | 'neutre' | 'negatif';
  actionSuggeree: string;
  dateRetourOoo: string | null;
  personneReferree: { nom: string | null; email: string | null; poste: string | null } | null;
  phraseCle: string;
  raisonnement: string;
}

@Injectable()
export class ResponseClassifierService {
  private readonly logger = new Logger(ResponseClassifierService.name);

  constructor(private readonly llmService: LlmService) {}

  async classify(params: {
    replyBody: string;
    fromAddress: string;
    subject: string;
    prospectName: string;
    prospectCompany: string;
    prospectPoste: string;
    lastMessageSent: string;
  }): Promise<ClassificationResult> {
    const systemPrompt = `Tu es un expert en classification de réponses à des emails de prospection B2B pour Axiom Marketing.

CATÉGORIES:
1. INTERESSE — Intérêt clair pour un échange (call, meeting)
2. INTERESSE_SOFT — Demande plus d'infos avant de s'engager
3. PAS_MAINTENANT — Potentiellement intéressé mais pas le bon moment
4. PAS_INTERESSE — Décline clairement, sans demande de désabonnement
5. MAUVAISE_PERSONNE — Redirige vers quelqu'un d'autre
6. DEMANDE_INFO — Pose une question spécifique
7. OUT_OF_OFFICE — Réponse automatique d'absence
8. SPAM — Message irrelevant

Réponds UNIQUEMENT en JSON valide:
{
  "category": "CATEGORIE",
  "confidence": 0.95,
  "sentiment": "positif|neutre|negatif",
  "action_suggeree": "Description action",
  "date_retour_ooo": "YYYY-MM-DD ou null",
  "personne_referree": { "nom": "ou null", "email": "ou null", "poste": "ou null" },
  "phrase_cle": "Citation exacte",
  "raisonnement": "Explication 1-2 phrases"
}`;

    const userPrompt = `RÉPONSE REÇUE:
De: ${params.fromAddress}
Sujet: ${params.subject}

Contenu:
"${params.replyBody}"

CONTEXTE:
- Entreprise: ${params.prospectCompany}
- Poste: ${params.prospectPoste}
- Prénom: ${params.prospectName}
- Dernier message envoyé: "${params.lastMessageSent}"`;

    const result = await this.llmService.call({
      task: LlmTask.CLASSIFY_REPLY,
      systemPrompt,
      userPrompt,
      temperature: 0.1,
      maxTokens: 500,
    });

    try {
      const parsed = JSON.parse(result.content) as {
        category: ReplyCategory;
        confidence: number;
        sentiment: 'positif' | 'neutre' | 'negatif';
        action_suggeree: string;
        date_retour_ooo: string | null;
        personne_referree: {
          nom: string | null;
          email: string | null;
          poste: string | null;
        } | null;
        phrase_cle: string;
        raisonnement: string;
      };
      return {
        category: parsed.category,
        confidence: parsed.confidence,
        sentiment: parsed.sentiment,
        actionSuggeree: parsed.action_suggeree,
        dateRetourOoo: parsed.date_retour_ooo,
        personneReferree: parsed.personne_referree,
        phraseCle: parsed.phrase_cle,
        raisonnement: parsed.raisonnement,
      };
    } catch {
      this.logger.warn({ msg: 'Failed to parse classification response', content: result.content });
      return {
        category: 'DEMANDE_INFO',
        confidence: 0.3,
        sentiment: 'neutre',
        actionSuggeree: 'Revue manuelle requise',
        dateRetourOoo: null,
        personneReferree: null,
        phraseCle: params.replyBody.substring(0, 100),
        raisonnement: 'Parsing failed, defaulting to DEMANDE_INFO for manual review',
      };
    }
  }
}
