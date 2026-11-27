using Microsoft.Extensions.Logging;

namespace Shop;

public record Row(string Sku, int? Price);

/// <summary>Cleans rows from a supplier's price list.</summary>
public class RowCleaner(ILogger<RowCleaner> logger)
{
    private readonly ILogger<RowCleaner> _logger = logger;
}
