namespace Jobs;

/// <summary>An open export file. Disposing it flushes and releases the file.</summary>
public interface IRowWriter : IAsyncDisposable
{
    /// <summary>Writes one row. Throws <see cref="IOException"/> when the disk is full.</summary>
    Task WriteAsync(string row);
}

public class Exporter(Func<IRowWriter> open)
{
    public Func<IRowWriter> Open { get; } = open;
}
