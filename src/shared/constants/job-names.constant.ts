export const JOB_NAMES = {
  ENRICH_LEAD: 'enrich-lead',
  SCORE_PROSPECT: 'score-prospect',
  GENERATE_MESSAGE: 'generate-message',
  SEND_MESSAGE: 'message.generated',
  NURTURE_PROSPECT: 'nurture-prospect',
  PROCESS_REPLY: 'process-reply',
  DETECT_RESPONSES: 'detect-responses',
  EXECUTE_STEP: 'execute-step',
  RE_ENGAGEMENT_CHECK: 're-engagement-check',
  SUNSET_CHECK: 'sunset-check',
  ONBOARD_CUSTOMER: 'onboard-customer',
  SCAN_BOAMP: 'scan-boamp',
  CALCULATE_HEALTH_SCORE: 'calculate-health-score',
  CHECK_ONBOARDING_RISKS: 'check-onboarding-risks',
  EVALUATE_UPSELL: 'evaluate-upsell',
  REQUEST_REVIEW: 'request-review',
  INVITE_TO_REFERRAL: 'invite-to-referral',
  SEND_NPS_SURVEY: 'send-nps-survey',
  CHECK_CHURN_SIGNALS: 'check-churn-signals',
  DAILY_HEALTH_SNAPSHOT: 'daily-health-snapshot',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];
