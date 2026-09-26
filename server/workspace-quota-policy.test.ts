import { afterEach, describe, expect, it } from "vitest";
import { workspaceUsageLimitsForPlan } from "./db";

afterEach(() => {
  delete process.env.FORTE_WORKSPACE_API_REQUESTS_PER_MINUTE;
  delete process.env.FORTE_WORKSPACE_AI_REQUESTS_PER_MINUTE;
  delete process.env.FORTE_WORKSPACE_OUTBOUND_MESSAGES_PER_MINUTE;
});

describe("workspace quota policy", () => {
  it("gives larger plans larger workspace and per-user windows", () => {
    const starter = workspaceUsageLimitsForPlan("starter", "aiRequests");
    const pro = workspaceUsageLimitsForPlan("pro", "aiRequests");
    const business = workspaceUsageLimitsForPlan("business", "aiRequests");

    expect(starter).toEqual({ workspaceLimit: 60, userLimit: 15 });
    expect(pro).toEqual({ workspaceLimit: 300, userLimit: 30 });
    expect(business).toEqual({ workspaceLimit: 900, userLimit: 90 });
  });

  it("keeps an explicit deployment override and never allows zero user quota", () => {
    process.env.FORTE_WORKSPACE_OUTBOUND_MESSAGES_PER_MINUTE = "3";

    expect(workspaceUsageLimitsForPlan("starter", "outboundMessages")).toEqual({ workspaceLimit: 3, userLimit: 1 });
  });
});
