const ALLOWED_EXTERNAL_DOMAINS = new Set([
  'api.insee.fr',
  'bodacc-datadila.opendatasoft.com',
  'www.bodacc.fr',
  'data.inpi.fr',
  'recherche-entreprises.api.gouv.fr',
  'api.pappers.fr',
  'www.boamp.fr',
  'boamp-datadila.opendatasoft.com',
]);

const PRIVATE_IP_REGEX = /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|::1|localhost|0000:)/i;

export function validateExternalUrl(url: string): void {
  const parsed = new URL(url);
  if (PRIVATE_IP_REGEX.test(parsed.hostname)) {
    throw new Error(`SSRF blocked: private IP range ${parsed.hostname}`);
  }
  if (!ALLOWED_EXTERNAL_DOMAINS.has(parsed.hostname)) {
    throw new Error(`Domain not in allowlist: ${parsed.hostname}`);
  }
}

export function validateEmailDomain(domain: string): void {
  if (!domain || domain.length === 0) {
    throw new Error('Empty domain');
  }
  const lower = domain.toLowerCase();
  if (['localhost', '127.0.0.1', 'internal', 'local'].some(d => lower.includes(d))) {
    throw new Error(`SSRF blocked: internal domain ${domain}`);
  }
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(domain)) {
    throw new Error('IP addresses not allowed as email domain');
  }
}
