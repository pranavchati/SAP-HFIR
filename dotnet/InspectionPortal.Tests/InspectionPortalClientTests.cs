using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using InspectionPortal.Client;
using Xunit;

namespace InspectionPortal.Tests;

public sealed class InspectionPortalClientTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Sap_import_uses_explicit_preview_or_confirmation(bool confirm)
    {
        var handler = new RecordingHandler(_ => JsonResponse("""{"batchId":"batch-1","accepted":1,"rejected":0,"updated":0,"duplicates":0,"errors":[],"preview":[]}"""));
        var client = CreateClient(handler);

        var result = await client.ImportSapWorkOrdersAsync(new SapWorkOrderImportRequest
        {
            Filename = "sap.xml",
            Xml = "<work-orders />",
            Confirm = confirm
        });

        Assert.Equal("batch-1", result.BatchId);
        Assert.Equal(HttpMethod.Post, handler.Method);
        Assert.Equal("/api/portal/imports/work-orders", handler.Path);
        Assert.Equal("test-session-token", handler.Authorization?.Parameter);
        using var json = JsonDocument.Parse(handler.Body!);
        Assert.Equal(confirm, json.RootElement.GetProperty("confirm").GetBoolean());
        Assert.Equal("sap.xml", json.RootElement.GetProperty("filename").GetString());
    }

    [Fact]
    public async Task Mapping_handoff_sends_submit_action_and_idempotency_key()
    {
        const string response = """
            {
              "workOrder": {
                "workOrderNo": "0000417823",
                "description": "Inspect pump",
                "asset": "P-42",
                "plant": "1000",
                "priority": "High",
                "dueDate": "2026-10-25",
                "mappingState": "Submitted",
                "templateName": "Pump inspection",
                "operatorName": "Operator One"
              },
              "notificationCreated": true,
              "message": "Mapping saved."
            }
            """;
        var handler = new RecordingHandler(_ => JsonResponse(response));
        var client = CreateClient(handler);

        var result = await client.SaveMappingAsync("0000417823", new MappingInput
        {
            Action = MappingAction.Submit,
            TemplateId = "template-7",
            OperatorId = "operator-9",
            Instructions = "Check seals",
            IdempotencyKey = "handoff-0000417823-1"
        });

        Assert.True(result.NotificationCreated);
        Assert.Equal("Submitted", result.WorkOrder.MappingState);
        Assert.Equal(HttpMethod.Put, handler.Method);
        Assert.Equal("/api/portal/work-orders/0000417823/mapping", handler.Path);
        using var json = JsonDocument.Parse(handler.Body!);
        Assert.Equal("Submit", json.RootElement.GetProperty("action").GetString());
        Assert.Equal("handoff-0000417823-1", json.RootElement.GetProperty("idempotencyKey").GetString());
    }

    [Fact]
    public async Task Hfir_result_exchange_preserves_round_id_and_unmatched_work_order()
    {
        var handler = new RecordingHandler(_ => JsonResponse("""{"batchId":"batch-hfir","accepted":1,"rejected":0,"updated":0,"duplicates":0,"errors":[],"preview":[]}"""));
        var client = CreateClient(handler);

        var result = await client.ImportHfirResultsAsync(new HfirRoundImportRequest
        {
            Filename = "rounds.json",
            Rounds =
            [
                new HfirRoundImportRecord
                {
                    SourceRoundId = "round-abc",
                    SapWorkOrderNo = null,
                    WorkOrderNo = null,
                    RawStatus = "Approved",
                    ExecutionStatus = "Completed",
                    ApprovalStatus = "Approved",
                    SourceTimestamp = "2026-10-25T10:30:00Z"
                }
            ]
        });

        Assert.Equal("batch-hfir", result.BatchId);
        Assert.Equal("/api/portal/imports/hfir-results", handler.Path);
        using var json = JsonDocument.Parse(handler.Body!);
        var round = json.RootElement.GetProperty("rounds")[0];
        Assert.Equal("round-abc", round.GetProperty("sourceRoundId").GetString());
        Assert.Equal(JsonValueKind.Null, round.GetProperty("workOrderNo").ValueKind);
        Assert.Equal("Approved", round.GetProperty("rawStatus").GetString());
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized)]
    [InlineData(HttpStatusCode.Forbidden)]
    public async Task Authorization_denials_are_reported_without_bypassing_role_checks(HttpStatusCode status)
    {
        var handler = new RecordingHandler(_ => new HttpResponseMessage(status)
        {
            Content = new StringContent("""{"error":"Your portal role does not allow this action."}""")
        });
        var client = CreateClient(handler);

        var error = await Assert.ThrowsAsync<PortalAuthorizationException>(() =>
            client.PreviewSapWorkOrdersAsync("sap.xml", "<work-orders />"));

        Assert.Equal(status, error.StatusCode);
        Assert.Contains("role", error.ResponseBody, StringComparison.OrdinalIgnoreCase);
        Assert.Equal("Bearer", handler.Authorization?.Scheme);
    }

    [Fact]
    public void Packaged_contract_declares_the_supported_import_and_handoff_routes()
    {
        var contractPath = Path.Combine(AppContext.BaseDirectory, "openapi.yaml");
        var contract = File.ReadAllText(contractPath);

        Assert.Contains("/portal/imports/work-orders:", contract);
        Assert.Contains("/portal/work-orders/{workOrderNo}/mapping:", contract);
        Assert.Contains("/portal/imports/hfir-results:", contract);
        Assert.Contains("WorkOrderImportInput", contract);
        Assert.Contains("MappingInput", contract);
        Assert.Contains("RoundImportInput", contract);
    }

    private static InspectionPortal.Client.InspectionPortalClient CreateClient(RecordingHandler handler)
    {
        var httpClient = new HttpClient(handler)
        {
            BaseAddress = new Uri("https://portal.example.test/api/")
        };
        return new InspectionPortal.Client.InspectionPortalClient(
            httpClient,
            _ => ValueTask.FromResult("test-session-token"));
    }

    private static HttpResponseMessage JsonResponse(string content) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(content, System.Text.Encoding.UTF8, "application/json")
    };

    private sealed class RecordingHandler(Func<HttpRequestMessage, HttpResponseMessage> responseFactory) : HttpMessageHandler
    {
        public HttpMethod? Method { get; private set; }
        public string? Path { get; private set; }
        public string? Body { get; private set; }
        public AuthenticationHeaderValue? Authorization { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            Method = request.Method;
            Path = request.RequestUri?.AbsolutePath;
            Body = request.Content is null
                ? null
                : await request.Content.ReadAsStringAsync(cancellationToken);
            Authorization = request.Headers.Authorization;
            return responseFactory(request);
        }
    }
}
