namespace Orders.Api;

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
