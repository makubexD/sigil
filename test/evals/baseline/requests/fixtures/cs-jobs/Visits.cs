namespace Jobs;

/// <summary>Where page visits are kept. Saving talks to the analytics database and can fail.</summary>
public interface IVisitStore
{
    Task SaveAsync(string page);
}

public class Visits(IVisitStore store)
{
    public IVisitStore Store { get; } = store;
}
