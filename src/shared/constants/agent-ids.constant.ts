export const AGENT_IDS = {
  VEILLEUR: 'agent-veilleur',
  ENRICHISSEUR: 'agent-enrichisseur',
  SCOREUR: 'agent-scoreur',
  REDACTEUR: 'agent-redacteur',
  SUIVEUR: 'agent-suiveur',
  NURTUREUR: 'agent-nurtureur',
  ANALYSTE: 'agent-analyste',
  DEALMAKER: 'agent-dealmaker',
  APPELS_OFFRES: 'agent-appels-offres',
  CSM: 'agent-csm',
} as const;

export type AgentId = (typeof AGENT_IDS)[keyof typeof AGENT_IDS];
