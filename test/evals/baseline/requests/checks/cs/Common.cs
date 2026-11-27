// Shared by every C# grader (README, Grading): the entry point, a logger that records, and
// reflection helpers, so a run that added a logger or a CancellationToken parameter still loads.
using System.Reflection;
using System.Runtime.ExceptionServices;
using Microsoft.Extensions.Logging;

public static class Program
{
    public static async Task<int> Main(string[] args)
    {
        var name = args[0];
        // A case that hangs fails here.
        using var watchdog = new Timer(_ => Finish(1, $"{name}: timed out"), null, 30_000, Timeout.Infinite);
        try
        {
            await Cases.All[name]();
        }
        catch (Exception error)
        {
            Finish(1, $"{name}: {error.GetType().Name}: {error.Message}");
        }

        Finish(0, null);
        return 0;
    }

    private static void Finish(int code, string? message)
    {
        Capture.Restore();
        if (message is not null)
        {
            Console.WriteLine(message);
        }

        Console.Out.Flush();
        Environment.Exit(code);
    }
}

public static class Check
{
    public static void That(bool holds, string why)
    {
        if (!holds)
        {
            throw new InvalidOperationException(why);
        }
    }

    /// <summary>The exception <paramref name="call"/> throws, or null.</summary>
    public static async Task<Exception?> Thrown(Func<Task> call)
    {
        try
        {
            await call();
            return null;
        }
        catch (Exception error)
        {
            return error;
        }
    }
}

/// <summary>What was written to the console while it was captured.</summary>
public static class Capture
{
    private static readonly TextWriter Out = Console.Out;
    private static readonly TextWriter Error = Console.Error;
    private static StringWriter? _writer;

    public static void Start()
    {
        _writer = new StringWriter();
        Console.SetOut(_writer);
        Console.SetError(_writer);
    }

    public static string Restore()
    {
        Console.SetOut(Out);
        Console.SetError(Error);
        var text = _writer?.ToString() ?? "";
        _writer = null;
        return text;
    }
}

public sealed record Entry(
    LogLevel Level,
    string Message,
    Exception? Exception,
    IReadOnlyList<KeyValuePair<string, object?>> State);

public static class Log
{
    public static readonly List<Entry> Entries = [];

    public static string Dump()
    {
        lock (Entries)
        {
            return string.Join(
                "\n",
                Entries.Select(e => $"{e.Message} | {string.Join(", ", e.State.Select(p => $"{p.Key}={Text(p.Value)}"))} | {e.Exception}"));
        }
    }

    public static string Text(object? value) => value switch
    {
        null => "",
        string text => text,
        System.Collections.IDictionary map => string.Join(";", map.Keys.Cast<object>().Select(key => $"{key}={Text(map[key])}")),
        System.Collections.IEnumerable list => string.Join(";", list.Cast<object?>().Select(Text)),
        _ => value.ToString() ?? "",
    };
}

public class FakeLogger : ILogger
{
    public IDisposable? BeginScope<TState>(TState state)
        where TState : notnull => null;

    public bool IsEnabled(LogLevel logLevel) => true;

    public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
    {
        var pairs = state as IEnumerable<KeyValuePair<string, object?>>;
        lock (global::Log.Entries)
        {
            global::Log.Entries.Add(new Entry(logLevel, formatter(state, exception), exception, pairs?.ToList() ?? []));
        }
    }
}

public sealed class FakeLogger<T> : FakeLogger, ILogger<T>;

public sealed class FakeLoggerFactory : ILoggerFactory
{
    public void AddProvider(ILoggerProvider provider)
    {
    }

    public ILogger CreateLogger(string categoryName) => new FakeLogger();

    public void Dispose()
    {
    }
}

/// <summary>Builds objects and calls methods by name, filling parameters a run may have added.</summary>
public static class Kit
{
    /// <summary>Passed to every CancellationToken parameter.</summary>
    public static CancellationToken Token { get; set; }

    public static bool IsLogger(Type type) =>
        type == typeof(ILogger) || type == typeof(ILoggerFactory)
        || (type.IsGenericType && type.GetGenericTypeDefinition() == typeof(ILogger<>));

    public static T Make<T>(params object?[] known) => (T)Make(typeof(T), known);

    public static object Make(Type type, params object?[] known)
    {
        var constructor = type.GetConstructors().OrderByDescending(c => c.GetParameters().Length).First();
        return Unwrap(() => constructor.Invoke(Arguments(constructor.GetParameters(), known)))!;
    }

    public static MethodInfo Method(object target, string name)
    {
        var type = target as Type ?? target.GetType();
        return type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static)
            .Where(m => m.Name == name)
            .OrderByDescending(m => m.GetParameters().Length)
            .FirstOrDefault() ?? throw new MissingMethodException(type.Name, name);
    }

    /// <summary>Calls the method and awaits what it returns; the result of a Task&lt;T&gt;, else the value.</summary>
    public static async Task<object?> Call(object target, string name, params object?[] known)
    {
        var result = Invoke(target, name, known);
        if (result is not null && result.GetType().FullName!.StartsWith("System.Threading.Tasks.ValueTask", StringComparison.Ordinal))
        {
            result = result.GetType().GetMethod("AsTask")!.Invoke(result, null);
        }

        if (result is Task task)
        {
            await task;
            var property = task.GetType().GetProperty("Result");
            return task.GetType().IsGenericType && property!.PropertyType.Name != "VoidTaskResult" ? property.GetValue(task) : null;
        }

        return result;
    }

    /// <summary>Calls the method on this thread and returns what it returned, a Task included.</summary>
    public static object? Invoke(object target, string name, params object?[] known)
    {
        var method = Method(target, name);
        return Unwrap(() => method.Invoke(target is Type ? null : target, Arguments(method.GetParameters(), known)));
    }

    private static object? Unwrap(Func<object?> call)
    {
        try
        {
            return call();
        }
        catch (TargetInvocationException error) when (error.InnerException is not null)
        {
            ExceptionDispatchInfo.Capture(error.InnerException).Throw();
            throw;
        }
    }

    private static object?[] Arguments(ParameterInfo[] parameters, object?[] known)
    {
        var left = known.ToList();
        return parameters.Select(parameter =>
        {
            var type = parameter.ParameterType;
            var index = left.FindIndex(value => value is not null && type.IsInstanceOfType(value));
            if (index >= 0)
            {
                var value = left[index];
                left.RemoveAt(index);
                return value;
            }

            if (type == typeof(CancellationToken))
            {
                return Token;
            }

            if (type == typeof(ILoggerFactory))
            {
                return new FakeLoggerFactory();
            }

            if (type == typeof(ILogger))
            {
                return new FakeLogger();
            }

            if (IsLogger(type))
            {
                return Activator.CreateInstance(typeof(FakeLogger<>).MakeGenericType(type.GetGenericArguments()[0]));
            }

            if (parameter.HasDefaultValue)
            {
                return parameter.DefaultValue;
            }

            return type.IsValueType ? Activator.CreateInstance(type) : null;
        }).ToArray();
    }
}
