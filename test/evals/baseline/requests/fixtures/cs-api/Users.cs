namespace Api;

public record User(int Id, string Name);

/// <summary>The accounts database. The table is <c>users</c>, with columns <c>id</c> and <c>name</c>.</summary>
public interface IDatabase
{
    /// <summary>Runs a query. A parameter named <c>name</c> is written <c>@name</c> in the SQL.</summary>
    Task<IReadOnlyList<User>> QueryUsersAsync(string sql, IReadOnlyDictionary<string, object?> parameters);
}

public class Users(IDatabase database)
{
    public IDatabase Database { get; } = database;
}
