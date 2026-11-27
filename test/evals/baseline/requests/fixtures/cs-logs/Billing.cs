using Microsoft.Extensions.Logging;

namespace Shop;

public record Order(string Id, int Total);

public record Receipt(string OrderId, string Reference);

public interface IGateway
{
    /// <summary>Charges the card on file. Throws <see cref="InvalidOperationException"/> when the charge fails.</summary>
    Task<Receipt> ChargeAsync(string orderId, int total);
}

public class Billing(IGateway gateway, ILogger<Billing> logger)
{
    private readonly IGateway _gateway = gateway;
    private readonly ILogger<Billing> _logger = logger;
}
