using Shop;

public static class Cases
{
    public static readonly Dictionary<string, Func<Task>> All = new()
    {
        ["cents-works"] = Works,
    };

    private static async Task Works()
    {
        Check.That(Convert.ToInt64(await Kit.Call(typeof(Money), "ToCents", 12.5m)) == 1250, "12.5");
        Check.That(Convert.ToInt64(await Kit.Call(typeof(Money), "ToCents", 0.29m)) == 29, "0.29");
    }
}
