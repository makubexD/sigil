using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using OrdersApi;

const int DefaultPageSize = 50;
const int MaxPageSize = 200;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("Default")));

var app = builder.Build();

// Returns orders newest first, one page at a time. Send the nextCreatedAt/nextId
// from the previous response as beforeCreatedAt/beforeId to get the next page.
// Keyset paging keeps every page equally fast; OFFSET would slow down on a 20M-row table.
//
// The CancellationToken is passed to EF Core, so when the dashboard closes the
// connection the SQL command is cancelled and SQL Server stops the query.
app.MapGet("/orders", async Task<Results<Ok<OrdersPage>, BadRequest<string>>> (
    AppDbContext db,
    int? limit,
    DateTime? beforeCreatedAt,
    long? beforeId,
    CancellationToken cancellationToken) =>
{
    var pageSize = Math.Clamp(limit ?? DefaultPageSize, 1, MaxPageSize);

    if ((beforeCreatedAt is null) != (beforeId is null))
        return TypedResults.BadRequest("beforeCreatedAt and beforeId must be sent together.");

    var orders = db.Orders.AsNoTracking();

    if (beforeCreatedAt is { } createdAt && beforeId is { } id)
    {
        orders = orders.Where(o =>
            o.CreatedAt < createdAt || (o.CreatedAt == createdAt && o.Id < id));
    }

    // Read one extra row to find out whether another page exists.
    var rows = await orders
        .OrderByDescending(o => o.CreatedAt)
        .ThenByDescending(o => o.Id)
        .Take(pageSize + 1)
        .Select(o => new OrderDto(o.Id, o.Total, o.CreatedAt, o.Customer.Name))
        .ToListAsync(cancellationToken);

    if (rows.Count <= pageSize)
        return TypedResults.Ok(new OrdersPage(rows, null, null));

    var items = rows.Take(pageSize).ToList();
    var last = items[^1];

    return TypedResults.Ok(new OrdersPage(items, last.CreatedAt, last.Id));
});

app.Run();
