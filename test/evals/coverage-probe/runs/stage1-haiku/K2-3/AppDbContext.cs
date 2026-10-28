using Microsoft.EntityFrameworkCore;

namespace Orders.Api;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Order> Orders => Set<Order>();

    public DbSet<Customer> Customers => Set<Customer>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Customer>(e =>
        {
            e.ToTable("Customers");
            e.HasKey(c => c.Id);
            e.Property(c => c.Name).HasMaxLength(200);
        });

        modelBuilder.Entity<Order>(e =>
        {
            e.ToTable("Orders");
            e.HasKey(o => o.Id);
            e.Property(o => o.Total).HasPrecision(18, 2);

            e.HasOne(o => o.Customer)
                .WithMany()
                .HasForeignKey(o => o.CustomerId);

            // Serves GET /orders: newest-first keyset paging, with the selected
            // columns included so the query never has to touch the base rows.
            e.HasIndex(o => new { o.CreatedAt, o.Id })
                .IsDescending(true, true)
                .IncludeProperties(o => new { o.Total, o.CustomerId });
        });
    }
}
