import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "drizzle-pg");
const metadataDir = join(migrationsDir, "meta");

describe("PostgreSQL migration chain", () => {
  it("registers every SQL migration in the Drizzle journal", () => {
    const sqlTags = readdirSync(migrationsDir)
      .filter(name => /^\d{4}_.+\.sql$/.test(name))
      .map(name => name.replace(/\.sql$/, ""))
      .sort();
    const journal = JSON.parse(
      readFileSync(join(metadataDir, "_journal.json"), "utf8")
    ) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    const journalTags = journal.entries.map(entry => entry.tag);

    expect(journalTags).toEqual(sqlTags);
    expect(journal.entries.map(entry => entry.idx)).toEqual(
      sqlTags.map((_, index) => index)
    );
  });

  it("keeps the platform AI connection snapshot available", () => {
    const snapshot = JSON.parse(
      readFileSync(join(metadataDir, "0041_snapshot.json"), "utf8")
    ) as {
      tables?: Record<string, unknown>;
      enums?: Record<string, unknown>;
    };

    expect(snapshot.tables).toHaveProperty("public.platformAiConnections");
    expect(snapshot.enums).toHaveProperty(
      "public.platform_ai_connection_capability"
    );
  });
});
