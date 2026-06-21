# xUnit Assertion Cheat-Sheet

Quick reference for the most-used `Assert.*` methods in xUnit.

## Equality

| Method | Use |
|---|---|
| `Assert.Equal(expected, actual)` | Value equality (expected first!) |
| `Assert.NotEqual(notExpected, actual)` | Values differ |
| `Assert.Same(expected, actual)` | Reference equality |
| `Assert.NotSame(obj1, obj2)` | Different references |

## Null / Boolean

| Method | Use |
|---|---|
| `Assert.Null(obj)` | Object is null |
| `Assert.NotNull(obj)` | Object is not null |
| `Assert.True(condition)` | Boolean is true |
| `Assert.False(condition)` | Boolean is false |

## Strings

| Method | Use |
|---|---|
| `Assert.Contains(substring, str)` | String contains substring |
| `Assert.DoesNotContain(substring, str)` | String does not contain substring |
| `Assert.StartsWith(prefix, str)` | String starts with prefix |
| `Assert.EndsWith(suffix, str)` | String ends with suffix |
| `Assert.Matches(pattern, str)` | String matches regex pattern |

## Collections

| Method | Use |
|---|---|
| `Assert.Empty(collection)` | Collection is empty |
| `Assert.NotEmpty(collection)` | Collection has items |
| `Assert.Single(collection)` | Exactly one item |
| `Assert.Contains(item, collection)` | Collection contains item |
| `Assert.DoesNotContain(item, collection)` | Collection does not contain item |
| `Assert.Equal(expected, actual)` | Sequence equality (order matters) |
| `Assert.Equivalent(expected, actual)` | Deep structural equality (order-insensitive) |

## Exceptions

```csharp
// Synchronous
var ex = Assert.Throws<ArgumentNullException>(() => sut.Method(null));
Assert.Equal("paramName", ex.ParamName);

// Asynchronous
var ex = await Assert.ThrowsAsync<NotFoundException>(
    async () => await sut.GetUserAsync(badId));
Assert.Contains("not found", ex.Message);
```

## Type checks

```csharp
Assert.IsType<ConcreteType>(obj);     // exactly ConcreteType
Assert.IsAssignableFrom<IService>(obj); // implements IService
```

## Ranges

```csharp
Assert.InRange(value, low, high);     // low <= value <= high
Assert.NotInRange(value, low, high);
```
