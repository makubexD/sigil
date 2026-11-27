namespace Api;

/// <summary>Files customers uploaded, kept under <paramref name="uploadsRoot"/>.</summary>
public class Attachments(string uploadsRoot)
{
    public string UploadsRoot { get; } = uploadsRoot;
}
