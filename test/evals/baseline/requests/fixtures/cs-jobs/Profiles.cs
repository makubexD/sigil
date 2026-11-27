namespace Jobs;

public record Profile(string Id, string Name);

/// <summary>The profile service. One call takes about 100 ms.</summary>
public interface IProfileSource
{
    Task<Profile> GetAsync(string id, CancellationToken cancellationToken = default);
}

public class Profiles(IProfileSource source)
{
    public IProfileSource Source { get; } = source;
}
