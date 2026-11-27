namespace Shop;

public record StockItem(string Sku, int Stock);

public interface IStorefront
{
    /// <summary>Sends one item's stock level to the storefront.</summary>
    void Push(StockItem item);
}

/// <summary>Pushes stock levels to the storefront.</summary>
public class InventorySync(IStorefront storefront)
{
    private readonly IStorefront _storefront = storefront;

    public void Describe(IReadOnlyList<StockItem> items)
    {
        Console.WriteLine($"{items.Count} items");
        foreach (var item in items)
        {
            Console.WriteLine($"  {item.Sku}: {item.Stock}");
        }

        Console.WriteLine("done");
    }
}
