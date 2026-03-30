export const QUEUE_NAMES = {
  VEILLEUR_PIPELINE: 'veilleur-pipeline',
  ENRICHISSEUR_PIPELINE: 'enrichisseur-pipeline',
  SCOREUR_PIPELINE: 'scoreur-pipeline',
  REDACTEUR_PIPELINE: 'redacteur-pipeline',
  SUIVEUR_PIPELINE: 'suiveur-pipeline',
  NURTURER_PIPELINE: 'nurturer-pipeline',
  DEALMAKER_PIPELINE: 'dealmaker-pipeline',
  APPELS_OFFRES_PIPELINE: 'appels-offres-pipeline',
  CSM_ONBOARDING: 'csm-onboarding',
  VEILLEUR_REFERRAL_LEADS: 'veilleur-referral-leads',
  NURTURER_CHURNED_CLIENT: 'nurturer-churned-client',
  DEALMAKER_UPSELL: 'dealmaker-upsell',
  DEAD_LETTER_QUEUE: 'dead-letter-queue',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
