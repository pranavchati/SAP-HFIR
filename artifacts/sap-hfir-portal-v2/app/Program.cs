using SapHfirPortalV2;
using SapHfirPortalV2.Components;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddRazorComponents().AddInteractiveServerComponents();
builder.Services.AddSingleton<PortalStore>();

var app = builder.Build();
var configuredBasePath = builder.Configuration["BASE_PATH"] ?? "/";
var basePath = new PathString(configuredBasePath.TrimEnd('/'));
if (basePath.HasValue) app.UsePathBase(basePath);
app.UseRouting();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    app.UseHsts();
}

app.UseStatusCodePagesWithReExecute("/not-found", createScopeForStatusCodePages: true);
app.UseAntiforgery();
app.MapStaticAssets();
app.MapGet("/healthz", () => Results.Ok(new { status = "ok", application = "SAP-HFIR Portal v2" }));
app.MapRazorComponents<App>().AddInteractiveServerRenderMode();
app.Run();
