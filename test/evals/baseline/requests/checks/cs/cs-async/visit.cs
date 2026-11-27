using System.Diagnostics;
using System.Runtime.CompilerServices;
using Jobs;

public static class Cases
{
    public static readonly Dictionary<string, Func<Task>> All = new()
    {
        ["visit-works"] = Works,
        ["visit-does-not-wait"] = DoesNotWait,
        ["visit-failure-observed"] = FailureObserved,
    };

    private sealed class Store(int delay, bool fail) : IVisitStore
    {
        public List<string> Saved { get; } = [];

        public async Task SaveAsync(string page)
        {
            await Task.Delay(delay);
            if (fail)
            {
                throw new IOException("the analytics database is down");
            }

            lock (Saved)
            {
                Saved.Add(page);
            }
        }
    }

    [MethodImpl(MethodImplOptions.NoInlining)]
    private static void Record(Store store) => Kit.Invoke(Kit.Make<Visits>(store), "Record", "home");

    private static async Task Works()
    {
        var store = new Store(10, false);
        Record(store);
        await Task.Delay(300);
        Check.That(store.Saved.SequenceEqual(["home"]), "the visit was not saved");
    }

    private static async Task DoesNotWait()
    {
        var store = new Store(500, false);
        var watch = Stopwatch.StartNew();
        Record(store);
        Check.That(watch.ElapsedMilliseconds < 250, $"the caller waited {watch.ElapsedMilliseconds} ms");
        await Task.Delay(900);
        Check.That(store.Saved.SequenceEqual(["home"]), "the save never finished");
    }

    private static async Task FailureObserved()
    {
        var unobserved = false;
        TaskScheduler.UnobservedTaskException += (_, _) => unobserved = true;
        Record(new Store(10, true));
        await Task.Delay(300);
        for (var i = 0; i < 3; i++)
        {
            GC.Collect();
            GC.WaitForPendingFinalizers();
            await Task.Delay(50);
        }

        Check.That(!unobserved, "a failed save is never looked at");
    }
}
