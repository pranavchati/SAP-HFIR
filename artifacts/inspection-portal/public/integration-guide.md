# SAP–HFIR Inspection Portal — setup and integration guide

## What this app does

This portal coordinates work orders and inspection rounds. It imports SAP work orders from XML, lets a planner/coordinator map a work order to an HFIR template and operator, records an in-app operator notification, imports HFIR round-result exports, and keeps an auditable history. SAP is not updated, and this portal does not schedule or execute HFIR rounds.

The current app is a working **Demo-mode** implementation. No live SAP, HFIR, or email service is configured. Operator notifications are stored and shown in the portal; they are not email messages.

## First-time setup

1. Open the app and create/sign in to the account intended to be the initial administrator. The first real portal account can claim administrator access once. Do this before inviting other users.
2. From **Overview**, use **Claim administrator**. The administrator can then assign the `Administrator`, `Planner/Coordinator`, or `Operator` role to portal users.
3. Use the sample downloads in the app to try the import, mapping, assignment, and result-import flows. Seeded rows in the portal are demo data.
4. Configure the optional **Open HFIR URL** in **Administration**. The link is only a shortcut; it does not authenticate to HFIR or create a round.

## Import and data formats

### SAP work orders

Go to **SAP import** and upload XML (up to 5 MB). The preview must be inspected before the explicit import confirmation. Importing only writes portal records; it does not call SAP.

The included `samples/sap-work-orders.xml` shows the supported shape. Each work order needs a string identifier such as `0000417823`; keep leading zeros. Common field aliases for order number, description, equipment/asset, functional location, plant, priority, planned start, and due date are accepted. Dates are retained as ISO dates when possible.

### HFIR templates

Administrators can import CSV or JSON from **Administration**.

- CSV headers: `id,name,active`
- JSON: an array of `{ "id": "...", "name": "...", "active": true, "source": "Imported" }` records (or an object with a `templates` array)

### HFIR round results

Administrators can import CSV or JSON from **HFIR rounds**. Each row must have a unique `sourceRoundId` for the HFIR round instance. The SAP work-order number is optional; an exact string match links the result to a work order. Missing or unmatched SAP identifiers stay in the unmatched review queue. Original status text and imported fields are retained for review.

Useful fields: `sourceRoundId`, `workOrderNo` (or `sapWorkOrderNo`), `templateId`, `templateName`, `operatorId`, `operatorName`, `scheduledDate`, `dueDate`, `completedAt`, `executionStatus`, `approvalStatus`, `overdue`, `rawStatus`, `sourceTimestamp`, and `rejectionReason`.

Execution outcome, approval outcome, and overdue indicator are separate values. They can overlap. If a source status is not understood, the portal shows `Unknown` for normalized status and preserves the original in `rawStatus`. An old result update does not replace a newer one.

## Roles

- **Administrator:** user roles, template catalog, settings, imports, mappings, all results and history.
- **Planner/Coordinator:** SAP imports, mapping and submitting assignments, round review and history.
- **Operator:** own assignments and notifications, assigned round results, and permitted history records.

Changing a submitted mapping requires a reason. Saving a draft does not create an operator notification. Submitting a mapping records a portal notification and the required manual HFIR instruction; it does not schedule a round.

## Integration boundary and .NET client

The backend exposes its language-neutral REST contract at `/api/portal`; the OpenAPI definition is maintained in `lib/api-spec/openapi.yaml`. The repository includes a .NET 10 client library under `dotnet/` for SAP XML preview/import, mapping handoff, and HFIR result exchange. Its setup, role requirements, examples, and tests are documented in `dotnet/README.md`.

The client accepts a current Clerk session JWT from the host application's existing sign-in flow and sends it as a bearer token. It does not sign users in, create credentials, or bypass server-side portal role checks. Use HTTPS and do not store tokens in source control. SAP work-order import and mapping handoff require Administrator or Planner/Coordinator; HFIR result import requires Administrator. The API server remains authoritative and returns 401/403 when authentication or role checks fail.

The .NET client sends normalized imports to the portal; it does not itself connect to SAP or HFIR. The SAP XML parser and HFIR result normalizer remain isolated behind adapter interfaces in the API server. To enable live integrations, implement and configure vendor-specific adapters using the relevant SAP/HFIR API documentation, credentials, and environment-specific mapping rules. Do not switch an integration to `Live` until its adapter has been connected and verified.

## Demo files

- `samples/sap-work-orders.xml`
- `samples/hfir-templates.csv`
- `samples/hfir-templates.json`
- `samples/hfir-results.csv`
- `samples/hfir-results.json`
