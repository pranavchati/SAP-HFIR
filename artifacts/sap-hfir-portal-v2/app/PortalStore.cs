namespace SapHfirPortalV2;

public sealed class PortalStore
{
    private readonly object gate = new();

    public List<WorkOrder> WorkOrders { get; } =
    [
        new() { Number = "0000417823", Description = "Inspect cooling water pump", Asset = "P-2041", Plant = "Riyadh Utilities", Priority = "High", DueDate = "Oct 28, 2026", TemplateId = "HFIR-0103", MappingState = "Submitted", Operator = "Amina Al-Salem" },
        new() { Number = "0000417829", Description = "Verify pressure safety valve", Asset = "PSV-104", Plant = "North Process Unit", Priority = "Medium", DueDate = "Oct 30, 2026", TemplateId = "HFIR-0101", MappingState = "Submitted", Operator = "Faisal Rahman" },
        new() { Number = "0000417832", Description = "Check emergency generator", Asset = "DG-4402", Plant = "Riyadh Utilities", Priority = "High", DueDate = "Nov 02, 2026", TemplateId = "HFIR-0107", MappingState = "Submitted", Operator = "Maya Thomas" },
        new() { Number = "0000417901", Description = "Inspect auxiliary diesel generator", Asset = "DG-4402", Plant = "Riyadh Utilities", Priority = "High", DueDate = "Nov 05, 2026" },
        new() { Number = "0000417902", Description = "Check workshop overhead crane", Asset = "CR-1008", Plant = "Riyadh Utilities", Priority = "Medium", DueDate = "Nov 06, 2026" },
        new() { Number = "0000417903", Description = "Test fire water pump controls", Asset = "FWP-210", Plant = "North Process Unit", Priority = "Low", DueDate = "Nov 09, 2026" },
    ];

    public List<HfirTemplate> Templates { get; } =
    [
        new("HFIR-0101", "Pressure Safety Valve Inspection"),
        new("HFIR-0103", "Rotating Equipment - Pump"),
        new("HFIR-0107", "Emergency Generator Readiness"),
        new("HFIR-0112", "Overhead Crane Safety Check"),
    ];

    public List<string> Operators { get; } = ["Amina Al-Salem", "Faisal Rahman", "Maya Thomas"];

    public List<HfirRound> Rounds { get; } =
    [
        new() { Id = "ROUND-24018", WorkOrderNo = "0000417823", TemplateName = "Rotating Equipment - Pump", Operator = "Amina Al-Salem", Scheduled = "Oct 24, 2026", Execution = "Successful", Approval = "Approved" },
        new() { Id = "ROUND-24022", WorkOrderNo = "0000417829", TemplateName = "Pressure Safety Valve Inspection", Operator = "Faisal Rahman", Scheduled = "Oct 25, 2026", Execution = "Successful", Approval = "Approved", SapStatus = "Queued" },
        new() { Id = "ROUND-24025", WorkOrderNo = "0000417832", TemplateName = "Emergency Generator Readiness", Operator = "Maya Thomas", Scheduled = "Oct 26, 2026", Execution = "In progress", Approval = "Pending" },
        new() { Id = "ROUND-24031", WorkOrderNo = "0000417823", TemplateName = "Rotating Equipment - Pump", Operator = "Amina Al-Salem", Scheduled = "Oct 27, 2026", Execution = "Incomplete", Approval = "Rejected" },
    ];

    public List<PortalNotification> Notifications { get; } =
    [
        new() { WorkOrderNo = "0000417823", Message = "Mapped to HFIR template Rotating Equipment - Pump." },
        new() { WorkOrderNo = "0000417829", Message = "Mapped to HFIR template Pressure Safety Valve Inspection.", Read = true },
        new() { WorkOrderNo = "0000417832", Message = "Mapped to HFIR template Emergency Generator Readiness." },
    ];

    public List<HandoffEvent> History { get; } =
    [
        new() { WorkOrderNo = "0000417823", Event = "HFIR round approved", Detail = "Round ROUND-24018 approved; ready for SAP handoff.", Actor = "Amina Al-Salem", At = DateTime.Now.AddHours(-2) },
        new() { WorkOrderNo = "0000417829", Event = "Status queued for SAP", Detail = "Approved execution snapshot added to the portal queue.", Actor = "Planner/Coordinator", At = DateTime.Now.AddHours(-5) },
        new() { WorkOrderNo = "0000417832", Event = "Assignment submitted", Detail = "Assigned to Maya Thomas for HFIR execution.", Actor = "Planner/Coordinator", At = DateTime.Now.AddDays(-1) },
        new() { WorkOrderNo = "0000417823", Event = "Template mapping submitted", Detail = "SAP work order mapped to HFIR-0103.", Actor = "Administrator", At = DateTime.Now.AddDays(-2) },
    ];

    public void SubmitMapping(string workOrderNo, string templateId)
    {
        lock (gate)
        {
            var order = WorkOrders.First(x => x.Number == workOrderNo);
            var template = Templates.First(x => x.Id == templateId);
            order.TemplateId = template.Id;
            order.MappingState = "Submitted";
            Notifications.Insert(0, new PortalNotification { WorkOrderNo = order.Number, Message = $"Mapped to HFIR template {template.Name}." });
            History.Insert(0, new HandoffEvent { WorkOrderNo = order.Number, Event = "Template mapping submitted", Detail = $"SAP work order mapped to {template.Name} ({template.Id}).", Actor = "Current user" });
        }
    }

    public void Assign(string workOrderNo, string operatorName)
    {
        lock (gate)
        {
            var order = WorkOrders.First(x => x.Number == workOrderNo);
            order.Operator = operatorName;
            order.MappingState = "Submitted";
            Notifications.Insert(0, new PortalNotification { WorkOrderNo = order.Number, Message = $"Assignment sent to {operatorName}." });
            History.Insert(0, new HandoffEvent { WorkOrderNo = order.Number, Event = "Assignment submitted", Detail = $"Assigned to {operatorName}.", Actor = "Planner/Coordinator" });
        }
    }

    public bool QueueForSap(HfirRound round)
    {
        lock (gate)
        {
            if (round.SapStatus == "Queued") return false;
            round.SapStatus = "Queued";
            History.Insert(0, new HandoffEvent { WorkOrderNo = round.WorkOrderNo, Event = "Status queued for SAP", Detail = $"{round.Execution} / {round.Approval} snapshot queued in the portal. No SAP transmission was performed.", Actor = "Current user" });
            Notifications.Insert(0, new PortalNotification { WorkOrderNo = round.WorkOrderNo, Message = $"HFIR status for {round.Id} is queued in the portal for SAP." });
            return true;
        }
    }

    public int ImportedCount => WorkOrders.Count;
    public int UnmappedCount => WorkOrders.Count(x => x.MappingState == "Unmapped");
    public int SubmittedCount => WorkOrders.Count(x => x.MappingState == "Submitted");
}
