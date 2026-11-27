using Api;

public static class Cases
{
    public static readonly Dictionary<string, Func<Task>> All = new()
    {
        ["attachment-works"] = Works,
        ["attachment-contained"] = Contained,
    };

    private const string Marker = "MARKER-outside";

    private static string Root()
    {
        var root = Path.Combine(Path.GetTempPath(), "cs-grade-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(root, "uploads"));
        Directory.CreateDirectory(Path.Combine(root, "uploads-old"));
        File.WriteAllText(Path.Combine(root, "uploads", "report.txt"), "quarterly numbers are up\n");
        File.WriteAllText(Path.Combine(root, "outside.txt"), Marker);
        File.WriteAllText(Path.Combine(root, "uploads-old", "secret.txt"), Marker);
        return root;
    }

    private static async Task Works()
    {
        var attachments = Kit.Make<Attachments>(Path.Combine(Root(), "uploads"));
        var bytes = (byte[])(await Kit.Call(attachments, "Read", "report.txt"))!;
        Check.That(System.Text.Encoding.UTF8.GetString(bytes) == "quarterly numbers are up\n", "the file's contents are wrong");
    }

    private static async Task Contained()
    {
        var root = Root();
        var attachments = Kit.Make<Attachments>(Path.Combine(root, "uploads"));
        string[] names =
        [
            "../outside.txt",
            "..\\outside.txt",
            Path.Combine(root, "outside.txt"),
            "sub/../../outside.txt",
            "../uploads-old/secret.txt",
        ];
        foreach (var name in names)
        {
            byte[]? bytes = null;
            await Check.Thrown(async () => bytes = (byte[]?)await Kit.Call(attachments, "Read", name));
            Check.That(bytes is null || !System.Text.Encoding.UTF8.GetString(bytes).Contains(Marker), $"read {name}");
        }
    }
}
