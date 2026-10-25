using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace InspectionPortal.Client;

[JsonConverter(typeof(JsonStringEnumConverter<MappingAction>))]
public enum MappingAction
{
    Draft,
    Submit
}

public sealed record SapWorkOrderImportRequest
{
    public required string Filename { get; init; }
    public required string Xml { get; init; }
    public required bool Confirm { get; init; }
}

public sealed record MappingInput
{
    public required MappingAction Action { get; init; }
    public string TemplateId { get; init; } = "";
    public string OperatorId { get; init; } = "";
    public string Instructions { get; init; } = "";
    public string RevisionReason { get; init; } = "";
    public required string IdempotencyKey { get; init; }
}

public sealed record HfirRoundImportRequest
{
    public required string Filename { get; init; }
    public required IReadOnlyList<HfirRoundImportRecord> Rounds { get; init; }
}

public sealed record HfirRoundImportRecord
{
    public string Id { get; init; } = "";
    public required string SourceRoundId { get; init; }
    public string? WorkOrderNo { get; init; }
    public string TemplateName { get; init; } = "";
    public string TemplateId { get; init; } = "";
    public string OperatorId { get; init; } = "";
    public string OperatorName { get; init; } = "";
    public string ScheduledDate { get; init; } = "";
    public string DueDate { get; init; } = "";
    public string CompletedAt { get; init; } = "";
    public string ExecutionStatus { get; init; } = "";
    public string ApprovalStatus { get; init; } = "";
    public string Overdue { get; init; } = "";
    public string RawStatus { get; init; } = "";
    public string LastSyncAt { get; init; } = "";
    public string SourceTimestamp { get; init; } = "";
    public string RejectionReason { get; init; } = "";
    public string? SapWorkOrderNo { get; init; }
}

public sealed record ImportResult
{
    public required string BatchId { get; init; }
    public required int Accepted { get; init; }
    public required int Rejected { get; init; }
    public required int Updated { get; init; }
    public required int Duplicates { get; init; }
    public required IReadOnlyList<string> Errors { get; init; }
    public IReadOnlyList<JsonElement> Preview { get; init; } = [];
}

public sealed record WorkOrder
{
    public required string WorkOrderNo { get; init; }
    public required string Description { get; init; }
    public required string Asset { get; init; }
    public string FunctionalLocation { get; init; } = "";
    public required string Plant { get; init; }
    public required string Priority { get; init; }
    public string PlannedStartDate { get; init; } = "";
    public required string DueDate { get; init; }
    public required string MappingState { get; init; }
    public string TemplateId { get; init; } = "";
    public required string TemplateName { get; init; }
    public string OperatorId { get; init; } = "";
    public required string OperatorName { get; init; }
    public string Instructions { get; init; } = "";
    public string SubmittedAt { get; init; } = "";
    public string ImportedAt { get; init; } = "";
    public int RoundCount { get; init; }
}

public sealed record MappingResult
{
    public required WorkOrder WorkOrder { get; init; }
    public required bool NotificationCreated { get; init; }
    public string Message { get; init; } = "";
}

public sealed class PortalAuthorizationException : HttpRequestException
{
    public PortalAuthorizationException(HttpStatusCode statusCode, string responseBody)
        : base(
            statusCode == HttpStatusCode.Unauthorized
                ? "The portal rejected the session token. Sign in again or obtain a fresh token."
                : "The signed-in portal user does not have the role required for this operation.",
            null,
            statusCode)
    {
        ResponseBody = responseBody;
    }

    public string ResponseBody { get; }
}
