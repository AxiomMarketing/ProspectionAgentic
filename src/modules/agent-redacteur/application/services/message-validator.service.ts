import { Injectable } from '@nestjs/common';

@Injectable()
export class MessageValidatorService {
  private readonly SPAM_WORDS = [
    'gratuit',
    'synergy',
    'leverage',
    'best-in-class',
    'solution de pointe',
    'garantie',
    'offre exclusive',
    'sans engagement',
    'profitez',
    "n'attendez plus",
    'dernière chance',
    'urgent',
  ];

  validate(subject: string, body: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const wordCount = body.split(/\s+/).length;
    if (wordCount < 50) errors.push(`Body too short: ${wordCount} words (min 50)`);
    if (wordCount > 125) errors.push(`Body too long: ${wordCount} words (max 125)`);
    if (subject.length < 36) errors.push(`Subject too short: ${subject.length} chars (min 36)`);
    if (subject.length > 50) errors.push(`Subject too long: ${subject.length} chars (max 50)`);
    const bodyLower = body.toLowerCase();
    const found = this.SPAM_WORDS.filter((w) => bodyLower.includes(w));
    if (found.length > 0) errors.push(`Spam words found: ${found.join(', ')}`);
    return { valid: errors.length === 0, errors };
  }
}
