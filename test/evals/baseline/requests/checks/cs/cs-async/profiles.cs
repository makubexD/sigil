using System.Diagnostics;
using Jobs;

public static class Cases
{
    public static readonly Dictionary<string, Func<Task>> All = new()
    {
        ["profiles-works"] = Works,
        ["profiles-together"] = Together,
    };

    private sealed class Source(int delay) : IProfileSource
    {
        public async Task<Profile> GetAsync(string id, CancellationToken cancellationToken = default)
        {
            await Task.Delay(id == "a" ? delay * 2 : delay, cancellationToken);
            return new Profile(id, id.ToUpperInvariant());
        }
    }

    private static async Task<List<Profile>> Load(int delay, IReadOnlyList<string> ids) =>
        ((IEnumerable<Profile>)(await Kit.Call(Kit.Make<Profiles>(new Source(delay)), "LoadAsync", ids))!).ToList();

    private static async Task Works()
    {
        var profiles = await Load(5, ["a", "b", "c"]);
        Check.That(profiles.Select(profile => profile.Id).SequenceEqual(["a", "b", "c"]), "the profiles are not in the order of the ids");
    }

    private static async Task Together()
    {
        var watch = Stopwatch.StartNew();
        await Load(100, Enumerable.Range(0, 10).Select(i => $"u{i}").ToList());
        Check.That(watch.ElapsedMilliseconds < 600, $"ten lookups of 100 ms took {watch.ElapsedMilliseconds} ms");
    }
}
