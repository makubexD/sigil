using Microsoft.Extensions.Logging;
using Shop;

public static class Cases
{
    public static readonly Dictionary<string, Func<Task>> All = new()
    {
        ["login-works"] = Works,
        ["login-no-secrets"] = NoSecrets,
    };

    private const string Password = "correct-horse-battery";
    private const string Token = "tok_live_9f8e7d6c5b4a";

    private sealed class Authenticator(bool accept) : IAuthenticator
    {
        public Task<bool> CheckAsync(string username, string password) => Task.FromResult(accept && password == Password);
    }

    private static readonly LoginRequest Request = new(
        "ada",
        Password,
        "203.0.113.9",
        new Dictionary<string, string> { ["User-Agent"] = "curl/8", ["Authorization"] = $"Bearer {Token}" });

    private static async Task<bool> Login(bool accept) =>
        (bool)(await Kit.Call(Kit.Make<LoginService>(new Authenticator(accept)), "LoginAsync", Request))!;

    private static async Task Works()
    {
        Check.That(await Login(true), "the right password is refused");
        Check.That(!await Login(false), "a refused login is accepted");
    }

    private static async Task NoSecrets()
    {
        Capture.Start();
        await Login(true);
        await Login(false);
        var shown = Capture.Restore() + Log.Dump();
        Check.That(Log.Entries.Count > 0, "nothing was logged");
        Check.That(!shown.Contains(Password), "the password was logged");
        Check.That(!shown.Contains(Token), "the authorization header was logged");
    }
}
