import { describe, expect, it } from "vitest";
import {
  getWorkspaceTemporalContextAt,
  relativeDate,
  temporalPrompt,
} from "./temporal-context";

describe("workspace temporal context", () => {
  it("calculates the local date and time in the workspace timezone", () => {
    const context = getWorkspaceTemporalContextAt(
      new Date("2026-10-06T23:00:00.000Z"),
      "America/Sao_Paulo"
    );

    expect(context).toMatchObject({
      timezone: "America/Sao_Paulo",
      nowIso: "2026-10-06T23:00:00.000Z",
      localDate: "2026-10-06",
      localDateTime: "2026-10-06T20:00:00",
    });
  });

  it("moves 6 October 2026 to 7 October 2026", () => {
    expect(relativeDate("2026-10-06", 1)).toBe("2026-10-07");
    expect(relativeDate("2026-10-06", -1)).toBe("2026-10-05");
  });

  it("renders official today, tomorrow and yesterday in the prompt", () => {
    const prompt = temporalPrompt({
      timezone: "America/Sao_Paulo",
      nowIso: "2026-10-06T23:00:00.000Z",
      localDate: "2026-10-06",
      localDateTime: "2026-10-06T20:00:00",
    });

    expect(prompt).toContain("Data local de hoje: 2026-10-06");
    expect(prompt).toContain("“amanhã” corresponde a: 2026-10-07");
    expect(prompt).toContain("“ontem” corresponde a: 2026-10-05");
    expect(prompt).toContain("não pergunte a mesma data novamente");
  });
});
