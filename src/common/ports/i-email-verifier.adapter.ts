export interface EmailVerificationResult {
  email: string;
  isReachable: 'safe' | 'risky' | 'invalid' | 'unknown';
  isDeliverable: boolean;
  isCatchAll: boolean;
  isDisposable: boolean;
  isRoleAccount: boolean;
  mxRecords: string[];
  smtpCanConnect: boolean;
  confidence: number; // 0-100
}

export abstract class IEmailVerifierAdapter {
  abstract verify(email: string): Promise<EmailVerificationResult>;
  abstract verifyBatch(emails: string[]): Promise<EmailVerificationResult[]>;
  abstract isAvailable(): Promise<boolean>;
}
