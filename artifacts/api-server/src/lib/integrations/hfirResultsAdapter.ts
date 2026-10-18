import type { IntegrationMode } from "./sapXmlAdapter";

export interface HfirResultInput {
  workOrderNo?: string | null;
  sapWorkOrderNo?: string | null;
  rawStatus?: string;
  executionStatus?: string;
  approvalStatus?: string;
  overdue?: string;
  sourceTimestamp?: string;
  lastSyncAt?: string;
}

export interface NormalizedHfirResult {
  originalWorkOrderNo: string;
  rawStatus: string;
  executionStatus: "Successful" | "Incomplete" | "Unknown";
  approvalStatus: "Approved" | "Rejected" | "Awaiting approval" | "Unknown";
  overdue: "Source: Yes" | "Source: No" | "Calculated overdue" | "Unknown";
  sourceTimestamp: Date | null;
}

export interface HfirResultsAdapter {
  readonly mode: IntegrationMode;
  normalize(record: HfirResultInput): NormalizedHfirResult;
}

function normalizeExecution(value: string): NormalizedHfirResult["executionStatus"] {
  const normalized = value.toLowerCase();
  if (["successful", "success", "completed", "complete", "closed"].includes(normalized)) return "Successful";
  if (["incomplete", "in progress", "in_progress", "started"].includes(normalized)) return "Incomplete";
  return "Unknown";
}

function normalizeApproval(value: string, rawStatus: string): NormalizedHfirResult["approvalStatus"] {
  const normalized = (value || rawStatus).toLowerCase();
  if (normalized.includes("await")) return "Awaiting approval";
  if (normalized.includes("approv")) return "Approved";
  if (normalized.includes("reject")) return "Rejected";
  return "Unknown";
}

function normalizeOverdue(value: string): NormalizedHfirResult["overdue"] {
  const normalized = value.toLowerCase();
  if (["yes", "true", "overdue", "source: yes"].includes(normalized)) return "Source: Yes";
  if (["no", "false", "not overdue", "source: no"].includes(normalized)) return "Source: No";
  if (normalized === "calculated overdue") return "Calculated overdue";
  return "Unknown";
}

function parseSourceDate(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export class ImportedHfirResultsAdapter implements HfirResultsAdapter {
  readonly mode = "Demo" as const;

  normalize(record: HfirResultInput): NormalizedHfirResult {
    const rawStatus = record.rawStatus ?? "";
    return {
      originalWorkOrderNo: record.workOrderNo || record.sapWorkOrderNo || "",
      rawStatus,
      executionStatus: normalizeExecution(record.executionStatus ?? rawStatus),
      approvalStatus: normalizeApproval(record.approvalStatus ?? "", rawStatus),
      overdue: normalizeOverdue(record.overdue ?? ""),
      sourceTimestamp: parseSourceDate(record.sourceTimestamp ?? record.lastSyncAt ?? ""),
    };
  }
}

export const hfirResultsAdapter: HfirResultsAdapter = new ImportedHfirResultsAdapter();
