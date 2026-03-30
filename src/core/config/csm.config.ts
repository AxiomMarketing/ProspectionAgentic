import { registerAs } from '@nestjs/config';

export default registerAs('csm', () => ({
  enabled: process.env.CSM_ENABLED === 'true',
  // Onboarding (10a)
  onboardingKickoffDelayDays: parseInt(process.env.ONBOARDING_KICKOFF_DELAY_DAYS ?? '2', 10),
  onboardingTtvAlertDays: parseInt(process.env.ONBOARDING_TTV_ALERT_DAYS ?? '14', 10),
  onboardingRiskSilenceDays: parseInt(process.env.ONBOARDING_RISK_SILENCE_DAYS ?? '5', 10),
  // Health Score (10c)
  healthScoreCron: process.env.HEALTH_SCORE_CRON ?? '0 8 * * *',
  healthScoreGreenThreshold: parseInt(process.env.HEALTH_SCORE_GREEN_THRESHOLD ?? '80', 10),
  healthScoreYellowThreshold: parseInt(process.env.HEALTH_SCORE_YELLOW_THRESHOLD ?? '60', 10),
  healthScoreOrangeThreshold: parseInt(process.env.HEALTH_SCORE_ORANGE_THRESHOLD ?? '50', 10),
  healthScoreDarkOrangeThreshold: parseInt(process.env.HEALTH_SCORE_DARK_ORANGE_THRESHOLD ?? '30', 10),
  churnSilenceDays: parseInt(process.env.CHURN_SILENCE_DAYS ?? '60', 10),
  churnCriticalSilenceDays: parseInt(process.env.CHURN_CRITICAL_SILENCE_DAYS ?? '120', 10),
  // NPS/CSAT (10c)
  npsPostDeliveryDelayDays: parseInt(process.env.NPS_POST_DELIVERY_DELAY_DAYS ?? '30', 10),
  npsQuarterlyCron: process.env.NPS_QUARTERLY_CRON ?? '0 9 1 */3 *',
  typeformApiKey: process.env.TYPEFORM_API_KEY ?? '',
  typeformNpsFormId: process.env.TYPEFORM_NPS_FORM_ID ?? '',
  typeformCsatFormId: process.env.TYPEFORM_CSAT_FORM_ID ?? '',
  // Upsell (10b)
  upsellMinScore: parseInt(process.env.UPSELL_MIN_SCORE ?? '60', 10),
  upsellEvaluationDelayDays: parseInt(process.env.UPSELL_EVALUATION_DELAY_DAYS ?? '60', 10),
  upsellCooldownDays: parseInt(process.env.UPSELL_COOLDOWN_DAYS ?? '90', 10),
  // Reviews (10d)
  reviewRequestDelayDays: parseInt(process.env.REVIEW_REQUEST_DELAY_DAYS ?? '5', 10),
  reviewReminder1Days: parseInt(process.env.REVIEW_REMINDER_1_DAYS ?? '10', 10),
  reviewReminder2Days: parseInt(process.env.REVIEW_REMINDER_2_DAYS ?? '15', 10),
  reviewMinNps: parseInt(process.env.REVIEW_MIN_NPS ?? '7', 10),
  // Referral (10e)
  referralMinNps: parseInt(process.env.REFERRAL_MIN_NPS ?? '9', 10),
  referralMinHealth: parseInt(process.env.REFERRAL_MIN_HEALTH ?? '80', 10),
  referralMinDays: parseInt(process.env.REFERRAL_MIN_DAYS ?? '60', 10),
  referralCommissionTier1Pct: parseFloat(process.env.REFERRAL_COMMISSION_TIER1_PCT ?? '20') / 100,
  referralCommissionTier2Pct: parseFloat(process.env.REFERRAL_COMMISSION_TIER2_PCT ?? '15') / 100,
  referralCommissionTier3Pct: parseFloat(process.env.REFERRAL_COMMISSION_TIER3_PCT ?? '10') / 100,
  referralRetentionBonusPct: parseFloat(process.env.REFERRAL_RETENTION_BONUS_PCT ?? '5') / 100,
  // Review platform URLs
  reviewUrlGoogle: process.env.REVIEW_URL_GOOGLE ?? '',
  reviewUrlTrustpilot: process.env.REVIEW_URL_TRUSTPILOT ?? '',
  reviewUrlClutch: process.env.REVIEW_URL_CLUTCH ?? '',
  reviewUrlSortlist: process.env.REVIEW_URL_SORTLIST ?? '',
  reviewUrlLinkedin: process.env.REVIEW_URL_LINKEDIN ?? '',
}));
