import { createHmac, randomUUID } from 'crypto';

export function hashEmail(email: string, secret: string): string {
  return createHmac('sha256', secret).update(email.toLowerCase().trim()).digest('hex');
}

export function generateUuid(): string {
  return randomUUID();
}
