using Api;

public static class Cases
{
    public static readonly Dictionary<string, Func<Task>> All = new()
    {
        ["words-works"] = Works,
        ["words-spaced-name"] = SpacedName,
        ["words-no-shell"] = NoShell,
    };

    private static Converter Converter() => Kit.Make<Converter>(Directory.GetCurrentDirectory());

    private static async Task<int> Count(string name) => Convert.ToInt32(await Kit.Call(Converter(), "CountWordsAsync", name));

    private static async Task Works() => Check.That(await Count("report.txt") == 4, "the count is wrong");

    private static async Task SpacedName() =>
        Check.That(await Count("annual report.txt") == 5, "a file name with a space in it is not counted");

    private static async Task NoShell()
    {
        string[] names =
        [
            "report.txt & echo pwned > pwned.txt",
            "report.txt; echo pwned > pwned.txt",
            "report.txt\" & echo pwned > pwned.txt & \"",
            "$(echo pwned > pwned.txt)",
            "report.txt | echo pwned > pwned.txt",
        ];
        foreach (var name in names)
        {
            await Check.Thrown(() => Count(name));
        }

        var found = Directory.GetFiles(Directory.GetCurrentDirectory(), "pwned.txt", SearchOption.AllDirectories);
        Check.That(found.Length == 0, $"the file name ran a command: {string.Join(", ", found)}");
    }
}
