import { Injectable } from '@nestjs/common';

export interface ValidationResult {
  valid: boolean;
  checks: {
    structure: boolean;
    spamWords: boolean;
    tone: boolean;
    hallucination: boolean;
    personalization: boolean;
    ctaSoft: boolean;
  };
  errors: string[];
}

@Injectable()
export class MessageValidatorService {
  private readonly SPAM_WORDS = [
    'gratuit',
    'offre exclusive',
    'promo',
    'promotion',
    'limité',
    'disparaître',
    'cliquez ici',
    'urgence',
    'ne manquez pas',
    'meilleur prix',
    'garanti',
    'résultats garantis',
    'dernière chance',
    'exceptionnelle',
    'sans engagement',
    'remise',
    'réduction',
    'cadeau',
    'bonus',
    'incroyable',
    'sensationnel',
    'révolutionnaire',
    'bénéficiez',
    'profitez',
    'saisissez',
    'inscrivez-vous',
    'abonnez-vous',
    'investissez',
    'multipliez',
    'doublez',
    'triplez',
    'illimité',
    'irrésistible',
    'miracle',
    'secret',
    'confidentiel',
    'spécial pour vous',
    'sélectionné',
    'exclusif',
    'vip',
    'premium',
    'argent facile',
    'enrichissez-vous',
    'félicitations',
    'gagnant',
    'loterie',
    'héritage',
    'synergy',
    'leverage',
    'best-in-class',
    'solution de pointe',
    'garantie',
    "n'attendez plus",
    'urgent',
  ];

  private readonly BANNED_CLICHES = [
    'je me permets',
    "j'espère que ce message vous trouve bien",
    'nous sommes leaders',
    'notre solution unique',
    "n'hésitez pas à",
    'je serais ravi de',
    'opportunité exceptionnelle',
    'offre limitée',
    'toucher base',
    'prendre le pouls',
  ];

  private readonly IMPERATIVE_CTA = ['réservez', 'appelez', 'cliquez', 'inscrivez'];

  validate(
    subject: string,
    body: string,
    inputData?: Record<string, unknown>,
    prospectName?: string,
    companyName?: string,
  ): ValidationResult {
    const errors: string[] = [];

    const structureValid = this.checkStructure(subject, body, errors);
    const spamWordsValid = this.checkSpamWords(body, errors);
    const toneValid = this.checkTone(body, errors);
    const hallucinationValid = this.checkHallucination(body, inputData, errors);
    const personalizationValid = this.checkPersonalization(body, prospectName, companyName, errors);
    const ctaSoftValid = this.checkCtaSoft(body, errors);

    return {
      valid: errors.length === 0,
      checks: {
        structure: structureValid,
        spamWords: spamWordsValid,
        tone: toneValid,
        hallucination: hallucinationValid,
        personalization: personalizationValid,
        ctaSoft: ctaSoftValid,
      },
      errors,
    };
  }

  private checkStructure(subject: string, body: string, errors: string[]): boolean {
    const initial = errors.length;
    const wordCount = body.trim().split(/\s+/).length;
    if (wordCount < 50) errors.push(`Body too short: ${wordCount} words (min 50)`);
    if (wordCount > 125) errors.push(`Body too long: ${wordCount} words (max 125)`);
    if (subject.length < 36) errors.push(`Subject too short: ${subject.length} chars (min 36)`);
    if (subject.length > 50) errors.push(`Subject too long: ${subject.length} chars (max 50)`);
    return errors.length === initial;
  }

  private checkSpamWords(body: string, errors: string[]): boolean {
    const bodyLower = body.toLowerCase();
    const found = this.SPAM_WORDS.filter((w) => bodyLower.includes(w));
    if (found.length > 0) {
      errors.push(`Spam words found: ${found.join(', ')}`);
      return false;
    }
    return true;
  }

  private checkTone(body: string, errors: string[]): boolean {
    const initial = errors.length;
    const bodyLower = body.toLowerCase();

    for (const cliche of this.BANNED_CLICHES) {
      if (bodyLower.includes(cliche)) {
        errors.push(`Banned cliché found: "${cliche}"`);
      }
    }

    if (/\btu\b|\bton\b|\bta\b|\btes\b/i.test(body)) {
      errors.push('Tutoiement detected: use vouvoiement');
    }

    const sentences = body.split(/(?<=[.!?])\s+/);
    const nousStart = sentences.filter((s) => s.trimStart().startsWith('Nous '));
    if (nousStart.length > 0) {
      errors.push(`Sentence(s) starting with "Nous ": ${nousStart.length} occurrence(s)`);
    }

    return errors.length === initial;
  }

  private checkHallucination(
    body: string,
    inputData: Record<string, unknown> | undefined,
    errors: string[],
  ): boolean {
    if (!inputData) return true;

    const numbersInBody = (body.match(/\b\d{2,}\b/g) ?? []).map(Number).filter((n) => n > 10);
    if (numbersInBody.length === 0) return true;

    const inputValues = this.extractNumbers(inputData);
    const hallucinated = numbersInBody.filter((n) => !inputValues.includes(n));

    if (hallucinated.length > 0) {
      errors.push(`Potential hallucination: numbers ${hallucinated.join(', ')} not found in input data`);
      return false;
    }
    return true;
  }

  private extractNumbers(obj: Record<string, unknown>): number[] {
    const result: number[] = [];
    for (const val of Object.values(obj)) {
      if (typeof val === 'number' && val > 10) {
        result.push(val);
      } else if (typeof val === 'string') {
        const matches = val.match(/\b\d{2,}\b/g);
        if (matches) result.push(...matches.map(Number).filter((n) => n > 10));
      } else if (val !== null && typeof val === 'object') {
        result.push(...this.extractNumbers(val as Record<string, unknown>));
      }
    }
    return result;
  }

  private checkPersonalization(
    body: string,
    prospectName: string | undefined,
    companyName: string | undefined,
    errors: string[],
  ): boolean {
    const initial = errors.length;
    if (prospectName && !body.includes(prospectName)) {
      errors.push(`Prospect name "${prospectName}" not found in body`);
    }
    if (companyName && !body.includes(companyName)) {
      errors.push(`Company name "${companyName}" not found in body`);
    }
    return errors.length === initial;
  }

  private checkCtaSoft(body: string, errors: string[]): boolean {
    const initial = errors.length;
    const sentences = body.trim().split(/(?<=[.!?])\s+/);
    const lastSentence = sentences[sentences.length - 1].trim();

    if (!lastSentence.endsWith('?')) {
      errors.push('Last sentence must be a question (ending with ?)');
    }

    const lastLower = lastSentence.toLowerCase();
    const foundImperative = this.IMPERATIVE_CTA.filter((v) => lastLower.includes(v));
    if (foundImperative.length > 0) {
      errors.push(`Hard CTA imperative(s) in last sentence: ${foundImperative.join(', ')}`);
    }

    return errors.length === initial;
  }
}
