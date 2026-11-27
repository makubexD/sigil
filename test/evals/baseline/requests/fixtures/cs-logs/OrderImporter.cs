using Microsoft.Extensions.Logging;

namespace Shop;

public record OrderRow(string Id, int Total);

public interface IOrderStore
{
    /// <summary>Writes one order to the warehouse system. Throws <see cref="InvalidOperationException"/> when the warehouse refuses it.</summary>
    Task SaveAsync(OrderRow row);
}

public class OrderImporter(IOrderStore store, ILogger<OrderImporter> logger)
{
    private readonly IOrderStore _store = store;
    private readonly ILogger<OrderImporter> _logger = logger;
}
