namespace Jobs;

public record Item(string Sku);

/// <summary>The supplier's catalog. The supplier allows one request at a time.</summary>
public interface IPageSource
{
    Task<IReadOnlyList<Item>> GetPageAsync(int page, CancellationToken cancellationToken);
}

public class Catalog(IPageSource source)
{
    public IPageSource Source { get; } = source;
}
