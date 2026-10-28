namespace OrdersApi;

public class Customer
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
}

public class Order
{
    public long Id { get; set; }
    public decimal Total { get; set; }
    public DateTime CreatedAt { get; set; }

    public int CustomerId { get; set; }
    public Customer Customer { get; set; } = null!;
}

// Response shapes returned by GET /orders.
public record OrderDto(long Id, decimal Total, DateTime CreatedAt, string CustomerName);

public record OrdersPage(IReadOnlyList<OrderDto> Items, DateTime? NextCreatedAt, long? NextId);
