using Api;

public static class Cases
{
    public static readonly Dictionary<string, Func<Task>> All = new()
    {
        ["page-works"] = Works,
    };

    private static async Task Works()
    {
        Check.That((int)(await Kit.Call(typeof(Paging), "Clamp", 0, 5))! == 1, "0 of 5");
        Check.That((int)(await Kit.Call(typeof(Paging), "Clamp", 3, 5))! == 3, "3 of 5");
        Check.That((int)(await Kit.Call(typeof(Paging), "Clamp", 9, 5))! == 5, "9 of 5");
    }
}
