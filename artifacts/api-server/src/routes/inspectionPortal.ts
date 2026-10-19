import { createHash, randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { and, count, desc, eq, isNull, notLike, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  hfirRoundExecutions,
  hfirTemplates,
  importBatches,
  mappingRevisions,
  portalHistory,
  portalNotifications,
  portalSettings,
  portalUsers,
  roundStatusHistory,
  sapWorkOrders,
  workOrderMappings,
} from "@workspace/db";
import {
  BootstrapPortalAdminResponse,
  ExportTransactionHistoryQueryParams,
  GetPortalAdminResponse,
  GetPortalDashboardResponse,
  GetPortalMeResponse,
  GetWorkOrderParams,
  GetWorkOrderResponse,
  ImportHfirResultsBody,
  ImportHfirResultsResponse,
  ImportTemplatesBody,
  ImportTemplatesResponse,
  ImportWorkOrdersBody,
  ImportWorkOrdersResponse,
  ListAssignmentsResponse,
  ListNotificationsResponse,
  ListRoundsResponse,
  ListTemplatesResponse,
  ListTransactionHistoryQueryParams,
  ListTransactionHistoryResponse,
  ListWorkOrdersQueryParams,
  ListWorkOrdersResponse,
  MarkNotificationReadParams,
  MarkNotificationReadResponse,
  SaveWorkOrderMappingBody,
  SaveWorkOrderMappingParams,
  SaveWorkOrderMappingResponse,
  UpdatePortalSettingsBody,
  UpdatePortalSettingsResponse,
  UpdatePortalUserRoleBody,
  UpdatePortalUserRoleParams,
  UpdatePortalUserRoleResponse,
} from "@workspace/api-zod";
import { seedInspectionPortal } from "../lib/inspectionPortalSeed";
import { hfirResultsAdapter } from "../lib/integrations/hfirResultsAdapter";
import { sapWorkOrderAdapter, type SapWorkOrderImportRow } from "../lib/integrations/sapXmlAdapter";

const router: IRouter = Router();
const bootstrapLockKey = 710441;
const ALLOWED_ROLES = ["Administrator", "Planner/Coordinator", "Operator"] as const;
let seedPromise: Promise<void> | undefined;
router.use((_req, _res, next) => {
  seedPromise ??= seedInspectionPortal();
  void seedPromise.then(() => next()).catch(next);
});

const authRequired: RequestHandler = (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to use the inspection portal." });
    return;
  }
  next();
};

function requireRole(...roles: string[]): RequestHandler {
  return async (req, res, next) => {
    const userId = getAuth(req).userId;
    if (!userId) {
      res.status(401).json({ error: "Sign in to use the inspection portal." });
      return;
    }
    const [user] = await db.select().from(portalUsers).where(eq(portalUsers.id, userId)).limit(1);
    if (!user || !roles.includes(user.role)) {
      res.status(403).json({ error: "Your portal role does not allow this action." });
      return;
    }
    next();
  };
}

router.use(authRequired);

function currentUserId(req: Request): string {
  return getAuth(req).userId ?? "";
}

function portalUserShape(user: typeof portalUsers.$inferSelect) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function dateString(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function historyShape(entry: typeof portalHistory.$inferSelect) {
  return {
    id: String(entry.id),
    workOrderNo: entry.workOrderNo,
    type: entry.type,
    description: entry.description,
    occurredAt: entry.occurredAt.toISOString(),
    actor: entry.actor,
  };
}

async function recordHistory(workOrderNo: string, type: string, description: string, actor: string): Promise<void> {
  await db.insert(portalHistory).values({ workOrderNo, type, description, actor });
}

async function getSettings() {
  const rows = await db.select().from(portalSettings);
  const settings = Object.fromEntries(rows.map(({ key, value }) => [
    key,
    typeof value === "string" ? value : String(value ?? ""),
  ]));
  return {
    sapMode: "Demo",
    hfirMode: "Demo",
    openHfirUrl: settings.openHfirUrl ?? "",
    timezone: settings.timezone ?? "Asia/Riyadh",
    lastSyncAt: settings.lastSyncAt ?? "",
    lastSyncError: settings.lastSyncError ?? "",
  };
}

async function getWorkOrderRows() {
  return db.select({
    workOrder: sapWorkOrders,
    mapping: workOrderMappings,
    template: hfirTemplates,
    operator: portalUsers,
  })
    .from(sapWorkOrders)
    .leftJoin(workOrderMappings, eq(sapWorkOrders.workOrderNo, workOrderMappings.workOrderNo))
    .leftJoin(hfirTemplates, eq(workOrderMappings.templateId, hfirTemplates.id))
    .leftJoin(portalUsers, eq(workOrderMappings.operatorId, portalUsers.id))
    .orderBy(desc(sapWorkOrders.importedAt));
}

function workOrderShape(row: Awaited<ReturnType<typeof getWorkOrderRows>>[number], roundCount = 0) {
  return {
    workOrderNo: row.workOrder.workOrderNo,
    description: row.workOrder.description,
    asset: row.workOrder.asset,
    functionalLocation: row.workOrder.functionalLocation,
    plant: row.workOrder.plant,
    priority: row.workOrder.priority,
    plannedStartDate: row.workOrder.plannedStartDate ?? "",
    dueDate: row.workOrder.dueDate ?? "",
    mappingState: row.mapping?.state ?? "Unmapped",
    templateId: row.mapping?.templateId ?? "",
    templateName: row.template?.name ?? "",
    operatorId: row.mapping?.operatorId ?? "",
    operatorName: row.operator?.name ?? "",
    instructions: row.mapping?.instructions ?? "",
    submittedAt: dateString(row.mapping?.submittedAt),
    importedAt: row.workOrder.importedAt.toISOString(),
    roundCount,
  };
}

function roundShape(round: typeof hfirRoundExecutions.$inferSelect) {
  return {
    id: round.id,
    workOrderNo: round.workOrderNo ?? "",
    templateName: round.templateName,
    templateId: round.templateId,
    operatorName: round.operatorName,
    scheduledDate: round.scheduledDate,
    dueDate: round.dueDate,
    completedAt: round.completedAt,
    executionStatus: round.executionStatus,
    approvalStatus: round.approvalStatus,
    overdue: round.overdue,
    rawStatus: round.rawStatus,
    lastSyncAt: round.lastSyncAt.toISOString(),
    sourceTimestamp: dateString(round.sourceTimestamp),
    rejectionReason: round.rejectionReason,
  };
}

function notificationShape(row: typeof portalNotifications.$inferSelect) {
  const payload = row.payload as Record<string, string>;
  return {
    id: row.id,
    workOrderNo: row.workOrderNo,
    description: payload.description ?? "",
    asset: payload.asset ?? "",
    templateName: payload.templateName ?? "",
    templateId: payload.templateId ?? "",
    operatorId: row.operatorId,
    dueDate: payload.dueDate ?? "",
    instructions: payload.instructions ?? "",
    submitter: payload.submitter ?? "",
    createdAt: row.createdAt.toISOString(),
    read: row.read,
  };
}

async function getVisibleWorkOrderRows(userId: string, role: string) {
  const rows = await getWorkOrderRows();
  if (role !== "Operator") return rows;
  // Shared demo records stay visible so every signed-in role can explore the
  // seeded workspace; real work orders remain limited to the operator assigned.
  return rows.filter(({ workOrder, mapping }) => (
    workOrder.lastImportBatch === "seed-demo" || mapping?.operatorId === userId
  ));
}

async function getHistoryRows(
  filters: Record<string, string | undefined>,
  userId: string,
  role: string,
) {
  const workOrders = await getWorkOrderRows();
  const allowed = workOrders.filter(({ workOrder, mapping, template, operator }) => {
    if (role === "Operator" && workOrder.lastImportBatch !== "seed-demo" && mapping?.operatorId !== userId) return false;
    if (filters.search && ![
      workOrder.workOrderNo,
      workOrder.description,
      workOrder.asset,
      workOrder.plant,
      template?.name ?? "",
      operator?.name ?? "",
    ].some((value) => value.toLowerCase().includes(filters.search!.toLowerCase()))) return false;
    if (filters.asset && !workOrder.asset.toLowerCase().includes(filters.asset.toLowerCase())) return false;
    if (filters.plant && !workOrder.plant.toLowerCase().includes(filters.plant.toLowerCase())) return false;
    if (filters.template && !(template?.name ?? "").toLowerCase().includes(filters.template.toLowerCase())) return false;
    if (filters.operatorId && mapping?.operatorId !== filters.operatorId) return false;
    if (filters.state && (mapping?.state ?? "Unmapped") !== filters.state) return false;
    if (filters.importedFrom && workOrder.importedAt < new Date(`${filters.importedFrom}T00:00:00.000Z`)) return false;
    if (filters.importedTo && workOrder.importedAt > new Date(`${filters.importedTo}T23:59:59.999Z`)) return false;
    if (filters.submittedFrom && (!mapping?.submittedAt || mapping.submittedAt < new Date(`${filters.submittedFrom}T00:00:00.000Z`))) return false;
    if (filters.submittedTo && (!mapping?.submittedAt || mapping.submittedAt > new Date(`${filters.submittedTo}T23:59:59.999Z`))) return false;
    return true;
  });
  const allowedNumbers = new Set(allowed.map(({ workOrder }) => workOrder.workOrderNo));
  if (allowedNumbers.size === 0) return [];
  const events = await db.select().from(portalHistory)
    .where(or(...[...allowedNumbers].map((number) => eq(portalHistory.workOrderNo, number))))
    .orderBy(desc(portalHistory.occurredAt));
  return events.map(historyShape);
}

router.get("/me", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const [existing] = await db.select().from(portalUsers).where(eq(portalUsers.id, userId)).limit(1);
  if (existing) {
    res.json(GetPortalMeResponse.parse({
      user: portalUserShape(existing),
      bootstrapAvailable: false,
      demoMode: true,
    }));
    return;
  }

  const [realUsers] = await db.select({ value: count() }).from(portalUsers).where(notLike(portalUsers.id, "demo-%"));
  if (Number(realUsers?.value ?? 0) === 0) {
    res.json(GetPortalMeResponse.parse({ user: null, bootstrapAvailable: true, demoMode: true }));
    return;
  }

  await db.insert(portalUsers).values({
    id: userId,
    name: `User ${userId.slice(-6)}`,
    email: "",
    role: "Operator",
  }).onConflictDoNothing();
  const [user] = await db.select().from(portalUsers).where(eq(portalUsers.id, userId)).limit(1);
  res.json(GetPortalMeResponse.parse({
    user: user ? portalUserShape(user) : null,
    bootstrapAvailable: false,
    demoMode: true,
  }));
});

router.post("/bootstrap", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${bootstrapLockKey})`);
    const [current] = await tx.select().from(portalUsers).where(eq(portalUsers.id, userId)).limit(1);
    if (current) return current;
    const [realUsers] = await tx.select({ value: count() }).from(portalUsers).where(notLike(portalUsers.id, "demo-%"));
    if (Number(realUsers?.value ?? 0) !== 0) return null;
    const [admin] = await tx.insert(portalUsers).values({
      id: userId,
      name: `Administrator ${userId.slice(-6)}`,
      email: "",
      role: "Administrator",
    }).returning();
    return admin ?? null;
  });

  if (!result) {
    res.status(409).json({ error: "The initial administrator has already been claimed." });
    return;
  }
  res.json(BootstrapPortalAdminResponse.parse({
    user: portalUserShape(result),
    bootstrapAvailable: false,
    demoMode: true,
  }));
});

router.get("/dashboard", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const [user] = await db.select().from(portalUsers).where(eq(portalUsers.id, userId)).limit(1);
  const [allRows, allRounds, settings] = await Promise.all([
    getVisibleWorkOrderRows(userId, user?.role ?? "Operator"),
    db.select().from(hfirRoundExecutions).orderBy(desc(hfirRoundExecutions.lastSyncAt)),
    getSettings(),
  ]);
  const visibleNumbers = new Set(allRows.map(({ workOrder }) => workOrder.workOrderNo));
  const rounds = allRounds.filter((round) => (
    user?.role === "Operator"
      ? round.operatorId === userId
      : !round.workOrderNo || visibleNumbers.has(round.workOrderNo)
  ));
  const mapped = allRows.map((row) => workOrderShape(row));
  const recentActivity = await getHistoryRows({}, userId, user?.role ?? "Operator");
  const summary = {
    importedWorkOrders: mapped.length,
    unmappedWorkOrders: mapped.filter((row) => row.mappingState === "Unmapped").length,
    submittedMappings: mapped.filter((row) => row.mappingState === "Submitted").length,
    awaitingHfirData: mapped.filter((row) => row.mappingState === "Submitted" && !rounds.some((round) => round.workOrderNo === row.workOrderNo)).length,
    approvedRounds: rounds.filter((round) => round.approvalStatus === "Approved").length,
    rejectedRounds: rounds.filter((round) => round.approvalStatus === "Rejected").length,
    successfulRounds: rounds.filter((round) => round.executionStatus === "Successful").length,
    incompleteRounds: rounds.filter((round) => round.executionStatus === "Incomplete").length,
    overdueRounds: rounds.filter((round) => round.overdue === "Source: Yes" || round.overdue === "Calculated overdue").length,
    draftMappings: mapped.filter((row) => row.mappingState === "Draft").length,
  };
  res.json(GetPortalDashboardResponse.parse({
    summary,
    recentActivity: recentActivity.slice(0, 8),
    integrations: settings,
  }));
});

router.get("/work-orders", requireRole("Administrator", "Planner/Coordinator", "Operator"), async (req, res): Promise<void> => {
  const query = ListWorkOrdersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const userId = currentUserId(req);
  const [user] = await db.select().from(portalUsers).where(eq(portalUsers.id, userId)).limit(1);
  const rows = await getVisibleWorkOrderRows(userId, user?.role ?? "Operator");
  const rounds = await db.select({ workOrderNo: hfirRoundExecutions.workOrderNo }).from(hfirRoundExecutions);
  let data = rows.map((row) => workOrderShape(
    row,
    rounds.filter((round) => round.workOrderNo === row.workOrder.workOrderNo).length,
  ));
  if (query.data.search) {
    const search = query.data.search.toLowerCase();
    data = data.filter((row) => [
      row.workOrderNo, row.description, row.asset, row.plant, row.templateName, row.operatorName,
    ].some((value) => value.toLowerCase().includes(search)));
  }
  if (query.data.state) data = data.filter((row) => row.mappingState === query.data.state);
  res.json(ListWorkOrdersResponse.parse(data));
});

router.get("/work-orders/:workOrderNo", requireRole("Administrator", "Planner/Coordinator", "Operator"), async (req, res): Promise<void> => {
  const params = GetWorkOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = currentUserId(req);
  const [user] = await db.select().from(portalUsers).where(eq(portalUsers.id, userId)).limit(1);
  const rows = await getWorkOrderRows();
  const row = rows.find(({ workOrder }) => workOrder.workOrderNo === params.data.workOrderNo);
  if (!row || (user?.role === "Operator" && row.mapping?.operatorId !== userId)) {
    res.status(404).json({ error: "Work order not found." });
    return;
  }
  const [history, rounds] = await Promise.all([
    db.select().from(portalHistory).where(eq(portalHistory.workOrderNo, params.data.workOrderNo)).orderBy(desc(portalHistory.occurredAt)),
    db.select().from(hfirRoundExecutions).where(eq(hfirRoundExecutions.workOrderNo, params.data.workOrderNo)),
  ]);
  res.json(GetWorkOrderResponse.parse({
    workOrder: workOrderShape(row, rounds.length),
    history: history.map(historyShape),
    rounds: rounds.map(roundShape),
  }));
});

router.put("/work-orders/:workOrderNo/mapping", requireRole("Administrator", "Planner/Coordinator"), async (req, res): Promise<void> => {
  const params = SaveWorkOrderMappingParams.safeParse(req.params);
  const body = SaveWorkOrderMappingBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message ?? "Invalid mapping." });
    return;
  }
  const { workOrderNo } = params.data;
  const { action, templateId = "", operatorId = "", instructions = "", revisionReason = "", idempotencyKey } = body.data;
  const actorId = currentUserId(req);
  const [workOrder] = await db.select().from(sapWorkOrders).where(eq(sapWorkOrders.workOrderNo, workOrderNo)).limit(1);
  if (!workOrder) {
    res.status(404).json({ error: "Work order not found." });
    return;
  }
  const [oldMapping] = await db.select().from(workOrderMappings).where(eq(workOrderMappings.workOrderNo, workOrderNo)).limit(1);
  if (oldMapping?.state === "Submitted" && oldMapping.idempotencyKey === idempotencyKey) {
    const [row] = await getWorkOrderRows().then((rows) => rows.filter((candidate) => candidate.workOrder.workOrderNo === workOrderNo));
    res.json(SaveWorkOrderMappingResponse.parse({ workOrder: workOrderShape(row), notificationCreated: false, message: "This submission was already saved." }));
    return;
  }
  if (action === "Submit") {
    const [template] = await db.select().from(hfirTemplates).where(and(eq(hfirTemplates.id, templateId), eq(hfirTemplates.active, true))).limit(1);
    const [operator] = await db.select().from(portalUsers).where(and(eq(portalUsers.id, operatorId), eq(portalUsers.role, "Operator"))).limit(1);
    if (!template || !operator) {
      res.status(400).json({ error: "Choose an active HFIR template and an operator." });
      return;
    }
  }
  const changedSubmittedMapping = oldMapping?.state === "Submitted" && (
    action !== "Submit"
    || oldMapping.templateId !== templateId
    || oldMapping.operatorId !== operatorId
    || oldMapping.instructions !== instructions
  );
  if (changedSubmittedMapping && !revisionReason.trim()) {
    res.status(400).json({ error: "A reason is required to revise a submitted mapping." });
    return;
  }
  if (oldMapping?.state === "Submitted" && !changedSubmittedMapping) {
    const [row] = await getWorkOrderRows().then((rows) => rows.filter((candidate) => candidate.workOrder.workOrderNo === workOrderNo));
    res.json(SaveWorkOrderMappingResponse.parse({ workOrder: workOrderShape(row), notificationCreated: false, message: "No changes were made; the existing assignment remains active." }));
    return;
  }
  const nextState = action === "Submit" ? "Submitted" : "Draft";
  let notificationCreated = false;
  await db.transaction(async (tx) => {
    if (oldMapping) {
      const revisions = await tx.select().from(mappingRevisions).where(eq(mappingRevisions.workOrderNo, workOrderNo));
      await tx.insert(mappingRevisions).values({
        workOrderNo,
        revision: revisions.length + 1,
        snapshot: {
          templateId: oldMapping.templateId,
          operatorId: oldMapping.operatorId,
          instructions: oldMapping.instructions,
          state: oldMapping.state,
          submittedBy: oldMapping.submittedBy,
          submittedAt: dateString(oldMapping.submittedAt),
        },
        changedBy: actorId,
        reason: revisionReason,
      });
    }
    await tx.insert(workOrderMappings).values({
      workOrderNo,
      templateId: templateId || null,
      operatorId: operatorId || null,
      instructions,
      state: nextState,
      submittedBy: nextState === "Submitted" ? actorId : null,
      submittedAt: nextState === "Submitted" ? new Date() : null,
      revisionReason,
      idempotencyKey,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: workOrderMappings.workOrderNo,
      set: {
        templateId: templateId || null,
        operatorId: operatorId || null,
        instructions,
        state: nextState,
        submittedBy: nextState === "Submitted" ? actorId : null,
        submittedAt: nextState === "Submitted" ? new Date() : null,
        revisionReason,
        idempotencyKey,
        updatedAt: new Date(),
      },
    });
    if (nextState === "Submitted") {
      const [submitter] = await tx.select().from(portalUsers).where(eq(portalUsers.id, actorId)).limit(1);
      const [template] = await tx.select().from(hfirTemplates).where(eq(hfirTemplates.id, templateId)).limit(1);
      const notificationPayload = {
        description: workOrder.description,
        asset: workOrder.asset,
        templateName: template?.name ?? "",
        templateId,
        dueDate: workOrder.dueDate ?? "",
        instructions,
        submitter: submitter?.name ?? actorId,
        operatorInstruction: "Open HFIR, schedule the selected round template, and manually enter this SAP work order number when creating or executing the round.",
      };
      await tx.insert(portalNotifications).values({
        id: randomUUID(),
        operatorId,
        workOrderNo,
        payload: notificationPayload,
      });
      notificationCreated = true;
    }
  });

  await recordHistory(
    workOrderNo,
    oldMapping?.state === "Submitted" ? "Mapping revised" : nextState === "Submitted" ? "Mapping submitted" : "Mapping draft",
    nextState === "Submitted"
      ? `${oldMapping?.state === "Submitted" ? "Mapping revised and reassigned" : "Mapping submitted"} to ${operatorId}; template ${templateId}. ${revisionReason ? `Reason: ${revisionReason}` : ""}`.trim()
      : `Draft mapping saved for template ${templateId || "not selected"}.`,
    actorId,
  );
  const [row] = await getWorkOrderRows().then((rows) => rows.filter((candidate) => candidate.workOrder.workOrderNo === workOrderNo));
  res.json(SaveWorkOrderMappingResponse.parse({
    workOrder: workOrderShape(row),
    notificationCreated,
    message: notificationCreated ? "Mapping saved. Operator notification created in the portal." : "Draft saved; no operator notification was sent.",
  }));
});

function sameWorkOrder(
  existing: typeof sapWorkOrders.$inferSelect,
  incoming: SapWorkOrderImportRow,
) {
  return existing.description === incoming.description
    && existing.asset === incoming.asset
    && existing.functionalLocation === incoming.functionalLocation
    && existing.plant === incoming.plant
    && existing.priority === incoming.priority
    && (existing.plannedStartDate ?? "") === incoming.plannedStartDate
    && (existing.dueDate ?? "") === incoming.dueDate;
}

router.post("/imports/work-orders", requireRole("Administrator", "Planner/Coordinator"), async (req, res): Promise<void> => {
  const body = ImportWorkOrdersBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  let rows: SapWorkOrderImportRow[];
  try {
    rows = sapWorkOrderAdapter.parseExport(body.data.filename, body.data.xml);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Unable to parse XML." });
    return;
  }
  const batchId = randomUUID();
  const valid = rows.filter((row) => row.workOrderNo && row.errors.length === 0);
  const preview: Array<Record<string, unknown>> = [];
  let accepted = 0;
  let rejected = rows.length - valid.length;
  let updated = 0;
  let duplicates = 0;
  const errors = rows.flatMap((row) => row.errors);
  for (const row of valid) {
    const [existing] = await db.select().from(sapWorkOrders).where(eq(sapWorkOrders.workOrderNo, row.workOrderNo)).limit(1);
    const action = !existing ? "New" : sameWorkOrder(existing, row) ? "Duplicate" : "Update";
    if (action === "New") accepted += 1;
    if (action === "Update") updated += 1;
    if (action === "Duplicate") duplicates += 1;
    preview.push({ ...row, errors: [], action });
  }
  if (!body.data.confirm) {
    await db.insert(importBatches).values({
      id: batchId,
      kind: "SAP XML",
      filename: body.data.filename,
      importerId: currentUserId(req),
      outcome: "Preview",
      accepted,
      rejected,
      updated,
      duplicates,
      errors,
    });
    res.json(ImportWorkOrdersResponse.parse({ batchId, accepted, rejected, updated, duplicates, errors, preview }));
    return;
  }

  await db.transaction(async (tx) => {
    for (const row of valid) {
      const [existing] = await tx.select().from(sapWorkOrders).where(eq(sapWorkOrders.workOrderNo, row.workOrderNo)).limit(1);
      if (existing && sameWorkOrder(existing, row)) continue;
      await tx.insert(sapWorkOrders).values({
        workOrderNo: row.workOrderNo,
        description: row.description,
        asset: row.asset,
        functionalLocation: row.functionalLocation,
        plant: row.plant,
        priority: row.priority,
        plannedStartDate: row.plannedStartDate || null,
        dueDate: row.dueDate || null,
        lastImportBatch: batchId,
      }).onConflictDoUpdate({
        target: sapWorkOrders.workOrderNo,
        set: {
          description: row.description,
          asset: row.asset,
          functionalLocation: row.functionalLocation,
          plant: row.plant,
          priority: row.priority,
          plannedStartDate: row.plannedStartDate || null,
          dueDate: row.dueDate || null,
          importedAt: new Date(),
          lastImportBatch: batchId,
        },
      });
      await tx.insert(portalHistory).values({
        workOrderNo: row.workOrderNo,
        type: existing ? "Source update" : "Imported",
        description: existing ? `SAP source fields updated from ${body.data.filename}; existing mapping retained.` : `Imported from ${body.data.filename}.`,
        actor: currentUserId(req),
      });
    }
    await tx.insert(importBatches).values({
      id: batchId,
      kind: "SAP XML",
      filename: body.data.filename,
      importerId: currentUserId(req),
      outcome: rejected ? "Completed with rejected rows" : "Completed",
      accepted,
      rejected,
      updated,
      duplicates,
      errors,
    });
  });
  res.json(ImportWorkOrdersResponse.parse({ batchId, accepted, rejected, updated, duplicates, errors, preview }));
});

router.get("/templates", async (_req, res): Promise<void> => {
  const [templates, users] = await Promise.all([
    db.select().from(hfirTemplates).orderBy(hfirTemplates.name),
    db.select().from(portalUsers).where(eq(portalUsers.role, "Operator")).orderBy(portalUsers.name),
  ]);
  res.json(ListTemplatesResponse.parse({
    templates: templates.map((template) => ({ id: template.id, name: template.name, active: template.active, source: template.source })),
    operators: users.map(portalUserShape),
  }));
});

router.post("/templates/import", requireRole("Administrator"), async (req, res): Promise<void> => {
  const body = ImportTemplatesBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const errors: string[] = [];
  let accepted = 0;
  let updated = 0;
  for (const [index, template] of body.data.templates.entries()) {
    if (!template.id.trim() || !template.name.trim()) {
      errors.push(`Row ${index + 1}: template ID and name are required.`);
      continue;
    }
    const [existing] = await db.select().from(hfirTemplates).where(eq(hfirTemplates.id, template.id)).limit(1);
    await db.insert(hfirTemplates).values({
      id: template.id,
      name: template.name,
      active: template.active,
      source: template.source || "Imported",
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: hfirTemplates.id,
      set: { name: template.name, active: template.active, source: template.source || "Imported", updatedAt: new Date() },
    });
    if (existing) updated += 1;
    else accepted += 1;
  }
  const batchId = randomUUID();
  await db.insert(importBatches).values({
    id: batchId,
    kind: "HFIR templates",
    filename: body.data.filename,
    importerId: currentUserId(req),
    outcome: errors.length ? "Completed with rejected rows" : "Completed",
    accepted,
    rejected: errors.length,
    updated,
    errors,
  });
  res.json(ImportTemplatesResponse.parse({ batchId, accepted, rejected: errors.length, updated, duplicates: 0, errors, preview: [] }));
});

router.get("/assignments", requireRole("Administrator", "Planner/Coordinator", "Operator"), async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const rows = await getWorkOrderRows();
  const assignments = rows.filter((row) => row.mapping?.state === "Submitted" && row.mapping.operatorId === userId).map((row) => workOrderShape(row));
  res.json(ListAssignmentsResponse.parse(assignments));
});

router.get("/notifications", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const [user] = await db.select().from(portalUsers).where(eq(portalUsers.id, userId)).limit(1);
  const records = await db.select().from(portalNotifications).orderBy(desc(portalNotifications.createdAt));
  const visible = records.filter((row) => user?.role === "Operator" ? row.operatorId === userId : true);
  res.json(ListNotificationsResponse.parse(visible.map(notificationShape)));
});

router.post("/notifications/:notificationId/read", async (req, res): Promise<void> => {
  const params = MarkNotificationReadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = currentUserId(req);
  const [notification] = await db.select().from(portalNotifications).where(eq(portalNotifications.id, params.data.notificationId)).limit(1);
  if (!notification) {
    res.status(404).json({ error: "Notification not found." });
    return;
  }
  const [user] = await db.select().from(portalUsers).where(eq(portalUsers.id, userId)).limit(1);
  if (user?.role === "Operator" && notification.operatorId !== userId) {
    res.status(404).json({ error: "Notification not found." });
    return;
  }
  const [updatedNotification] = await db.update(portalNotifications)
    .set({ read: true })
    .where(eq(portalNotifications.id, notification.id))
    .returning();
  res.json(MarkNotificationReadResponse.parse(updatedNotification ? notificationShape(updatedNotification) : notificationShape(notification)));
});

router.get("/rounds", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const [user] = await db.select().from(portalUsers).where(eq(portalUsers.id, userId)).limit(1);
  const rounds = await db.select().from(hfirRoundExecutions).orderBy(desc(hfirRoundExecutions.lastSyncAt));
  const canSeeAllRounds = user?.role === "Administrator" || user?.role === "Planner/Coordinator";
  const visible = canSeeAllRounds ? rounds : rounds.filter((round) => {
    const payload = round.payload;
    const isSharedDemoRound = !!payload
      && typeof payload === "object"
      && !Array.isArray(payload)
      && (payload as Record<string, unknown>).sample === true;
    return isSharedDemoRound || (user?.role === "Operator" && round.operatorId === userId);
  });
  res.json(ListRoundsResponse.parse(visible.map(roundShape)));
});

router.post("/imports/hfir-results", requireRole("Administrator"), async (req, res): Promise<void> => {
  const body = ImportHfirResultsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  let accepted = 0;
  let updated = 0;
  let duplicates = 0;
  let rejected = 0;
  const errors: string[] = [];
  const batchId = randomUUID();
  const batchTime = new Date();
  for (const [index, item] of body.data.rounds.entries()) {
    if (!item.sourceRoundId.trim()) {
      rejected += 1;
      errors.push(`Row ${index + 1}: HFIR round instance ID is required.`);
      continue;
    }
    const normalizedResult = hfirResultsAdapter.normalize(item);
    const rawWorkOrderNo = normalizedResult.originalWorkOrderNo;
    const [matchedWorkOrder] = rawWorkOrderNo
      ? await db.select().from(sapWorkOrders).where(eq(sapWorkOrders.workOrderNo, rawWorkOrderNo)).limit(1)
      : [];
    const linkedWorkOrderNo = matchedWorkOrder?.workOrderNo ?? null;
    const { rawStatus, executionStatus, approvalStatus, overdue, sourceTimestamp } = normalizedResult;
    const [existing] = await db.select().from(hfirRoundExecutions)
      .where(eq(hfirRoundExecutions.sourceRoundId, item.sourceRoundId)).limit(1);
    if (existing && existing.sourceTimestamp && sourceTimestamp && sourceTimestamp < existing.sourceTimestamp) {
      duplicates += 1;
      continue;
    }
    const payload = {
      ...item,
      originalWorkOrderNo: rawWorkOrderNo,
      unmatchedReason: !rawWorkOrderNo ? "Missing SAP work order number" : !matchedWorkOrder ? "SAP work order not found" : "",
    };
    const candidate = {
      id: item.id || existing?.id || `hfir-${createHash("sha256").update(item.sourceRoundId).digest("hex").slice(0, 20)}`,
      sourceRoundId: item.sourceRoundId,
      workOrderNo: linkedWorkOrderNo,
      templateName: item.templateName ?? "",
      templateId: item.templateId ?? "",
      operatorId: item.operatorId ?? "",
      operatorName: item.operatorName ?? "",
      scheduledDate: item.scheduledDate ?? "",
      dueDate: item.dueDate ?? "",
      completedAt: item.completedAt ?? "",
      executionStatus,
      approvalStatus,
      overdue,
      rawStatus,
      lastSyncAt: batchTime,
      sourceTimestamp,
      rejectionReason: item.rejectionReason ?? "",
      payload,
    };
    const same = existing
      && existing.workOrderNo === candidate.workOrderNo
      && existing.templateName === candidate.templateName
      && existing.templateId === candidate.templateId
      && existing.operatorId === candidate.operatorId
      && existing.executionStatus === candidate.executionStatus
      && existing.approvalStatus === candidate.approvalStatus
      && existing.overdue === candidate.overdue
      && existing.rawStatus === candidate.rawStatus
      && existing.rejectionReason === candidate.rejectionReason;
    if (same) {
      duplicates += 1;
      continue;
    }
    await db.transaction(async (tx) => {
      const [saved] = await tx.insert(hfirRoundExecutions).values(candidate).onConflictDoUpdate({
        target: hfirRoundExecutions.sourceRoundId,
        set: {
          ...candidate,
          id: existing?.id ?? candidate.id,
        },
      }).returning();
      if (saved) {
        await tx.insert(roundStatusHistory).values({
          roundId: saved.id,
          rawStatus,
          executionStatus,
          approvalStatus,
          overdue,
          sourceTimestamp,
        });
      }
      if (linkedWorkOrderNo) {
        await tx.insert(portalHistory).values({
          workOrderNo: linkedWorkOrderNo,
          type: "HFIR status update",
          description: `HFIR round ${item.sourceRoundId} status received: ${rawStatus || "Unknown"}. Execution: ${executionStatus}; approval: ${approvalStatus}; overdue: ${overdue}.`,
          actor: currentUserId(req),
        });
      }
    });
    if (existing) updated += 1;
    else accepted += 1;
    if (!rawWorkOrderNo || !matchedWorkOrder) {
      req.log.info({ sourceRoundId: item.sourceRoundId, workOrderNo: rawWorkOrderNo }, "HFIR result stored in unmatched queue");
    }
  }
  await db.insert(importBatches).values({
    id: batchId,
    kind: "HFIR results",
    filename: body.data.filename,
    importerId: currentUserId(req),
    outcome: rejected ? "Completed with rejected rows" : "Completed",
    accepted,
    rejected,
    updated,
    duplicates,
    errors,
  });
  for (const [key, value] of [["lastSyncAt", batchTime.toISOString()], ["lastSyncError", ""]] as const) {
    await db.insert(portalSettings).values({ key, value, updatedAt: batchTime }).onConflictDoUpdate({
      target: portalSettings.key,
      set: { value, updatedAt: batchTime },
    });
  }
  res.json(ImportHfirResultsResponse.parse({ batchId, accepted, rejected, updated, duplicates, errors, preview: [] }));
});

function historyFilters(data: Record<string, unknown>) {
  const fields = ["search", "asset", "plant", "template", "operatorId", "state", "importedFrom", "importedTo", "submittedFrom", "submittedTo"];
  return Object.fromEntries(fields.map((key) => [key, typeof data[key] === "string" && data[key] ? data[key] as string : undefined]));
}

router.get("/history", async (req, res): Promise<void> => {
  const filters = ListTransactionHistoryQueryParams.safeParse(req.query);
  if (!filters.success) {
    res.status(400).json({ error: filters.error.message });
    return;
  }
  const userId = currentUserId(req);
  const [user] = await db.select().from(portalUsers).where(eq(portalUsers.id, userId)).limit(1);
  const entries = await getHistoryRows(historyFilters(filters.data), userId, user?.role ?? "Operator");
  res.json(ListTransactionHistoryResponse.parse(entries));
});

router.get("/history.csv", async (req, res): Promise<void> => {
  const filters = ExportTransactionHistoryQueryParams.safeParse(req.query);
  if (!filters.success) {
    res.status(400).send(filters.error.message);
    return;
  }
  const userId = currentUserId(req);
  const [user] = await db.select().from(portalUsers).where(eq(portalUsers.id, userId)).limit(1);
  const entries = await getHistoryRows(historyFilters(filters.data), userId, user?.role ?? "Operator");
  const escapeCsv = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const csv = [
    ["Work order", "Event", "Description", "Timestamp", "Actor"].map(escapeCsv).join(","),
    ...entries.map((entry) => [
      entry.workOrderNo, entry.type, entry.description, entry.occurredAt, entry.actor,
    ].map(escapeCsv).join(",")),
  ].join("\r\n");
  res.type("text/csv").attachment("sap-hfir-transaction-history.csv").send(csv);
});

router.get("/admin", requireRole("Administrator"), async (_req, res): Promise<void> => {
  const [users, templates, settings, unmatchedRows] = await Promise.all([
    db.select().from(portalUsers).orderBy(portalUsers.name),
    db.select().from(hfirTemplates).orderBy(hfirTemplates.name),
    getSettings(),
    db.select().from(hfirRoundExecutions).where(isNull(hfirRoundExecutions.workOrderNo)).orderBy(desc(hfirRoundExecutions.lastSyncAt)),
  ]);
  res.json(GetPortalAdminResponse.parse({
    users: users.filter((user) => !user.id.startsWith("demo-")).map(portalUserShape),
    templates: templates.map((template) => ({ id: template.id, name: template.name, active: template.active, source: template.source })),
    settings,
    unmatched: unmatchedRows.map(roundShape),
  }));
});

router.patch("/admin/settings", requireRole("Administrator"), async (req, res): Promise<void> => {
  const body = UpdatePortalSettingsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (body.data.timezone) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: body.data.timezone });
    } catch {
      res.status(400).json({ error: "Enter a valid IANA timezone." });
      return;
    }
  }
  if (body.data.openHfirUrl) {
    try {
      const parsed = new URL(body.data.openHfirUrl);
      if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("Unsupported URL scheme.");
    } catch {
      res.status(400).json({ error: "Enter a valid HTTP or HTTPS HFIR URL." });
      return;
    }
  }
  const entries = Object.entries(body.data).filter(([, value]) => value !== undefined);
  for (const [key, value] of entries) {
    await db.insert(portalSettings).values({ key, value: value ?? "", updatedAt: new Date() }).onConflictDoUpdate({
      target: portalSettings.key,
      set: { value: value ?? "", updatedAt: new Date() },
    });
  }
  res.json(UpdatePortalSettingsResponse.parse(await getSettings()));
});

router.patch("/admin/users/:userId/role", requireRole("Administrator"), async (req, res): Promise<void> => {
  const params = UpdatePortalUserRoleParams.safeParse(req.params);
  const body = UpdatePortalUserRoleBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message ?? "Invalid role." });
    return;
  }
  if (!(ALLOWED_ROLES as readonly string[]).includes(body.data.role)) {
    res.status(400).json({ error: "Select a valid portal role." });
    return;
  }
  if (params.data.userId === currentUserId(req) && body.data.role !== "Administrator") {
    const admins = await db.select().from(portalUsers).where(eq(portalUsers.role, "Administrator"));
    if (admins.length <= 1) {
      res.status(409).json({ error: "You cannot remove the last administrator." });
      return;
    }
  }
  const [user] = await db.update(portalUsers).set({ role: body.data.role })
    .where(eq(portalUsers.id, params.data.userId)).returning();
  if (!user) {
    res.status(404).json({ error: "Portal user not found." });
    return;
  }
  res.json(UpdatePortalUserRoleResponse.parse(portalUserShape(user)));
});

export default router;
