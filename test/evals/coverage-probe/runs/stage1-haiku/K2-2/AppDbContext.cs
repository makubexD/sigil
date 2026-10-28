using Microsoft.EntityFrameworkCore;

namespace OrdersApi;

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
            e.Property(o => o.Total).HasColumnType("decimal(18,2)");

            e.HasOne(o => o.Customer)
                .WithMany()
                .HasForeignKey(o => o.CustomerId);

            // Matches the keyset query in Program.cs: newest first, Id breaks ties.
            // IncludeProperties makes it covering, so the page is served from the index
            // without key lookups into the 20M-row clustered index.
            e.HasIndex(o => new { o.CreatedAt, o.Id })
                .IsDescending(true, true)
                .IncludeProperties(o => new { o.Total, o.CustomerId });
        });
    }
}
