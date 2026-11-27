using Jobs;

public static class Cases
{
    public static readonly Dictionary<string, Func<Task>> All = new()
    {
        ["gate-works"] = Works,
        ["gate-continuations-async"] = ContinuationsAsync,
    };

    private static object NewGate()
    {
        var type = typeof(Names).Assembly.GetTypes().FirstOrDefault(t => t.Name == "Gate")
            ?? throw new TypeLoadException("there is no Gate class");
        return Kit.Make(type);
    }

    private static Task Wait(object gate) => (Task)Kit.Invoke(gate, "WaitAsync")!;

    private static async Task Works()
    {
        var gate = NewGate();
        var first = Wait(gate);
        var second = Wait(gate);
        await Task.Delay(50);
        Check.That(!first.IsCompleted && !second.IsCompleted, "WaitAsync finished before Open was called");
        Kit.Invoke(gate, "Open");
        await Task.WhenAll(first, second).WaitAsync(TimeSpan.FromSeconds(2));
        await Wait(gate).WaitAsync(TimeSpan.FromSeconds(2));
    }

    private static async Task ContinuationsAsync()
    {
        var gate = NewGate();
        var waiting = Wait(gate);
        var opening = false;
        var inline = false;
        var opener = Environment.CurrentManagedThreadId;
        var continuation = waiting.ContinueWith(
            _ => inline = Volatile.Read(ref opening) && Environment.CurrentManagedThreadId == opener,
            TaskContinuationOptions.ExecuteSynchronously);
        Volatile.Write(ref opening, true);
        Kit.Invoke(gate, "Open");
        Volatile.Write(ref opening, false);
        await continuation.WaitAsync(TimeSpan.FromSeconds(2));
        Check.That(!inline, "a waiter's continuation ran inside Open, on the caller's thread");
    }
}
