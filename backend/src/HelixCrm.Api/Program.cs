using System.Text;
using System.Text.Json;
using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Features.Auth;
using HelixCrm.Api.Features.Autonomous;
using HelixCrm.Api.Features.Config;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new UtcDateTimeConverter());
        options.JsonSerializerOptions.Converters.Add(new NullableUtcDateTimeConverter());
        // CSV imports post every cell as a string ("85", "12000").
        options.JsonSerializerOptions.NumberHandling = System.Text.Json.Serialization.JsonNumberHandling.AllowReadingFromString;
    });
builder.Services.AddOpenApi();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<TenantContext>();
builder.Services.AddScoped<ITenantProvider, HttpTenantProvider>();
builder.Services.AddScoped<TokenService>();
builder.Services.AddScoped<IAutomationEngine, AutomationEngine>();
builder.Services.AddScoped<LeadAutopilot>();
builder.Services.AddScoped<DuplicateDetectionService>();
builder.Services.AddScoped<AutonomousMonitor>();
builder.Services.AddHostedService<AutonomousDaemon>();

var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? throw new InvalidOperationException("ConnectionStrings:Default is not configured.");

builder.Services.AddDbContext<HelixDbContext>(options =>
    options.UseNpgsql(connectionString, npgsql =>
    {
        npgsql.EnableRetryOnFailure(3);
        npgsql.CommandTimeout(30);
    }));

var jwtKey = builder.Configuration["Jwt:Key"]
    ?? throw new InvalidOperationException("Jwt:Key is not configured.");
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "helix-crm";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "helix-crm-web";

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtIssuer,
            ValidateAudience = true,
            ValidAudience = jwtAudience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            NameClaimType = "name",
            RoleClaimType = "role",
            ClockSkew = TimeSpan.FromMinutes(1)
        };
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                if (string.IsNullOrEmpty(context.Token) &&
                    context.Request.Cookies.TryGetValue(AuthConstants.CookieName, out var cookieToken))
                {
                    context.Token = cookieToken;
                }
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("web", policy =>
    {
        var origins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>()
            ?? ["http://localhost:3000"];
        policy.WithOrigins(origins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

var app = builder.Build();

app.UseExceptionHandler(handler => handler.Run(async context =>
{
    var feature = context.Features.Get<IExceptionHandlerFeature>();
    var exception = feature?.Error;
    var (status, message, details) = exception switch
    {
        ApiException api => (api.StatusCode, api.Message, (object?)null),
        DbUpdateException => (409, "The change conflict with existing data. Please review and try again.", null),
        _ => (500, "Something went wrong. Please try again.", (object?)null)
    };

    if (status >= 500 && exception is not null)
    {
        app.Logger.LogError(exception, "Unhandled exception on {Path}", context.Request.Path);
    }

    context.Response.StatusCode = status;
    context.Response.ContentType = "application/json";
    await context.Response.WriteAsync(JsonSerializer.Serialize(new
    {
        message,
        details,
        traceId = context.TraceIdentifier
    }, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
}));

app.UseCors("web");
app.UseAuthentication();
app.UseAuthorization();

app.MapOpenApi();
app.MapScalarApiReference(options =>
{
    options.Title = "Helix CRM API";
    options.Theme = ScalarTheme.Purple;
    options.WithDefaultHttpClient(ScalarTarget.CSharp, ScalarClient.HttpClient);
});

app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "helix-crm-api", time = DateTime.UtcNow }))
    .AllowAnonymous();

if (builder.Configuration.GetValue("Database:AutoMigrate", true))
{
    await DbInitializer.InitializeAsync(app.Services, app.Logger, app.Configuration);
}

app.Run();

public partial class Program;
