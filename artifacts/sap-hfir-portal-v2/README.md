# SAP-HFIR Portal v2

A separate ASP.NET Core 10 / Blazor Server implementation of the SAP-HFIR portal. Application logic and interactive UI are written in C# and Razor, with CSS for styling and the standard Blazor browser runtime.

The original portal remains at `artifacts/inspection-portal` with its API at `artifacts/api-server`. Its source backup is `backups/sap-hfir-portal-v1-source.tar.gz`. This archive is a source backup, not a database, uploaded-file, secret, or Git-history backup.

## Run

From this artifact directory:

```sh
cd app
ASPNETCORE_ENVIRONMENT=Development dotnet run --no-launch-profile --urls http://0.0.0.0:$PORT
```

Use the managed artifact preview at `/sap-hfir-portal-v2/`.

## Available demo workflows

- Overview with seeded work orders and linked inspection data.
- XML work-order import.
- Work-order/template mapping with notifications and handoff history.
- Assignments, HFIR rounds, and portal-only SAP submission queue.
- PDF type/header validation and attachment filename recording.

## Migration boundaries

This is a demo migration, not full production feature parity with the original portal:

- Data is held in memory and resets on process restart.
- The role selector previews roles; it does not authenticate users or enforce permissions.
- PDFs are validated but only their filenames are recorded. File bytes are not stored or downloadable.
- SAP status submission only records a portal queue event; it never sends to SAP.
- SQL Server and live SAP endpoints are not configured. Blank configuration entries are not active integrations.

Do not use the demo for sensitive or production records. Complete authentication, persistent storage, private attachments, and live integration configuration before replacing the original portal.
