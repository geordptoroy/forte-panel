import { describe, expect, it } from "vitest";
import { buildSaaSBillingBoundary, getSaaSBillingCatalog, getSaaSPlanDescriptor } from "./saas-billing";

const quota = {
  apiRequests: { used: 12, limit: 120, remaining: 108 },
  aiRequests: { used: 3, limit: 60, remaining: 57 },
  outboundMessages: { used: 4, limit: 120, remaining: 116 },
};

describe("SaaS billing boundary", () => {
  it("keeps technical plan and charge state separate", () => {
    const boundary = buildSaaSBillingBoundary("pro", quota);
    expect(boundary.technicalPlan).toMatchObject({ code: "pro", technicalQuota: true, priceCents: null });
    expect(boundary).toMatchObject({ managedSeparately: true, status: "not_configured", checkoutEnabled: false, priceCents: null, currency: null });
    expect(boundary.providerCost).toMatchObject({ trackedSeparately: true, source: "agent_outcome_metrics", includedInPlanPrice: false });
    expect(boundary.quota).toEqual(quota);
  });

  it("publishes a read-only catalog without inventing prices or checkout", () => {
    const catalog = getSaaSBillingCatalog();
    expect(catalog.billingStatus).toBe("not_configured");
    expect(catalog.checkoutEnabled).toBe(false);
    expect(catalog.plans.map(plan => plan.code)).toEqual(["starter", "pro", "business"]);
    expect(catalog.plans.every(plan => plan.priceCents === null && plan.currency === null)).toBe(true);
    expect(catalog.separation).toMatchObject({ technicalQuota: "rate_limit_and_usage_window", providerCost: "agent_outcome_metrics", operationalRevenue: "workspace_quotes_and_payments", saasCharge: "not_configured" });
  });

  it("keeps the plan descriptor pure and serializable", () => {
    expect(getSaaSPlanDescriptor("business")).toEqual({ code: "business", label: "Business", technicalQuota: true, priceCents: null, currency: null, billingStatus: "not_configured" });
  });
});
