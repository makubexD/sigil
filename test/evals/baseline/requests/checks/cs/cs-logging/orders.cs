using Microsoft.Extensions.Logging;
using Shop;

public static class Cases
{
    public static readonly Dictionary<string, Func<Task>> All = new()
    {
        ["orders-works"] = Works,
        ["orders-uses-logger"] = UsesLogger,
        ["orders-quiet-loop"] = QuietLoop,
    };

    private sealed class Store(string? refuse) : IOrderStore
    {
        public List<string> Saved { get; } = [];

        public Task SaveAsync(OrderRow row)
        {
            if (row.Id == refuse)
            {
                throw new InvalidOperationException("refused by the warehouse");
            }

            Saved.Add(row.Id);
            return Task.CompletedTask;
        }
    }

    private static async Task<(Store Store, string Printed)> Import(int count, string? refuse)
    {
        var store = new Store(refuse);
        IReadOnlyList<OrderRow> rows = Enumerable.Range(0, count).Select(i => new OrderRow($"o{i}", i)).ToList();
        Capture.Start();
        try
        {
            await Kit.Call(Kit.Make<OrderImporter>(store), "ImportAsync", rows);
        }
        catch
        {
            Capture.Restore();
            throw;
        }

        return (store, Capture.Restore());
    }

    private static async Task Works()
    {
        var (store, _) = await Import(4, "o1");
        Check.That(store.Saved.SequenceEqual(["o0", "o2", "o3"]), $"saved {string.Join(",", store.Saved)}");
    }

    private static async Task UsesLogger()
    {
        var (_, printed) = await Import(4, null);
        Check.That(Log.Entries.Count > 0, "nothing was logged");
        Check.That(printed.Trim().Length == 0, "the import wrote to the console");
    }

    private static async Task QuietLoop()
    {
        await Import(300, null);
        var loud = Log.Entries.Count(entry => entry.Level >= LogLevel.Information);
        Check.That(loud <= 10, $"{loud} records at Information or above for 300 orders");
    }
}
