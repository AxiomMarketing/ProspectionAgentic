import { MessageValidatorService } from './message-validator.service';

function words(n: number, filler = 'mot'): string {
  return Array.from({ length: n }, () => filler).join(' ');
}

function chars(n: number): string {
  return 'a'.repeat(n);
}

/** Valid base body: 80 words, ends with question, includes personalization */
function validBody(prospectName = 'Jean Dupont', companyName = 'Acme'): string {
  return (
    `Bonjour ${prospectName}, ` +
    `votre équipe chez ${companyName} fait un travail remarquable dans votre secteur. ` +
    words(60) +
    ' Seriez-vous disponible pour un échange de quinze minutes la semaine prochaine ?'
  );
}

const VALID_SUBJECT = chars(40);

describe('MessageValidatorService', () => {
  let service: MessageValidatorService;

  beforeEach(() => {
    service = new MessageValidatorService();
  });

  // ─── Backward-compatible signature ──────────────────────────────────────────

  it('should pass for a valid message (70 words, 40 char subject)', () => {
    const subject = chars(40);
    const body = words(70) + ' ?';
    const result = service.validate(subject, body);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.checks.structure).toBe(true);
  });

  // ─── Check 1: Structure ─────────────────────────────────────────────────────

  describe('Check 1 — Structure', () => {
    it('fails when body is too short (< 50 words)', () => {
      const result = service.validate(VALID_SUBJECT, words(30) + ' ?');
      expect(result.checks.structure).toBe(false);
      expect(result.errors.some((e) => e.includes('too short'))).toBe(true);
    });

    it('fails when body is too long (> 125 words)', () => {
      const result = service.validate(VALID_SUBJECT, words(130) + ' ?');
      expect(result.checks.structure).toBe(false);
      expect(result.errors.some((e) => e.includes('too long'))).toBe(true);
    });

    it('fails when subject is too short (< 36 chars)', () => {
      const result = service.validate(chars(20), validBody());
      expect(result.checks.structure).toBe(false);
      expect(result.errors.some((e) => e.includes('Subject too short'))).toBe(true);
    });

    it('fails when subject is too long (> 50 chars)', () => {
      const result = service.validate(chars(55), validBody());
      expect(result.checks.structure).toBe(false);
      expect(result.errors.some((e) => e.includes('Subject too long'))).toBe(true);
    });

    it('passes when body is exactly 50 words', () => {
      const body = words(49) + ' ?';
      const result = service.validate(VALID_SUBJECT, body);
      expect(result.errors.some((e) => e.includes('Body too short'))).toBe(false);
    });

    it('passes when subject is exactly 36 chars', () => {
      const result = service.validate(chars(36), validBody());
      expect(result.errors.some((e) => e.includes('Subject too short'))).toBe(false);
    });
  });

  // ─── Check 2: Spam words ────────────────────────────────────────────────────

  describe('Check 2 — Spam words', () => {
    it('fails and lists spam words when body contains "gratuit"', () => {
      const body = validBody() + ' gratuit';
      const result = service.validate(VALID_SUBJECT, body);
      expect(result.checks.spamWords).toBe(false);
      const spamError = result.errors.find((e) => e.includes('Spam words'));
      expect(spamError).toBeDefined();
      expect(spamError).toContain('gratuit');
    });

    it('detects spam words case-insensitively', () => {
      const body = validBody() + ' GRATUIT';
      const result = service.validate(VALID_SUBJECT, body);
      expect(result.checks.spamWords).toBe(false);
    });

    it('detects multi-word spam phrases like "cliquez ici"', () => {
      const body = validBody() + ' cliquez ici';
      const result = service.validate(VALID_SUBJECT, body);
      expect(result.checks.spamWords).toBe(false);
    });

    it('detects "révolutionnaire"', () => {
      const body = validBody() + ' révolutionnaire';
      const result = service.validate(VALID_SUBJECT, body);
      expect(result.checks.spamWords).toBe(false);
    });

    it('passes for a clean body', () => {
      const result = service.validate(VALID_SUBJECT, validBody());
      expect(result.checks.spamWords).toBe(true);
    });
  });

  // ─── Check 3: Tone ──────────────────────────────────────────────────────────

  describe('Check 3 — Tone', () => {
    it('fails when body contains banned cliché "je me permets"', () => {
      const body = validBody() + ' je me permets de vous contacter.';
      const result = service.validate(VALID_SUBJECT, body);
      expect(result.checks.tone).toBe(false);
      expect(result.errors.some((e) => e.includes('je me permets'))).toBe(true);
    });

    it('fails when body contains "n\'hésitez pas à"', () => {
      const body = validBody() + " n'hésitez pas à me contacter.";
      const result = service.validate(VALID_SUBJECT, body);
      expect(result.checks.tone).toBe(false);
    });

    it('fails when body contains tutoiement "tu"', () => {
      const body = validBody() + ' tu verras le résultat.';
      const result = service.validate(VALID_SUBJECT, body);
      expect(result.checks.tone).toBe(false);
      expect(result.errors.some((e) => e.includes('Tutoiement'))).toBe(true);
    });

    it('fails when body contains tutoiement "ton"', () => {
      const body = validBody() + ' ton équipe appréciera.';
      const result = service.validate(VALID_SUBJECT, body);
      expect(result.checks.tone).toBe(false);
    });

    it('fails when a sentence starts with "Nous "', () => {
      const body = validBody() + ' Nous sommes les meilleurs du marché.';
      const result = service.validate(VALID_SUBJECT, body);
      expect(result.checks.tone).toBe(false);
      expect(result.errors.some((e) => e.includes('"Nous "'))).toBe(true);
    });

    it('passes when "nous" is mid-sentence', () => {
      const body = validBody() + ' Ce que nous faisons est utile.';
      const result = service.validate(VALID_SUBJECT, body);
      expect(result.errors.some((e) => e.includes('"Nous "'))).toBe(false);
    });
  });

  // ─── Check 4: Hallucination ─────────────────────────────────────────────────

  describe('Check 4 — Hallucination', () => {
    it('passes when all numbers in body are present in inputData', () => {
      const body = validBody() + ' Nous avons aidé 42 entreprises.';
      const result = service.validate(VALID_SUBJECT, body, { clients: 42 });
      expect(result.checks.hallucination).toBe(true);
    });

    it('flags numbers in body not found in inputData', () => {
      const body = validBody() + ' Nous avons aidé 99 entreprises.';
      const result = service.validate(VALID_SUBJECT, body, { clients: 42 });
      expect(result.checks.hallucination).toBe(false);
      expect(result.errors.some((e) => e.includes('99'))).toBe(true);
    });

    it('passes when inputData is undefined (no hallucination check)', () => {
      const body = validBody() + ' Nous avons aidé 99 entreprises.';
      const result = service.validate(VALID_SUBJECT, body, undefined);
      expect(result.checks.hallucination).toBe(true);
    });

    it('ignores numbers <= 10', () => {
      const body = validBody() + ' en 5 jours.';
      const result = service.validate(VALID_SUBJECT, body, { days: 3 });
      expect(result.checks.hallucination).toBe(true);
    });

    it('extracts numbers from nested inputData', () => {
      const body = validBody() + ' Nous avons aidé 200 entreprises.';
      const result = service.validate(VALID_SUBJECT, body, { stats: { clients: 200 } });
      expect(result.checks.hallucination).toBe(true);
    });
  });

  // ─── Check 5: Personalization ───────────────────────────────────────────────

  describe('Check 5 — Personalization', () => {
    it('passes when prospectName and companyName are in body', () => {
      const result = service.validate(VALID_SUBJECT, validBody('Marie Martin', 'TechCorp'), undefined, 'Marie Martin', 'TechCorp');
      expect(result.checks.personalization).toBe(true);
    });

    it('fails when prospectName is missing from body', () => {
      const result = service.validate(VALID_SUBJECT, validBody(), undefined, 'Alice Dupont');
      expect(result.checks.personalization).toBe(false);
      expect(result.errors.some((e) => e.includes('Alice Dupont'))).toBe(true);
    });

    it('fails when companyName is missing from body', () => {
      const result = service.validate(VALID_SUBJECT, validBody(), undefined, undefined, 'UnknownCorp');
      expect(result.checks.personalization).toBe(false);
      expect(result.errors.some((e) => e.includes('UnknownCorp'))).toBe(true);
    });

    it('passes when prospectName and companyName are not provided', () => {
      const result = service.validate(VALID_SUBJECT, validBody());
      expect(result.checks.personalization).toBe(true);
    });
  });

  // ─── Check 6: CTA soft ──────────────────────────────────────────────────────

  describe('Check 6 — CTA soft', () => {
    it('passes when last sentence is a question', () => {
      const result = service.validate(VALID_SUBJECT, validBody());
      expect(result.checks.ctaSoft).toBe(true);
    });

    it('fails when last sentence is not a question', () => {
      const body = validBody().replace(
        'Seriez-vous disponible pour un échange de quinze minutes la semaine prochaine ?',
        'Contactez-moi dès que possible.',
      );
      const result = service.validate(VALID_SUBJECT, body);
      expect(result.checks.ctaSoft).toBe(false);
      expect(result.errors.some((e) => e.includes('Last sentence must be a question'))).toBe(true);
    });

    it('fails when last sentence contains "réservez"', () => {
      const body = validBody().replace(
        'Seriez-vous disponible pour un échange de quinze minutes la semaine prochaine ?',
        'Réservez votre créneau dès maintenant ?',
      );
      const result = service.validate(VALID_SUBJECT, body);
      expect(result.checks.ctaSoft).toBe(false);
      expect(result.errors.some((e) => e.includes('réservez'))).toBe(true);
    });

    it('fails when last sentence contains "appelez"', () => {
      const body = validBody().replace(
        'Seriez-vous disponible pour un échange de quinze minutes la semaine prochaine ?',
        'Appelez-moi quand vous voulez ?',
      );
      const result = service.validate(VALID_SUBJECT, body);
      expect(result.checks.ctaSoft).toBe(false);
    });
  });

  // ─── Combined / accumulation ─────────────────────────────────────────────────

  describe('Error accumulation', () => {
    it('accumulates multiple errors across checks', () => {
      const subject = chars(10);
      const body = words(20) + ' gratuit urgent';
      const result = service.validate(subject, body);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });
});
