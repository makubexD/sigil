using Api;

public static class Cases
{
    public static readonly Dictionary<string, Func<Task>> All = new()
    {
        ["users-works"] = Works,
        ["users-parameterized"] = Parameterized,
    };

    private sealed class FakeDatabase : IDatabase
    {
        public string Sql { get; private set; } = "";

        public IReadOnlyDictionary<string, object?> Parameters { get; private set; } = new Dictionary<string, object?>();

        public Task<IReadOnlyList<User>> QueryUsersAsync(string sql, IReadOnlyDictionary<string, object?> parameters)
        {
            Sql = sql;
            Parameters = parameters;
            return Task.FromResult<IReadOnlyList<User>>([new User(1, "ada"), new User(3, "ada")]);
        }
    }

    private static async Task Works()
    {
        var database = new FakeDatabase();
        var users = (IEnumerable<User>)(await Kit.Call(Kit.Make<Users>(database), "FindByNameAsync", "ada"))!;
        Check.That(users.Select(user => user.Id).SequenceEqual([1, 3]), "the users found are wrong");
        Check.That(database.Sql.Contains("users", StringComparison.OrdinalIgnoreCase), "no query on the users table was run");
    }

    private static async Task Parameterized()
    {
        const string name = "x' OR '1'='1";
        var database = new FakeDatabase();
        await Check.Thrown(() => Kit.Call(Kit.Make<Users>(database), "FindByNameAsync", name));
        Check.That(database.Sql.Length > 0, "no query was run");
        Check.That(!database.Sql.Contains("'1'='1"), "the name is written into the SQL text");
        Check.That(database.Parameters.Values.Any(value => value as string == name), "the name is not passed as a parameter");
    }
}
