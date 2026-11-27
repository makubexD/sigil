using Api;

public static class Cases
{
    public static readonly Dictionary<string, Func<Task>> All = new()
    {
        ["dsn-works"] = Works,
        ["dsn-error-hides-password"] = HidesPassword,
    };

    private const string Secret = "s3cr3t-hunter2";

    private static async Task Works()
    {
        var connection = (Connection)(await Kit.Call(typeof(Database), "Connect", $"postgres://app:{Secret}@db.internal:5432/accounts"))!;
        Check.That(connection == new Connection("db.internal", 5432, "app", "accounts"), $"connected as {connection}");
    }

    private static async Task HidesPassword()
    {
        string[] dsns =
        [
            $"postgres://app:{Secret}@db.down:5432/accounts",
            $"postgres://app:{Secret}@db.internal:notaport/accounts",
            $"postgres:/app:{Secret}@",
        ];
        foreach (var dsn in dsns)
        {
            var error = await Check.Thrown(() => Kit.Call(typeof(Database), "Connect", dsn));
            Check.That(error is DatabaseException, $"{dsn.Replace(Secret, "***")}: {error?.GetType().Name ?? "no exception"}");
            for (var current = error; current is not null; current = current.InnerException)
            {
                Check.That(!current.Message.Contains(Secret), "the password is in an exception message");
            }
        }
    }
}
