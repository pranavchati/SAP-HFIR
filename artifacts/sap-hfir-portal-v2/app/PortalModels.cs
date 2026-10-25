namespace SapHfirPortalV2;

public sealed class WorkOrder
{
    public string Number { get; set; } = "";
    public string Description { get; set; } = "";
    public string Asset { get; set; } = "";
    public string Plant { get; set; } = "";
    public string Priority { get; set; } = "";
    public string DueDate { get; set; } = "";
    public string TemplateId { get; set; } = "";
    public string MappingState { get; set; } = "Unmapped";
    public string Operator { get; set; } = "";
}

public sealed class HfirTemplate(string id, string name)
{
    public string Id { get; set; } = id;
    public string Name { get; set; } = name;
}

public sealed class HfirRound
{
    public string Id { get; set; } = "";
    public string WorkOrderNo { get; set; } = "";
    public string TemplateName { get; set; } = "";
    public string Operator { get; set; } = "";
    public string Scheduled { get; set; } = "";
    public string Execution { get; set; } = "";
    public string Approval { get; set; } = "";
    public string Attachment { get; set; } = "";
    public string SapStatus { get; set; } = "Not submitted";
}

public sealed class PortalNotification
{
    public string WorkOrderNo { get; set; } = "";
    public string Message { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public bool Read { get; set; }
}

public sealed class HandoffEvent
{
    public string WorkOrderNo { get; set; } = "";
    public string Event { get; set; } = "";
    public string Detail { get; set; } = "";
    public string Actor { get; set; } = "";
    public DateTime At { get; set; } = DateTime.Now;
}
