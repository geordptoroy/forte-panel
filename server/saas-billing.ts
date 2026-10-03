import type { WorkspaceUsageMetric } from "./db";

export type SaaSPlan = "starter" | "pro" | "business";
export type SaaSBillingStatus = "not_configured";

const planLabels: Record<SaaSPlan, string> = {
  starter: "Starter",
  pro: "Pro",
  business: "Business",
};

export const SaaS_PLAN_CODES: readonly SaaSPlan[] = ["starter", "pro", "business"];

export function getSaaSPlanDescriptor(plan: SaaSPlan) {
  return {
    code: plan,
    label: planLabels[plan],
    technicalQuota: true,
    priceCents: null,
    currency: null,
    billingStatus: "not_configured" as const,
  };
}

export function buildSaaSBillingBoundary(
  plan: SaaSPlan,
  quota: Record<WorkspaceUsageMetric, { used: number; limit: number; remaining: number }>
) {
  return {
    managedSeparately: true,
    status: "not_configured" as SaaSBillingStatus,
    priceCents: null,
    currency: null,
    checkoutEnabled: false,
    technicalPlan: getSaaSPlanDescriptor(plan),
    quota: {
      apiRequests: quota.apiRequests,
      aiRequests: quota.aiRequests,
      outboundMessages: quota.outboundMessages,
    },
    providerCost: {
      trackedSeparately: true,
      source: "agent_outcome_metrics" as const,
      includedInPlanPrice: false,
    },
  };
}

export function getSaaSBillingCatalog() {
  return {
    billingStatus: "not_configured" as SaaSBillingStatus,
    checkoutEnabled: false,
    plans: SaaS_PLAN_CODES.map(getSaaSPlanDescriptor),
    separation: {
      technicalQuota: "rate_limit_and_usage_window",
      providerCost: "agent_outcome_metrics",
      operationalRevenue: "workspace_quotes_and_payments",
      saasCharge: "not_configured",
    },
  };
}
