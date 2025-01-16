export const PLAN_TYPE_DISPLAY: Record<string, string> = {
  'fixed': 'Fixed',
  'bucket': 'Bucket',
  'time-based': 'Time Based',
  'usage-based': 'Usage Based'
};

export const PLAN_TYPE_OPTIONS = Object.entries(PLAN_TYPE_DISPLAY).map(([value, label]) => ({
  value,
  label
}));

export const BILLING_FREQUENCY_DISPLAY: Record<string, string> = {
  'monthly': 'Monthly',
  'quarterly': 'Quarterly',
  'annually': 'Annually'
};

export const BILLING_FREQUENCY_OPTIONS = Object.entries(BILLING_FREQUENCY_DISPLAY).map(([value, label]) => ({
  value,
  label
}));
