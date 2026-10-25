# .NET 10 client for the Inspection Portal

This repository includes a .NET 10 client library for the portal's existing REST API. It supports the three data-exchange flows that need strongly typed payloads:

- Previewing and confirming SAP XML work-order imports.
- Saving mapping drafts or submitting a mapping handoff.
- Importing normalized HFIR round results.

The client sends requests to the same endpoints described by `../lib/api-spec/openapi.yaml`. That OpenAPI file is included in the NuGet package and copied into the tests; the contract test checks that the three supported endpoint and schema names remain present.

## Requirements

- .NET SDK 10.0 or later.
- A reachable Inspection Portal API URL.
- An authenticated Clerk session token for a portal user. Do not put tokens, passwords, or signing secrets in source files or configuration committed to Git.

## Build and test

From the repository root:

```sh
dotnet test dotnet/InspectionPortal.Tests/InspectionPortal.Tests.csproj
dotnet build dotnet/InspectionPortal.Client/InspectionPortal.Client.csproj
```

## Configure the client

Set the API base address to the portal's API prefix, including `/api/` and the trailing slash. Obtain a current Clerk session JWT through the host application's existing sign-in flow, then provide it through the token callback. The library asks for a fresh token for each request.

```csharp
using InspectionPortal.Client;

var httpClient = new HttpClient
{
    BaseAddress = new Uri("https://your-portal-host.example/api/")
};

var portal = new InspectionPortalClient(
    httpClient,
    async cancellationToken =>
        await clerkSession.GetCurrentSessionTokenAsync(cancellationToken));
```

`clerkSession.GetCurrentSessionToken` above represents the host application's existing Clerk integration; the library does not implement sign-in, store credentials, or mint tokens. The API server authenticates the bearer token and makes the authorization decision for every call. It returns 401 for missing/invalid authentication and 403 when the user's portal role is not permitted; the client exposes these as `PortalAuthorizationException`.

| Operation | Required portal role |
| --- | --- |
| SAP work-order preview/import | Administrator or Planner/Coordinator |
| Save mapping draft / submit mapping | Administrator or Planner/Coordinator |
| Import HFIR results | Administrator |

The server remains authoritative for access control. Do not grant additional access based only on client-side role checks. A mapping submission creates a portal notification; it does not authenticate to HFIR, schedule a round, or update SAP. HFIR result records are normalized inputs, not a live HFIR connector.

## Example: preview, then confirm SAP XML

```csharp
var preview = await portal.PreviewSapWorkOrdersAsync("work-orders.xml", xml, cancellationToken);

if (preview.Rejected == 0 && preview.Accepted > 0)
{
    var imported = await portal.ConfirmSapWorkOrdersAsync(
        "work-orders.xml",
        xml,
        cancellationToken);
}
```

Review the returned preview before confirming. Keep SAP work-order identifiers as strings so leading zeros are retained.

## Example: submit an assignment

```csharp
var handoff = await portal.SaveMappingAsync("0000417823", new MappingInput
{
    Action = MappingAction.Submit,
    TemplateId = "hfir-template-id",
    OperatorId = "portal-operator-id",
    Instructions = "Review the required inspection points.",
    IdempotencyKey = Guid.NewGuid().ToString("N")
}, cancellationToken);
```

Revisions to a submitted mapping require `RevisionReason`. Reuse the same idempotency key when retrying the same submission; use a new key for a deliberate changed handoff.

## Example: import HFIR results

```csharp
var result = await portal.ImportHfirResultsAsync(new HfirRoundImportRequest
{
    Filename = "hfir-results.json",
    Rounds =
    [
        new HfirRoundImportRecord
        {
            SourceRoundId = "round-unique-id",
            WorkOrderNo = "0000417823",
            TemplateId = "hfir-template-id",
            ExecutionStatus = "Completed",
            ApprovalStatus = "Approved",
            RawStatus = "Approved",
            SourceTimestamp = DateTimeOffset.UtcNow.ToString("O")
        }
    ]
}, cancellationToken);
```

Each `SourceRoundId` must identify a unique HFIR round instance. An unmatched or absent work-order number is retained for review. The portal normalizes result statuses and avoids replacing newer updates with older source timestamps.

