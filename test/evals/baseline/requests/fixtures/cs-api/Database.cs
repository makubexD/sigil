namespace Api;

/// <summary>Thrown when the database cannot be reached or the DSN cannot be read.</summary>
public class DatabaseException(string message, Exception? inner = null) : Exception(message, inner);

public record Connection(string Host, int Port, string User, string Name);

/// <summary>The database driver.</summary>
public static class Driver
{
    /// <summary>Opens a connection. Throws <see cref="IOException"/> when the host refuses it.</summary>
    public static Connection Open(string host, int port, string user, string password, string name)
    {
        if (host.EndsWith(".down", StringComparison.Ordinal))
        {
            throw new IOException($"connection to {host}:{port} refused");
        }

        return new Connection(host, port, user, name);
    }
}

public static class Database
{
}
