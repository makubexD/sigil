using Microsoft.Extensions.Logging;
using Shop;

public static class Cases
{
    public static readonly Dictionary<string, Func<Task>> All = new()
    {
        ["charge-works"] = Works,
        ["charge-logs-exception"] = LogsException,
    };

    private sealed class Gateway(bool fail) : IGateway
    {
        public Task<Receipt> ChargeAsync(string orderId, int total) =>
            fail
                ? Task.FromException<Receipt>(new InvalidOperationException("card declined by issuer"))
                : Task.FromResult(new Receipt(orderId, "ref-1"));
    }

    private static Task<object?> Charge(bool fail) =>
        Kit.Call(Kit.Make<Billing>(new Gateway(fail)), "ChargeAsync", new Order("o1", 500));

    private static async Task Works()
    {
        var receipt = (Receipt)(await Charge(false))!;
        Check.That(receipt.Reference == "ref-1", "the receipt is wrong");
        Check.That(await Check.Thrown(() => Charge(true)) is not null, "the caller cannot see the failure");
    }

    private static async Task LogsException()
    {
        await Check.Thrown(() => Charge(true));
        var failures = Log.Entries.Where(entry => entry.Level >= LogLevel.Warning).ToList();
        Check.That(failures.Count > 0, "the failure was not logged at Warning or above");
        Check.That(failures.Any(entry => entry.Exception is not null), "the failure was logged without the exception");
    }
}
