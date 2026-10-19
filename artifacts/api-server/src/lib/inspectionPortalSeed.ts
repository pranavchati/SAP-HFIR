import { db } from "@workspace/db";
import {
  hfirRoundExecutions,
  hfirTemplates,
  importBatches,
  portalHistory,
  portalSettings,
  portalUsers,
  sapWorkOrders,
  workOrderMappings,
} from "@workspace/db";
import { logger } from "./logger";

const templates = [
  ["HFIR-0101", "VACUUM TRUCK PRE-USE CHECKLIST"],
  ["HFIR-0102", "MOBILE CRANE PRE-OPERATION INSPECTION"],
  ["HFIR-0103", "DIESEL GENERATOR WEEKLY INSPECTION"],
  ["HFIR-0104", "ELECTRIC MOTOR ROUTINE INSPECTION"],
  ["HFIR-0105", "PRESSURE VESSEL VISUAL INSPECTION"],
  ["HFIR-0106", "GAS DETECTOR PRE-USE CHECKLIST"],
  ["HFIR-0107", "SCAFFOLDING PRE-USE INSPECTION"],
  ["HFIR-0108", "STORAGE TANK EXTERNAL INSPECTION"],
  ["HFIR-0109", "CENTRIFUGAL PUMP ROUTINE INSPECTION"],
  ["HFIR-0110", "RECIPROCATING COMPRESSOR DAILY INSPECTION"],
] as const;

const workOrders = [
  {
    workOrderNo: "0000417823",
    description: "Inspect diesel generator cooling system",
    asset: "DG-4402",
    functionalLocation: "PLANT-A/UTILITIES/GEN-02",
    plant: "Riyadh Utilities",
    priority: "High",
    plannedStartDate: "2026-10-18",
    dueDate: "2026-10-22",
  },
  {
    workOrderNo: "0000417824",
    description: "Check mobile crane wire rope and brakes",
    asset: "CR-1008",
    functionalLocation: "PLANT-A/WORKSHOP/CRANE-08",
    plant: "Riyadh Utilities",
    priority: "Critical",
    plannedStartDate: "2026-10-16",
    dueDate: "2026-10-20",
  },
  {
    workOrderNo: "0000417825",
    description: "Routine inspection of transfer pump",
    asset: "P-2207",
    functionalLocation: "PLANT-B/PROCESS/PUMP-07",
    plant: "Jubail Process",
    priority: "Medium",
    plannedStartDate: "2026-10-17",
    dueDate: "2026-10-24",
  },
  {
    workOrderNo: "0000417826",
    description: "Verify gas detector calibration status",
    asset: "GD-0514",
    functionalLocation: "PLANT-B/PROCESS/DETECTOR-14",
    plant: "Jubail Process",
    priority: "High",
    plannedStartDate: "2026-10-14",
    dueDate: "2026-10-21",
  },
  {
    workOrderNo: "0000417827",
    description: "Inspect pressure vessel external condition",
    asset: "PV-0031",
    functionalLocation: "PLANT-C/REFINING/VESSEL-31",
    plant: "Yanbu Refining",
    priority: "Medium",
    plannedStartDate: "2026-10-15",
    dueDate: "2026-10-23",
  },
  {
    workOrderNo: "0000417828",
    description: "Weekly diesel generator readiness inspection",
    asset: "DG-4410",
    functionalLocation: "PLANT-A/UTILITIES/GEN-10",
    plant: "Riyadh Utilities",
    priority: "Low",
    plannedStartDate: "2026-10-19",
    dueDate: "2026-10-26",
  },
  {
    workOrderNo: "0000417829",
    description: "Inspect vacuum truck before dispatch",
    asset: "VT-0092",
    functionalLocation: "PLANT-B/LOGISTICS/TRUCK-92",
    plant: "Jubail Process",
    priority: "Medium",
    plannedStartDate: "2026-10-20",
    dueDate: "2026-10-27",
  },
  {
    workOrderNo: "0000417830",
    description: "Check cooling tower fan alignment and guards",
    asset: "CT-2105",
    functionalLocation: "PLANT-B/UTILITIES/COOLING-TOWER-05",
    plant: "Jubail Process",
    priority: "High",
    plannedStartDate: "2026-10-19",
    dueDate: "2026-10-22",
  },
  {
    workOrderNo: "0000417831",
    description: "Complete vacuum truck pre-use inspection",
    asset: "VT-0098",
    functionalLocation: "PLANT-C/LOGISTICS/TRUCK-98",
    plant: "Yanbu Refining",
    priority: "Medium",
    plannedStartDate: "2026-10-20",
    dueDate: "2026-10-23",
  },
  {
    workOrderNo: "0000417832",
    description: "Inspect scaffold access and tagging",
    asset: "SCF-0144",
    functionalLocation: "PLANT-A/MAINTENANCE/SCAFFOLD-144",
    plant: "Riyadh Utilities",
    priority: "Low",
    plannedStartDate: "2026-10-21",
    dueDate: "2026-10-29",
  },
];

const demoRounds = [
  {
    id: "round-demo-001",
    sourceRoundId: "HFIR-RND-7001",
    workOrderNo: "0000417825",
    templateName: "CENTRIFUGAL PUMP ROUTINE INSPECTION",
    templateId: "HFIR-0109",
    operatorId: "demo-operator-a",
    operatorName: "Salem Al Harbi",
    scheduledDate: "2026-10-17",
    dueDate: "2026-10-24",
    completedAt: "2026-10-17T11:20:00.000Z",
    executionStatus: "Successful",
    approvalStatus: "Awaiting approval",
    overdue: "Source: No",
    rawStatus: "COMPLETED",
    sourceTimestamp: new Date("2026-10-17T11:21:00.000Z"),
    rejectionReason: "",
    payload: { sample: true },
  },
  {
    id: "round-demo-002",
    sourceRoundId: "HFIR-RND-7002",
    workOrderNo: "0000417825",
    templateName: "CENTRIFUGAL PUMP ROUTINE INSPECTION",
    templateId: "HFIR-0109",
    operatorId: "demo-operator-a",
    operatorName: "Salem Al Harbi",
    scheduledDate: "2026-10-17",
    dueDate: "2026-10-24",
    completedAt: "2026-10-17T12:05:00.000Z",
    executionStatus: "Successful",
    approvalStatus: "Approved",
    overdue: "Source: No",
    rawStatus: "APPROVED",
    sourceTimestamp: new Date("2026-10-17T12:06:00.000Z"),
    rejectionReason: "",
    payload: { sample: true },
  },
  {
    id: "round-demo-003",
    sourceRoundId: "HFIR-RND-7003",
    workOrderNo: "0000417826",
    templateName: "GAS DETECTOR PRE-USE CHECKLIST",
    templateId: "HFIR-0106",
    operatorId: "demo-operator-b",
    operatorName: "Noura Al Qahtani",
    scheduledDate: "2026-10-15",
    dueDate: "2026-10-21",
    completedAt: "2026-10-15T09:15:00.000Z",
    executionStatus: "Incomplete",
    approvalStatus: "Rejected",
    overdue: "Source: No",
    rawStatus: "REJECTED",
    sourceTimestamp: new Date("2026-10-15T09:17:00.000Z"),
    rejectionReason: "Calibration certificate was not attached.",
    payload: { sample: true },
  },
  {
    id: "round-demo-004",
    sourceRoundId: "HFIR-RND-7004",
    workOrderNo: "0000417824",
    templateName: "MOBILE CRANE PRE-OPERATION INSPECTION",
    templateId: "HFIR-0102",
    operatorId: "demo-operator-a",
    operatorName: "Salem Al Harbi",
    scheduledDate: "2026-10-16",
    dueDate: "2026-10-20",
    completedAt: "",
    executionStatus: "Incomplete",
    approvalStatus: "Awaiting approval",
    overdue: "Source: Yes",
    rawStatus: "IN_PROGRESS",
    sourceTimestamp: new Date("2026-10-18T05:40:00.000Z"),
    rejectionReason: "",
    payload: { sample: true },
  },
  {
    id: "round-demo-005",
    sourceRoundId: "HFIR-RND-7005",
    workOrderNo: null,
    templateName: "STORAGE TANK EXTERNAL INSPECTION",
    templateId: "HFIR-0108",
    operatorId: "demo-operator-b",
    operatorName: "Noura Al Qahtani",
    scheduledDate: "2026-10-13",
    dueDate: "2026-10-19",
    completedAt: "",
    executionStatus: "Unknown",
    approvalStatus: "Unknown",
    overdue: "Unknown",
    rawStatus: "WAITING_REVIEW",
    sourceTimestamp: new Date("2026-10-17T14:00:00.000Z"),
    rejectionReason: "",
    payload: { sample: true, sapWorkOrderNo: "SAP-UNKNOWN-44" },
  },
] as const;

export async function seedInspectionPortal(): Promise<void> {
  try {
    await db.insert(hfirTemplates).values(
      templates.map(([id, name]) => ({ id, name, active: true, source: "Demo" })),
    ).onConflictDoNothing();

    await db.insert(portalUsers).values([
      { id: "demo-operator-a", name: "Salem Al Harbi", email: "demo.operator.a@example.invalid", role: "Operator" },
      { id: "demo-operator-b", name: "Noura Al Qahtani", email: "demo.operator.b@example.invalid", role: "Operator" },
      { id: "demo-planner", name: "Demo Planner", email: "demo.planner@example.invalid", role: "Planner/Coordinator" },
    ]).onConflictDoNothing();

    await db.insert(sapWorkOrders).values(workOrders.map((row) => ({
      ...row,
      lastImportBatch: "seed-demo",
    }))).onConflictDoNothing();

    await db.insert(workOrderMappings).values([
      {
        workOrderNo: "0000417824",
        templateId: "HFIR-0102",
        operatorId: "demo-operator-a",
        instructions: "Confirm the lifting limit switch before the visual check.",
        state: "Draft",
      },
      {
        workOrderNo: "0000417825",
        templateId: "HFIR-0109",
        operatorId: "demo-operator-a",
        instructions: "Record vibration and seal condition.",
        state: "Submitted",
        submittedBy: "demo-planner",
        submittedAt: new Date("2026-10-16T08:30:00.000Z"),
      },
      {
        workOrderNo: "0000417826",
        templateId: "HFIR-0106",
        operatorId: "demo-operator-b",
        instructions: "Attach the current calibration certificate.",
        state: "Submitted",
        submittedBy: "demo-planner",
        submittedAt: new Date("2026-10-14T06:45:00.000Z"),
      },
      {
        workOrderNo: "0000417827",
        templateId: "HFIR-0105",
        operatorId: "demo-operator-a",
        instructions: "",
        state: "Submitted",
        submittedBy: "demo-planner",
        submittedAt: new Date("2026-10-15T10:00:00.000Z"),
      },
      {
        workOrderNo: "0000417830",
        templateId: "HFIR-0104",
        operatorId: "demo-operator-a",
        instructions: "Check fan alignment, guard condition, and abnormal vibration.",
        state: "Submitted",
        submittedBy: "demo-planner",
        submittedAt: new Date("2026-10-18T07:15:00.000Z"),
      },
      {
        workOrderNo: "0000417831",
        templateId: "HFIR-0101",
        operatorId: "demo-operator-b",
        instructions: "Confirm hose, brakes, and emergency equipment before dispatch.",
        state: "Draft",
      },
    ]).onConflictDoNothing();

    await db.insert(hfirRoundExecutions).values(demoRounds.map((round) => ({
      ...round,
      lastSyncAt: new Date("2026-10-18T05:40:00.000Z"),
    }))).onConflictDoNothing();

    const demoHistoryEvents = [
      ...workOrders.map((row) => ({
        workOrderNo: row.workOrderNo,
        type: "SAP import",
        description: `Sample SAP work order imported: ${row.description}.`,
        actor: "Demo SAP import",
        occurredAt: new Date("2026-10-18T05:40:00.000Z"),
      })),
      { workOrderNo: "0000417824", type: "Mapping draft", description: "Draft mapping created for Mobile Crane Pre-Operation Inspection.", actor: "demo-planner", occurredAt: new Date("2026-10-16T08:10:00.000Z") },
      { workOrderNo: "0000417825", type: "Mapping submitted", description: "Pump routine inspection assigned to Salem Al Harbi.", actor: "demo-planner", occurredAt: new Date("2026-10-16T08:30:00.000Z") },
      { workOrderNo: "0000417826", type: "Mapping submitted", description: "Gas detector pre-use checklist assigned to Noura Al Qahtani.", actor: "demo-planner", occurredAt: new Date("2026-10-14T06:45:00.000Z") },
      { workOrderNo: "0000417827", type: "Mapping submitted", description: "Pressure vessel inspection assigned to Salem Al Harbi.", actor: "demo-planner", occurredAt: new Date("2026-10-15T10:00:00.000Z") },
      { workOrderNo: "0000417830", type: "Mapping submitted", description: "Cooling tower fan inspection assigned to Salem Al Harbi.", actor: "demo-planner", occurredAt: new Date("2026-10-18T07:15:00.000Z") },
      { workOrderNo: "0000417831", type: "Mapping draft", description: "Draft mapping created for vacuum truck pre-use inspection.", actor: "demo-planner", occurredAt: new Date("2026-10-18T07:25:00.000Z") },
      ...demoRounds.flatMap((round) => round.workOrderNo ? [{
        workOrderNo: round.workOrderNo,
        type: "HFIR result import",
        description: `Sample HFIR round ${round.sourceRoundId} imported: execution ${round.executionStatus}; approval ${round.approvalStatus}.`,
        actor: "Demo HFIR result import",
        occurredAt: round.sourceTimestamp,
      }] : []),
    ];
    const existingHistory = await db.select({
      workOrderNo: portalHistory.workOrderNo,
      type: portalHistory.type,
      description: portalHistory.description,
      actor: portalHistory.actor,
    }).from(portalHistory);
    const historyKeys = new Set(existingHistory.map((event) => JSON.stringify([
      event.workOrderNo, event.type, event.description, event.actor,
    ])));
    const missingHistory = demoHistoryEvents.filter((event) => {
      const key = JSON.stringify([event.workOrderNo, event.type, event.description, event.actor]);
      if (historyKeys.has(key)) return false;
      historyKeys.add(key);
      return true;
    });
    if (missingHistory.length) await db.insert(portalHistory).values(missingHistory);

    await db.insert(portalSettings).values([
      { key: "sapMode", value: "Demo" },
      { key: "hfirMode", value: "Demo" },
      { key: "openHfirUrl", value: "" },
      { key: "timezone", value: "Asia/Riyadh" },
      { key: "lastSyncAt", value: "2026-10-18T05:40:00.000Z" },
      { key: "lastSyncError", value: "Demo scenario: the latest HFIR synchronization failed. Previously received results are retained." },
    ]).onConflictDoNothing();

    await db.insert(importBatches).values({
      id: "seed-demo-import",
      kind: "SAP XML",
      filename: "sample-sap-work-orders.xml",
      importerId: "demo-planner",
      outcome: "Demo data",
      accepted: workOrders.length,
    }).onConflictDoUpdate({
      target: importBatches.id,
      set: { accepted: workOrders.length, outcome: "Demo data" },
    });
  } catch (error) {
    logger.error({ err: error }, "Unable to seed inspection portal demo data");
    throw error;
  }
}
