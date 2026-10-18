import { XMLParser, XMLValidator } from "fast-xml-parser";

export type IntegrationMode = "Demo" | "Live";

export interface SapWorkOrderImportRow {
  workOrderNo: string;
  description: string;
  asset: string;
  functionalLocation: string;
  plant: string;
  priority: string;
  plannedStartDate: string;
  dueDate: string;
  errors: string[];
}

export interface SapWorkOrderImportAdapter {
  readonly mode: IntegrationMode;
  parseExport(filename: string, xml: string): SapWorkOrderImportRow[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  processEntities: false,
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  allowBooleanAttributes: false,
});

function normalizedKey(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function scalar(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (value && typeof value === "object" && "#text" in value) return scalar((value as Record<string, unknown>)["#text"]);
  return "";
}

function findField(record: Record<string, unknown>, aliases: string[]): string {
  const wanted = new Set(aliases.map(normalizedKey));
  for (const [key, value] of Object.entries(record)) {
    if (wanted.has(normalizedKey(key))) return scalar(value);
  }
  return "";
}

function collectWorkOrderCandidates(value: unknown, found: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectWorkOrderCandidates(item, found);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => ["workorderno", "ordernumber", "aufnr", "orderid"].includes(normalizedKey(key)))) {
    found.push(record);
    return;
  }
  for (const child of Object.values(record)) collectWorkOrderCandidates(child, found);
}

function normalizeDate(value: string): string {
  if (!value) return "";
  const compact = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return "";
}

export class SapXmlImportAdapter implements SapWorkOrderImportAdapter {
  readonly mode = "Demo" as const;

  parseExport(filename: string, xml: string): SapWorkOrderImportRow[] {
    if (!/\.xml$/i.test(filename)) throw new Error("Choose an XML file.");
    if (Buffer.byteLength(xml, "utf8") > 5 * 1024 * 1024) throw new Error("XML file exceeds the 5 MB limit.");
    if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error("DTD and entity declarations are disabled for safety.");
    const validation = XMLValidator.validate(xml, { allowBooleanAttributes: false });
    if (validation !== true) throw new Error(`Invalid XML structure: ${validation.err.msg} at line ${validation.err.line}, column ${validation.err.col}.`);
    const parsed = parser.parse(xml) as unknown;
    const candidates: Record<string, unknown>[] = [];
    collectWorkOrderCandidates(parsed, candidates);
    if (candidates.length === 0) throw new Error("No work orders were found. Use the documented <WorkOrders><WorkOrder> sample structure.");
    return candidates.map((row, index) => {
      const workOrderNo = findField(row, ["WorkOrderNo", "OrderNumber", "OrderNo", "AUFNR", "OrderId"]);
      const missing = !workOrderNo ? [`Row ${index + 1}: SAP work order number is required.`] : [];
      return {
        workOrderNo,
        description: findField(row, ["Description", "ShortText", "OrderDescription"]),
        asset: findField(row, ["Asset", "Equipment", "EquipmentId", "AssetId"]),
        functionalLocation: findField(row, ["FunctionalLocation", "FuncLocation", "Location"]),
        plant: findField(row, ["Plant", "Site", "PlantName"]),
        priority: findField(row, ["Priority", "PriorityText"]),
        plannedStartDate: normalizeDate(findField(row, ["PlannedStartDate", "StartDate", "BasicStartDate"])),
        dueDate: normalizeDate(findField(row, ["DueDate", "BasicFinishDate", "FinishDate"])),
        errors: missing,
      };
    });
  }
}

export const sapWorkOrderAdapter: SapWorkOrderImportAdapter = new SapXmlImportAdapter();
