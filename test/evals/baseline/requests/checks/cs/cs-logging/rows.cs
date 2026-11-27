using Microsoft.Extensions.Logging;
using Shop;

public static class Cases
{
    public static readonly Dictionary<string, Func<Task>> All = new()
    {
        ["rows-works"] = Works,
        ["rows-counts-structured"] = CountsStructured,
    };

    private static IReadOnlyList<Row> Rows() =>
    [
        new Row("a", 100),
        new Row("", 5),
        new Row("b", null),
        new Row("c", 7),
        .. Enumerable.Range(0, 35).Select(i => new Row($"s{i}", i + 1)),
    ];

    private static async Task<List<Row>> Normalize() =>
        ((IEnumerable<Row>)(await Kit.Call(Kit.Make<RowCleaner>(), "Normalize", Rows()))!).ToList();

    private static async Task Works()
    {
        var kept = await Normalize();
        Check.That(kept.Count == 37 && kept.All(row => row.Sku.Length > 0 && row.Price is not null), $"{kept.Count} rows kept");
    }

    private static async Task CountsStructured()
    {
        await Normalize();
        Check.That(Log.Entries.Count > 0, "nothing was logged");
        var structured = Log.Entries.Any(entry => entry.State.Any(pair => pair.Value is int or long && Convert.ToInt64(pair.Value) == 37));
        Check.That(structured, "the kept count is formatted into the message, not passed as a named value");
    }
}
