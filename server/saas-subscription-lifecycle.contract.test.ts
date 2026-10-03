import { describe, expect, it } from "vitest";
import { canTransitionSubscription, getSaaSSubscriptionLifecycleCatalog, transitionSubscription, type SaaSSubscriptionState } from "./saas-subscription-lifecycle";

const active: SaaSSubscriptionState = { status: "active", plan: "starter", trialEndsAt: null, currentPeriodEndsAt: "2026-10-30T00:00:00.000Z", cancelAtPeriodEnd: false };

describe("SaaS subscription lifecycle", () => {
  it("starts a deterministic 14-day trial without pretending to charge", () => {
    const result = transitionSubscription({ state: { ...active, status: "not_started" }, action: "start_trial", now: new Date("2026-09-30T00:00:00.000Z"), reason: "Teste de trial" });
    expect(result).toMatchObject({ accepted: true, execution: "not_configured", requiresBillingProvider: true, after: { status: "trialing", plan: "starter" } });
    expect(result.after.trialEndsAt).toBe("2026-10-14T00:00:00.000Z");
  });

  it("supports upgrade and downgrade only as explicit plan changes", () => {
    expect(transitionSubscription({ state: active, action: "upgrade", targetPlan: "pro", reason: "Aumento de equipe" }).after).toMatchObject({ status: "active", plan: "pro" });
    expect(transitionSubscription({ state: { ...active, plan: "business" }, action: "downgrade", targetPlan: "pro", reason: "Redução de custo" }).after).toMatchObject({ status: "active", plan: "pro" });
    expect(() => transitionSubscription({ state: active, action: "upgrade", targetPlan: "starter", reason: "Plano igual" })).toThrow("SUBSCRIPTION_PLAN_MUST_CHANGE");
  });

  it("defaults cancellation to end-of-period and allows explicit retention", () => {
    const scheduled = transitionSubscription({ state: active, action: "schedule_cancel", reason: "Cliente solicitou cancelamento" });
    expect(scheduled.after).toMatchObject({ status: "cancel_at_period_end", cancelAtPeriodEnd: true });
    expect(transitionSubscription({ state: scheduled.after, action: "retain", reason: "Cliente decidiu permanecer" }).after).toMatchObject({ status: "active", cancelAtPeriodEnd: false });
  });

  it("rejects invalid transitions and missing audit reasons", () => {
    expect(canTransitionSubscription("cancelled", "upgrade")).toBe(false);
    expect(() => transitionSubscription({ state: active, action: "retain", reason: "fora da janela" })).toThrow("SUBSCRIPTION_TRANSITION_NOT_ALLOWED");
    expect(() => transitionSubscription({ state: active, action: "schedule_cancel", reason: " " })).toThrow("SUBSCRIPTION_REASON_REQUIRED");
  });

  it("publishes lifecycle as not configured until a billing provider exists", () => {
    expect(getSaaSSubscriptionLifecycleCatalog()).toMatchObject({ execution: "not_configured", requiresBillingProvider: true, trialDays: 14, retention: { cancellation: "cancel_at_period_end_by_default" } });
  });
});
