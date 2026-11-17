using HelixCrm.Api.Common;
using HelixCrm.Api.Data;
using HelixCrm.Api.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Features.Email;

[ApiController]
[Route("api/v1/email/accounts")]
public class EmailAccountsController(
    HelixDbContext db, SecretProtector secrets, IEmailTransport transport) : ControllerBase
{
    public record EmailAccountRequest(
        string? Name, string? FromName, string? FromAddress, string? ReplyToAddress,
        string? SmtpHost, int? SmtpPort, string? SmtpSecurity, string? SmtpUsername, string? SmtpPassword,
        string? ImapHost, int? ImapPort, string? ImapSecurity, string? ImapUsername, string? ImapPassword,
        string? ImapFolder, bool? ImapEnabled, bool? IsActive, bool? IsDefault);

    public record TestResultDto(EmailAccountCheck Check, EmailAccountDto Account);

    [HttpGet]
    public async Task<ActionResult<List<EmailAccountDto>>> List()
    {
        var accounts = await db.EmailAccounts.AsNoTracking()
            .OrderByDescending(a => a.IsDefault).ThenBy(a => a.CreatedAt).ToListAsync();
        return Ok(accounts.Select(EmailMapper.Account).ToList());
    }

    [HttpPost]
    [Authorize(Roles = $"{Roles.Admin},{Roles.Manager}")]
    public async Task<ActionResult<EmailAccountDto>> Create(EmailAccountRequest request)
    {
        var from = EmailAddresses.Normalize(request.FromAddress)
            ?? throw new ApiException(400, "A valid from address is required.");
        var smtpHost = request.SmtpHost.Clean(200);
        if (smtpHost.Length == 0) throw new ApiException(400, "SMTP host is required.");

        var isFirst = !await db.EmailAccounts.AnyAsync();
        var account = new EmailAccount
        {
            OrganizationId = User.GetOrganizationId(),
            IsDefault = isFirst || request.IsDefault == true
        };

        Apply(account, request, from, smtpHost);
        if (account.IsDefault) await ClearDefaultsAsync();

        db.EmailAccounts.Add(account);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(List), EmailMapper.Account(account));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = $"{Roles.Admin},{Roles.Manager}")]
    public async Task<ActionResult<EmailAccountDto>> Update(Guid id, EmailAccountRequest request)
    {
        var account = await db.EmailAccounts.FirstOrDefaultAsync(a => a.Id == id)
            ?? throw new ApiException(404, "Email account not found.");

        var from = request.FromAddress is null
            ? account.FromAddress
            : EmailAddresses.Normalize(request.FromAddress)
                ?? throw new ApiException(400, "A valid from address is required.");
        var smtpHost = request.SmtpHost is null ? account.SmtpHost : request.SmtpHost.Clean(200);
        if (smtpHost.Length == 0) throw new ApiException(400, "SMTP host is required.");

        var connectionChanged = smtpHost != account.SmtpHost || from != account.FromAddress;
        Apply(account, request, from, smtpHost);

        if (request.IsDefault == true)
        {
            await ClearDefaultsAsync();
            account.IsDefault = true;
        }

        if (connectionChanged || request.SmtpPassword is not null || request.ImapPassword is not null)
        {
            account.LastVerifiedAt = null;
            account.LastError = null;
        }

        await db.SaveChangesAsync();
        return Ok(EmailMapper.Account(account));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var account = await db.EmailAccounts.FirstOrDefaultAsync(a => a.Id == id)
            ?? throw new ApiException(404, "Email account not found.");

        account.IsDeleted = true;
        account.IsActive = false;
        account.IsDefault = false;

        var next = await db.EmailAccounts
            .Where(a => a.Id != id && a.IsActive)
            .OrderBy(a => a.CreatedAt)
            .FirstOrDefaultAsync();
        if (next is not null) next.IsDefault = true;

        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{id:guid}/test")]
    [Authorize(Roles = $"{Roles.Admin},{Roles.Manager}")]
    public async Task<ActionResult<TestResultDto>> Test(Guid id)
    {
        var account = await db.EmailAccounts.FirstOrDefaultAsync(a => a.Id == id)
            ?? throw new ApiException(404, "Email account not found.");

        var check = await transport.CheckAsync(
            account,
            secrets.TryUnprotect(account.SmtpPasswordCipher),
            secrets.TryUnprotect(account.ImapPasswordCipher),
            HttpContext.RequestAborted);

        account.LastVerifiedAt = check.SmtpOk ? DateTime.UtcNow : null;
        account.LastError = string.Join(" · ", new[] { check.SmtpError, check.ImapError }
            .Where(e => !string.IsNullOrWhiteSpace(e))) is { Length: > 0 } errors ? errors[..Math.Min(errors.Length, 1000)] : null;
        await db.SaveChangesAsync();

        return Ok(new TestResultDto(check, EmailMapper.Account(account)));
    }

    private void Apply(EmailAccount account, EmailAccountRequest request, string from, string smtpHost)
    {
        account.Name = request.Name is null
            ? (account.Name.Length > 0 ? account.Name : from)
            : request.Name.Clean(120) is { Length: > 0 } name ? name : from;
        account.FromName = request.FromName is null ? account.FromName : request.FromName.Clean(120);
        account.FromAddress = from;
        account.ReplyToAddress = request.ReplyToAddress is null
            ? account.ReplyToAddress
            : EmailAddresses.Normalize(request.ReplyToAddress);

        account.SmtpHost = smtpHost;
        account.SmtpPort = request.SmtpPort is > 0 and <= 65535 ? request.SmtpPort.Value : account.SmtpPort <= 0 ? 587 : account.SmtpPort;
        account.SmtpSecurity = request.SmtpSecurity is null
            ? account.SmtpSecurity
            : EmailSecurity.All.Contains(request.SmtpSecurity) ? request.SmtpSecurity : account.SmtpSecurity;
        account.SmtpUsername = request.SmtpUsername is null ? account.SmtpUsername : request.SmtpUsername.Clean(254);

        account.ImapHost = request.ImapHost is null ? account.ImapHost : request.ImapHost.Clean(200);
        account.ImapPort = request.ImapPort is > 0 and <= 65535 ? request.ImapPort.Value : account.ImapPort <= 0 ? 993 : account.ImapPort;
        account.ImapSecurity = request.ImapSecurity is null
            ? account.ImapSecurity
            : EmailSecurity.All.Contains(request.ImapSecurity) ? request.ImapSecurity : account.ImapSecurity;
        account.ImapUsername = request.ImapUsername is null ? account.ImapUsername : request.ImapUsername.Clean(254);
        account.ImapFolder = request.ImapFolder is null
            ? account.ImapFolder
            : request.ImapFolder.Clean(200) is { Length: > 0 } folder ? folder : "INBOX";
        account.ImapEnabled = request.ImapEnabled ?? account.ImapEnabled;
        account.IsActive = request.IsActive ?? account.IsActive;

        if (!string.IsNullOrWhiteSpace(request.SmtpPassword))
            account.SmtpPasswordCipher = secrets.Protect(request.SmtpPassword);
        if (!string.IsNullOrWhiteSpace(request.ImapPassword))
            account.ImapPasswordCipher = secrets.Protect(request.ImapPassword);
    }

    private Task ClearDefaultsAsync() =>
        db.EmailAccounts.Where(a => a.IsDefault).ExecuteUpdateAsync(s => s.SetProperty(a => a.IsDefault, false));
}
