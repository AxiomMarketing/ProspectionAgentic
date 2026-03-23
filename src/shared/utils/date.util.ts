export function formatIso(date: Date): string {
  return date.toISOString();
}

export function isExpired(date: Date): boolean {
  return date.getTime() < Date.now();
}

export function daysUntil(date: Date): number {
  const diff = date.getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
