export type DashboardLeadSignal = {
  needsOperatorResponse?: boolean;
  followUpAt?: Date | null;
  followUpCompletedAt?: Date | null;
};

export function isDashboardPendingLead(
  contact: DashboardLeadSignal,
  now: Date
) {
  const overdueFollowUp = Boolean(
    contact.followUpAt &&
      contact.followUpAt <= now &&
      !contact.followUpCompletedAt
  );
  return Boolean(contact.needsOperatorResponse || overdueFollowUp);
}

export function isDashboardStalledQuote(
  updatedAt: Date,
  now: Date,
  thresholdHours = 48
) {
  return updatedAt.getTime() <= now.getTime() - thresholdHours * 60 * 60 * 1000;
}
