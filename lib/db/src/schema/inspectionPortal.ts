import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const portalUsers = pgTable("portal_users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("Operator"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const hfirTemplates = pgTable("hfir_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  source: text("source").notNull().default("Demo"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sapWorkOrders = pgTable("sap_work_orders", {
  workOrderNo: text("work_order_no").primaryKey(),
  description: text("description").notNull().default(""),
  asset: text("asset").notNull().default(""),
  functionalLocation: text("functional_location").notNull().default(""),
  plant: text("plant").notNull().default(""),
  priority: text("priority").notNull().default(""),
  plannedStartDate: date("planned_start_date", { mode: "string" }),
  dueDate: date("due_date", { mode: "string" }),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  lastImportBatch: text("last_import_batch"),
});

export const workOrderMappings = pgTable("work_order_mappings", {
  workOrderNo: text("work_order_no").primaryKey(),
  templateId: text("template_id"),
  operatorId: text("operator_id"),
  instructions: text("instructions").notNull().default(""),
  state: text("state").notNull().default("Draft"),
  submittedBy: text("submitted_by"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  revisionReason: text("revision_reason").notNull().default(""),
  idempotencyKey: text("idempotency_key"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mappingRevisions = pgTable("mapping_revisions", {
  id: serial("id").primaryKey(),
  workOrderNo: text("work_order_no").notNull(),
  revision: integer("revision").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  changedBy: text("changed_by").notNull(),
  reason: text("reason").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  workOrderRevision: uniqueIndex("mapping_revision_unique").on(table.workOrderNo, table.revision),
}));

export const portalNotifications = pgTable("portal_notifications", {
  id: text("id").primaryKey(),
  operatorId: text("operator_id").notNull(),
  workOrderNo: text("work_order_no").notNull(),
  payload: jsonb("payload").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  operatorCreated: index("notification_operator_created_idx").on(table.operatorId, table.createdAt),
}));

export const hfirRoundExecutions = pgTable("hfir_round_executions", {
  id: text("id").primaryKey(),
  sourceRoundId: text("source_round_id").notNull(),
  workOrderNo: text("work_order_no"),
  templateName: text("template_name").notNull().default(""),
  templateId: text("template_id").notNull().default(""),
  operatorId: text("operator_id").notNull().default(""),
  operatorName: text("operator_name").notNull().default(""),
  scheduledDate: text("scheduled_date").notNull().default(""),
  dueDate: text("due_date").notNull().default(""),
  completedAt: text("completed_at").notNull().default(""),
  executionStatus: text("execution_status").notNull().default("Unknown"),
  approvalStatus: text("approval_status").notNull().default("Unknown"),
  overdue: text("overdue").notNull().default("Unknown"),
  rawStatus: text("raw_status").notNull().default(""),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }).notNull().defaultNow(),
  sourceTimestamp: timestamp("source_timestamp", { withTimezone: true }),
  rejectionReason: text("rejection_reason").notNull().default(""),
  payload: jsonb("payload").notNull().default({}),
}, (table) => ({
  sourceRoundUnique: uniqueIndex("hfir_round_source_unique").on(table.sourceRoundId),
  workOrderNoIdx: index("hfir_round_work_order_idx").on(table.workOrderNo),
}));

export const hfirRoundAttachments = pgTable("hfir_round_attachments", {
  id: text("id").primaryKey(),
  roundId: text("round_id").notNull().references(() => hfirRoundExecutions.id, { onDelete: "cascade" }),
  objectPath: text("object_path").notNull().unique(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  status: text("status").notNull().default("Uploading"),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  roundCreated: index("hfir_round_attachment_created_idx").on(table.roundId, table.createdAt),
}));

export const hfirSapSubmissionQueue = pgTable("hfir_sap_submission_queue", {
  id: text("id").primaryKey(),
  roundId: text("round_id").notNull().references(() => hfirRoundExecutions.id, { onDelete: "cascade" }),
  workOrderNo: text("work_order_no").notNull(),
  executionStatus: text("execution_status").notNull(),
  approvalStatus: text("approval_status").notNull(),
  queueStatus: text("queue_status").notNull().default("Queued"),
  queuedBy: text("queued_by").notNull(),
  queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  roundUnique: uniqueIndex("hfir_sap_submission_round_unique").on(table.roundId),
}));

export const roundStatusHistory = pgTable("round_status_history", {
  id: serial("id").primaryKey(),
  roundId: text("round_id").notNull(),
  rawStatus: text("raw_status").notNull(),
  executionStatus: text("execution_status").notNull(),
  approvalStatus: text("approval_status").notNull(),
  overdue: text("overdue").notNull(),
  sourceTimestamp: timestamp("source_timestamp", { withTimezone: true }),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const portalHistory = pgTable("portal_history", {
  id: serial("id").primaryKey(),
  workOrderNo: text("work_order_no").notNull(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  actor: text("actor").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  workOrderTimeline: index("portal_history_work_order_idx").on(table.workOrderNo, table.occurredAt),
}));

export const importBatches = pgTable("import_batches", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  filename: text("filename").notNull(),
  importerId: text("importer_id").notNull(),
  outcome: text("outcome").notNull(),
  accepted: integer("accepted").notNull().default(0),
  rejected: integer("rejected").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  duplicates: integer("duplicates").notNull().default(0),
  errors: jsonb("errors").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const portalSettings = pgTable("portal_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
