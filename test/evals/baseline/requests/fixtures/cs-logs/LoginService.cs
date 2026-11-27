using Microsoft.Extensions.Logging;

namespace Shop;

public record LoginRequest(string Username, string Password, string Ip, IReadOnlyDictionary<string, string> Headers);

public interface IAuthenticator
{
    /// <summary>Checks a username and password against the accounts database.</summary>
    Task<bool> CheckAsync(string username, string password);
}

public class LoginService(IAuthenticator authenticator, ILogger<LoginService> logger)
{
    private readonly IAuthenticator _authenticator = authenticator;
    private readonly ILogger<LoginService> _logger = logger;
}
