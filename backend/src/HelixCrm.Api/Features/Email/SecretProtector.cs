using Microsoft.AspNetCore.DataProtection;

namespace HelixCrm.Api.Features.Email;

/// <summary>
/// Encrypts mailbox passwords at rest with ASP.NET DataProtection. Keys live on a
/// persistent path so encrypted credentials survive restarts; if a key is lost the
/// credential decrypts to null and the UI asks for the password again.
/// </summary>
public class SecretProtector(IDataProtectionProvider provider)
{
    private readonly IDataProtector _protector = provider.CreateProtector("HelixCrm.EmailCredentials.v1");

    public string Protect(string value) => _protector.Protect(value);

    public string? TryUnprotect(string? cipher)
    {
        if (string.IsNullOrWhiteSpace(cipher)) return null;
        try
        {
            return _protector.Unprotect(cipher);
        }
        catch
        {
            return null;
        }
    }
}
