using Microsoft.EntityFrameworkCore;
using OrdersApi;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("Default")));

var app = builder.Build();

// Keyset pagination: the dashboard loads one page at a time, newest first.
// The database never materialises more than one page, and the request's
// CancellationToken stops the SQL query if the user closes the dashboard.
app.MapGet("/orders", async (
    AppDbContext db,
    CancellationToken cancellationToken,
    int limit = 50,
    DateTime? beforeCreatedAt = null,
    long? beforeId = null) =>
{
    if (beforeCreatedAt.HasValue != beforeId.HasValue)
        return Results.BadRequest("beforeCreatedAt and beforeId must be supplied together.");

    limit = Math.Clamp(limit, 1, 200);

    var query = db.Orders.AsNoTracking();

    if (beforeCreatedAt is { } createdAt && beforeId is { } id)
    {
        query = query.Where(o => o.CreatedAt < createdAt || (o.CreatedAt == createdAt && o.Id < id));
    }

    var items = await query
        .OrderByDescending(o => o.CreatedAt)
        .ThenByDescending(o => o.Id)
        .Take(limit)
        .Select(o => new OrderDto(o.Id, o.Total, o.CreatedAt, o.Customer.Name))
        .ToListAsync(cancellationToken);

    OrderCursor? next = items.Count == limit
        ? new OrderCursor(items[^1].CreatedAt, items[^1].Id)
        : null;

    return Results.Ok(new OrderPage(items, next));
});

app.Run();
