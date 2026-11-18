/** The saved result of the nightly check of episode dates (air-check.ts), for the owner's admin page. */
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Finding } from "./air-check";

export type AirCheck = {
  day: string;
  ranAt: number;
  status: "ok" | "unchecked";
  checked: number;
  agreed: number;
  summaryAr: string;
  findings: (Finding & { noteAr?: string })[];
};

export function latestAirCheck(): AirCheck | null {
  let row;
  try {
    row = db.select().from(schema.airChecks).orderBy(desc(schema.airChecks.day)).limit(1).get();
  } catch {
    // A deploy restarts the site before it migrates: for that minute the table is not there yet.
    return null;
  }
  if (!row) return null;
  let findings: AirCheck["findings"] = [];
  try {
    findings = JSON.parse(row.findings);
  } catch {
    // A row that cannot be read shows its summary and no list.
  }
  return { ...row, findings };
}
