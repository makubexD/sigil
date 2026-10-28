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

public record OrderDto(long Id, decimal Total, DateTime CreatedAt, string CustomerName);

// Cursor for the next page: pass beforeCreatedAt and beforeId back to GET /orders.
// Null when there are no more rows.
public record OrderCursor(DateTime BeforeCreatedAt, long BeforeId);

public record OrderPage(IReadOnlyList<OrderDto> Items, OrderCursor? Next);
