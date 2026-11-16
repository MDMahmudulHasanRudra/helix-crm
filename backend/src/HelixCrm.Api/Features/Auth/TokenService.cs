using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using HelixCrm.Api.Domain;
using Microsoft.IdentityModel.Tokens;

namespace HelixCrm.Api.Features.Auth;

public class TokenService(IConfiguration configuration)
{
    public (string Token, DateTime ExpiresAt) Create(User user, Organization organization)
    {
        var key = configuration["Jwt:Key"]!;
        var issuer = configuration["Jwt:Issuer"] ?? "helix-crm";
        var audience = configuration["Jwt:Audience"] ?? "helix-crm-web";
        var days = configuration.GetValue("Jwt:ExpiryDays", 7);
        var expires = DateTime.UtcNow.AddDays(days);

        var claims = new List<Claim>
        {
            new("sub", user.Id.ToString()),
            new("org", organization.Id.ToString()),
            new("email", user.Email),
            new("name", user.FullName),
            new("role", user.Role),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
            SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            notBefore: DateTime.UtcNow,
            expires: expires,
            signingCredentials: credentials);

        return (new JwtSecurityTokenHandler().WriteToken(token), expires);
    }
}
