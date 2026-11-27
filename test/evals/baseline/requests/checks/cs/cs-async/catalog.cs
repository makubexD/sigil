using Jobs;

public static class Cases
{
    public static readonly Dictionary<string, Func<Task>> All = new()
    {
        ["catalog-works"] = Works,
        ["catalog-accepts-token"] = AcceptsToken,
        ["catalog-forwards-token"] = ForwardsToken,
    };

    private sealed class Source : IPageSource
    {
        public List<CancellationToken> Tokens { get; } = [];

        public Task<IReadOnlyList<Item>> GetPageAsync(int page, CancellationToken cancellationToken)
        {
            Tokens.Add(cancellationToken);
            return Task.FromResult<IReadOnlyList<Item>>([new Item($"p{page}")]);
        }
    }

    private static async Task Works()
    {
        var items = (IEnumerable<Item>)(await Kit.Call(Kit.Make<Catalog>(new Source()), "SyncAsync", 3))!;
        Check.That(items.Select(item => item.Sku).SequenceEqual(["p1", "p2", "p3"]), "the items are wrong");
    }

    private static Task AcceptsToken()
    {
        var parameters = Kit.Method(typeof(Catalog), "SyncAsync").GetParameters();
        Check.That(parameters.Any(p => p.ParameterType == typeof(CancellationToken)), "SyncAsync takes no CancellationToken");
        return Task.CompletedTask;
    }

    private static async Task ForwardsToken()
    {
        using var cancellation = new CancellationTokenSource();
        Kit.Token = cancellation.Token;
        var source = new Source();
        await Kit.Call(Kit.Make<Catalog>(source), "SyncAsync", 2);
        cancellation.Cancel();
        Check.That(source.Tokens.Count == 2, $"{source.Tokens.Count} pages were fetched");
        Check.That(source.Tokens.All(token => token.IsCancellationRequested), "the page source is called with a token that the caller cannot cancel");
    }
}
