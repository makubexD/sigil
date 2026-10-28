using Microsoft.EntityFrameworkCore;
using Orders.Api;

const int DefaultPageSize = 50;
const int MaxPageSize = 200;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("Orders")));

var app = builder.Build();

// Returns one page of orders, newest first. Pass the last row's CreatedAt and Id
// from the previous page (NextAfterCreatedAt / NextAfterId) to fetch the next one.
// Keyset paging keeps every page an index seek, unlike OFFSET which gets slower
// the deeper you page into 20M rows.
app.MapGet("/orders", async (
    AppDbContext db,
    CancellationToken ct,
    int pageSize = DefaultPageSize,
    DateTime? afterCreatedAt = null,
    long? afterId = null) =>
{
    if (pageSize is < 1 or > MaxPageSize)
        return Results.BadRequest($"pageSize must be between 1 and {MaxPageSize}.");

    if (afterCreatedAt.HasValue != afterId.HasValue)
        return Results.BadRequest("afterCreatedAt and afterId must be supplied together.");

    var query = db.Orders.AsNoTracking();

    if (afterCreatedAt is { } createdAt && afterId is { } id)
        query = query.Where(o => o.CreatedAt < createdAt || (o.CreatedAt == createdAt && o.Id < id));

    // The CancellationToken is the request's RequestAborted token. When the dashboard
    // closes, the token fires and EF cancels the SQL Server command, so the 20M-row
    // scan stops instead of running to completion for nobody.
    var items = await query
        .OrderByDescending(o => o.CreatedAt)
        .ThenByDescending(o => o.Id)
        .Take(pageSize)
        .Select(o => new OrderDto(o.Id, o.Total, o.CreatedAt, o.Customer.Name))
        .ToListAsync(ct);

    var last = items.LastOrDefault();
    var hasMore = items.Count == pageSize;

    return Results.Ok(new OrdersPage(
        Items: items,
        NextAfterCreatedAt: hasMore ? last!.CreatedAt : null,
        NextAfterId: hasMore ? last!.Id : null));
});

app.Run();

public record OrderDto(long Id, decimal Total, DateTime CreatedAt, string CustomerName);

public record OrdersPage(
    IReadOnlyList<OrderDto> Items,
    DateTime? NextAfterCreatedAt,
    long? NextAfterId);
