using Api;

public static class Cases
{
    public static readonly Dictionary<string, Func<Task>> All = new()
    {
        ["invite-works"] = Works,
    };

    private static async Task Works()
    {
        var code = (string)(await Kit.Call(typeof(Invites), "NewCode"))!;
        var other = (string)(await Kit.Call(typeof(Invites), "NewCode"))!;
        Check.That(code.Length >= 6, $"the code is {code.Length} characters");
        Check.That(code != other, "two codes are the same");
        Check.That((bool)(await Kit.Call(typeof(Invites), "IsValid", code, code))!, "the right code is refused");
        Check.That(!(bool)(await Kit.Call(typeof(Invites), "IsValid", code + "x", code))!, "a wrong code is accepted");
        Check.That(!(bool)(await Kit.Call(typeof(Invites), "IsValid", "nope", code))!, "a wrong code is accepted");
    }
}
