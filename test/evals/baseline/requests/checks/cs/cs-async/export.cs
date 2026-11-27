using Jobs;

public static class Cases
{
    public static readonly Dictionary<string, Func<Task>> All = new()
    {
        ["export-works"] = Works,
        ["export-disposed-on-failure"] = DisposedOnFailure,
    };

    private sealed class Writer(int failAt) : IRowWriter
    {
        public List<string> Rows { get; } = [];

        public bool Disposed { get; private set; }

        public Task WriteAsync(string row)
        {
            if (Rows.Count + 1 == failAt)
            {
                throw new IOException("the disk is full");
            }

            Rows.Add(row);
            return Task.CompletedTask;
        }

        public ValueTask DisposeAsync()
        {
            Disposed = true;
            return ValueTask.CompletedTask;
        }
    }

    private static Task<object?> Export(Writer writer) =>
        Kit.Call(Kit.Make<Exporter>((Func<IRowWriter>)(() => writer)), "ExportAsync", (IReadOnlyList<string>)["a", "b", "c"]);

    private static async Task Works()
    {
        var writer = new Writer(0);
        var count = Convert.ToInt32(await Export(writer));
        Check.That(count == 3 && writer.Rows.SequenceEqual(["a", "b", "c"]), $"{count} rows reported, {writer.Rows.Count} written");
        Check.That(writer.Disposed, "the file was left open");
    }

    private static async Task DisposedOnFailure()
    {
        var writer = new Writer(2);
        var error = await Check.Thrown(() => Export(writer));
        Check.That(error is not null, "a full disk was reported as a finished export");
        Check.That(writer.Disposed, "the file was left open after a write failed");
    }
}
