using Microsoft.EntityFrameworkCore;

namespace OrdersApi;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<Customer> Customers => Set<Customer>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Customer>(entity =>
        {
            entity.Property(c => c.Name).HasMaxLength(200).IsRequired();
        });

        modelBuilder.Entity<Order>(entity =>
        {
            entity.Property(o => o.Total).HasPrecision(18, 2);
            entity.Property(o => o.CreatedAt).HasColumnType("datetime2");

            entity.HasOne(o => o.Customer)
                .WithMany()
                .HasForeignKey(o => o.CustomerId);

            // Matches the "newest first" sort exactly, so the endpoint reads the
            // first page from the index instead of sorting 20M rows.
            entity.HasIndex(o => new { o.CreatedAt, o.Id })
                .IsDescending(true, true);
        });
    }
}
