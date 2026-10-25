using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace InspectionPortal.Client;

/// <summary>
/// Calls the SAP-HFIR Inspection Portal API using a bearer token supplied by the host application.
/// The portal remains responsible for authenticating the user and enforcing portal roles.
/// </summary>
public sealed class InspectionPortalClient
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly HttpClient _httpClient;
    private readonly Func<CancellationToken, ValueTask<string>> _accessTokenProvider;

    /// <param name="httpClient">
    /// An HTTP client whose base address points to the API prefix, for example
    /// <c>https://portal.example.com/api/</c>.
    /// </param>
    /// <param name="accessTokenProvider">
    /// Returns a current Clerk session JWT for the signed-in portal user. The token is requested
    /// for each API call so hosts can refresh it without recreating this client.
    /// </param>
    public InspectionPortalClient(
        HttpClient httpClient,
        Func<CancellationToken, ValueTask<string>> accessTokenProvider)
    {
        ArgumentNullException.ThrowIfNull(httpClient);
        ArgumentNullException.ThrowIfNull(accessTokenProvider);
        if (httpClient.BaseAddress is not { IsAbsoluteUri: true })
        {
            throw new ArgumentException("HttpClient.BaseAddress must be an absolute API URL ending in /api/.", nameof(httpClient));
        }

        _httpClient = httpClient;
        _accessTokenProvider = accessTokenProvider;
    }

    /// <summary>Previews an SAP XML work-order import without writing the work orders.</summary>
    public Task<ImportResult> PreviewSapWorkOrdersAsync(
        string filename,
        string xml,
        CancellationToken cancellationToken = default) =>
        ImportSapWorkOrdersAsync(new SapWorkOrderImportRequest
        {
            Filename = filename,
            Xml = xml,
            Confirm = false
        }, cancellationToken);

    /// <summary>Confirms and imports SAP XML work orders after the caller has reviewed the preview.</summary>
    public Task<ImportResult> ConfirmSapWorkOrdersAsync(
        string filename,
        string xml,
        CancellationToken cancellationToken = default) =>
        ImportSapWorkOrdersAsync(new SapWorkOrderImportRequest
        {
            Filename = filename,
            Xml = xml,
            Confirm = true
        }, cancellationToken);

    /// <summary>
    /// Calls the SAP import endpoint. Requires Administrator or Planner/Coordinator portal role.
    /// </summary>
    public Task<ImportResult> ImportSapWorkOrdersAsync(
        SapWorkOrderImportRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentException.ThrowIfNullOrWhiteSpace(request.Filename);
        ArgumentNullException.ThrowIfNull(request.Xml);
        return SendAsync<ImportResult>(HttpMethod.Post, "portal/imports/work-orders", request, cancellationToken);
    }

    /// <summary>
    /// Saves or submits an assignment. Requires Administrator or Planner/Coordinator portal role.
    /// Submit action creates an in-portal operator notification, not an HFIR round.
    /// </summary>
    public Task<MappingResult> SaveMappingAsync(
        string workOrderNo,
        MappingInput mapping,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workOrderNo);
        ArgumentNullException.ThrowIfNull(mapping);
        ArgumentException.ThrowIfNullOrWhiteSpace(mapping.IdempotencyKey);
        var escapedWorkOrderNo = Uri.EscapeDataString(workOrderNo);
        return SendAsync<MappingResult>(
            HttpMethod.Put,
            $"portal/work-orders/{escapedWorkOrderNo}/mapping",
            mapping,
            cancellationToken);
    }

    /// <summary>Imports normalized HFIR round results. Requires Administrator portal role.</summary>
    public Task<ImportResult> ImportHfirResultsAsync(
        HfirRoundImportRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentException.ThrowIfNullOrWhiteSpace(request.Filename);
        ArgumentNullException.ThrowIfNull(request.Rounds);
        return SendAsync<ImportResult>(HttpMethod.Post, "portal/imports/hfir-results", request, cancellationToken);
    }

    private async Task<TResponse> SendAsync<TResponse>(
        HttpMethod method,
        string relativePath,
        object body,
        CancellationToken cancellationToken)
    {
        var token = await _accessTokenProvider(cancellationToken).ConfigureAwait(false);
        ArgumentException.ThrowIfNullOrWhiteSpace(token);

        using var request = new HttpRequestMessage(method, relativePath)
        {
            Content = JsonContent.Create(body, options: JsonOptions)
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var response = await _httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
        var responseBody = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);

        if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
        {
            throw new PortalAuthorizationException(response.StatusCode, responseBody);
        }

        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException(
                $"Portal API returned {(int)response.StatusCode} ({response.ReasonPhrase}): {responseBody}",
                null,
                response.StatusCode);
        }

        return JsonSerializer.Deserialize<TResponse>(responseBody, JsonOptions)
            ?? throw new JsonException($"Portal API returned an empty response for {relativePath}.");
    }
}
