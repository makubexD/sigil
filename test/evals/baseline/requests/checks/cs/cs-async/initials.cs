using Jobs;

public static class Cases
{
    public static readonly Dictionary<string, Func<Task>> All = new()
    {
        ["initials-works"] = Works,
    };

    private static async Task Works()
    {
        Check.That((string)(await Kit.Call(typeof(Names), "Initials", "Ada Lovelace"))! == "AL", "Ada Lovelace");
        Check.That((string)(await Kit.Call(typeof(Names), "Initials", "grace brewster hopper"))! == "GBH", "grace brewster hopper");
    }
}
