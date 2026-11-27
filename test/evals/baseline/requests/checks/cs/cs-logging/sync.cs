using Microsoft.Extensions.Logging;
using Shop;

public static class Cases
{
    public static readonly Dictionary<string, Func<Task>> All = new()
    {
        ["sync-works"] = Works,
        ["sync-uses-logger"] = UsesLogger,
    };

    private sealed class Storefront : IStorefront
    {
        public List<string> Pushed { get; } = [];

        public void Push(StockItem item) => Pushed.Add(item.Sku);
    }

    private static async Task<(Storefront Storefront, string Printed)> Run()
    {
        var storefront = new Storefront();
        IReadOnlyList<StockItem> items = [new StockItem("a", 1), new StockItem("b", 2)];
        Capture.Start();
        try
        {
            await Kit.Call(Kit.Make<InventorySync>(storefront), "Run", items);
        }
        catch
        {
            Capture.Restore();
            throw;
        }

        return (storefront, Capture.Restore());
    }

    private static async Task Works()
    {
        var (storefront, _) = await Run();
        Check.That(storefront.Pushed.SequenceEqual(["a", "b"]), $"pushed {string.Join(",", storefront.Pushed)}");
    }

    private static async Task UsesLogger()
    {
        var injected = typeof(InventorySync).GetConstructors().Any(c => c.GetParameters().Any(p => Kit.IsLogger(p.ParameterType)));
        var (_, printed) = await Run();
        Check.That(printed.Trim().Length == 0, "the sync wrote to the console");
        Check.That(injected, "InventorySync takes no logger");
        Check.That(Log.Entries.Count >= 2, $"{Log.Entries.Count} records for a start and a finish");
    }
}
