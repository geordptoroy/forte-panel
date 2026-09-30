export type SaaSSubscriptionStatus =
  | "not_started"
  | "trialing"
  | "active"
  | "past_due"
  | "cancel_at_period_end"
  | "cancelled";
export type SaaSSubscriptionAction =
  | "start_trial"
  | "activate"
  | "upgrade"
  | "downgrade"
  | "mark_past_due"
  | "schedule_cancel"
  | "cancel_now"
  | "retain"
  | "restart_trial";
export type SaaSPlan = "starter" | "pro" | "business";

export type SaaSSubscriptionState = {
  status: SaaSSubscriptionStatus;
  plan: SaaSPlan;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
};

const allowed: Record<SaaSSubscriptionStatus, readonly SaaSSubscriptionAction[]> = {
  not_started: ["start_trial"],
  trialing: ["activate", "upgrade", "downgrade", "cancel_now"],
  active: ["upgrade", "downgrade", "mark_past_due", "schedule_cancel", "cancel_now"],
  past_due: ["activate", "schedule_cancel", "cancel_now"],
  cancel_at_period_end: ["retain", "cancel_now"],
  cancelled: ["restart_trial"],
};

export function canTransitionSubscription(status: SaaSSubscriptionStatus, action: SaaSSubscriptionAction) {
  return allowed[status].includes(action);
}

export function transitionSubscription(input: {
  state: SaaSSubscriptionState;
  action: SaaSSubscriptionAction;
  targetPlan?: SaaSPlan;
  now?: Date;
  reason: string;
}) {
  if (!input.reason.trim()) throw new Error("SUBSCRIPTION_REASON_REQUIRED");
  if (!canTransitionSubscription(input.state.status, input.action))
    throw new Error(`SUBSCRIPTION_TRANSITION_NOT_ALLOWED:${input.state.status}:${input.action}`);
  const now = (input.now ?? new Date()).toISOString();
  const plan = input.targetPlan ?? input.state.plan;
  if ((input.action === "upgrade" || input.action === "downgrade") && plan === input.state.plan)
    throw new Error("SUBSCRIPTION_PLAN_MUST_CHANGE");
  const next: SaaSSubscriptionState = { ...input.state };
  switch (input.action) {
    case "start_trial":
      next.status = "trialing";
      next.trialEndsAt = next.trialEndsAt ?? new Date(new Date(now).getTime() + 14 * 86_400_000).toISOString();
      next.cancelAtPeriodEnd = false;
      break;
    case "restart_trial":
      next.status = "trialing";
      next.trialEndsAt = new Date(new Date(now).getTime() + 14 * 86_400_000).toISOString();
      next.cancelAtPeriodEnd = false;
      break;
    case "activate":
      next.status = "active";
      next.cancelAtPeriodEnd = false;
      break;
    case "upgrade":
    case "downgrade":
      next.plan = plan;
      next.status = input.state.status === "trialing" ? "trialing" : "active";
      break;
    case "mark_past_due":
      next.status = "past_due";
      break;
    case "schedule_cancel":
      next.status = "cancel_at_period_end";
      next.cancelAtPeriodEnd = true;
      break;
    case "cancel_now":
      next.status = "cancelled";
      next.cancelAtPeriodEnd = false;
      break;
    case "retain":
      next.status = "active";
      next.cancelAtPeriodEnd = false;
      break;
  }
  return {
    accepted: true as const,
    execution: "not_configured" as const,
    requiresBillingProvider: true as const,
    occurredAt: now,
    reason: input.reason.trim(),
    before: input.state,
    after: next,
  };
}

export function getSaaSSubscriptionLifecycleCatalog() {
  return {
    execution: "not_configured" as const,
    requiresBillingProvider: true,
    trialDays: 14,
    statuses: ["not_started", "trialing", "active", "past_due", "cancel_at_period_end", "cancelled"] as const,
    actions: ["start_trial", "activate", "upgrade", "downgrade", "mark_past_due", "schedule_cancel", "cancel_now", "retain", "restart_trial"] as const,
    retention: { cancellation: "cancel_at_period_end_by_default", restart: "explicit_restart_trial" },
  };
}
