namespace Api;

/// <summary>Runs the command-line tools under <c>tools/</c> on uploaded files.</summary>
public class Converter(string projectRoot)
{
    public string UploadsRoot { get; } = Path.Combine(projectRoot, "uploads");

    public string WordCountTool { get; } = Path.Combine(projectRoot, "tools", "wordcount.mjs");
}
