# React Testing Library Quick Reference

## Query Priority (use in this order)

| Priority | Query | Use when |
|---|---|---|
| 1 | `getByRole` | Any interactive/landmark element. Almost always prefer this. |
| 2 | `getByLabelText` | Form inputs with a `<label>` |
| 3 | `getByPlaceholderText` | Inputs with no label (discouraged in production) |
| 4 | `getByText` | Non-interactive text content |
| 5 | `getByDisplayValue` | Current value of a form element |
| 6 | `getByAltText` | Images |
| 7 | `getByTitle` | SVG elements, `title` attribute |
| 8 | `getByTestId` | Last resort — set `data-testid` on the element |

## Query Variants

| Prefix | Not found | Multiple | Async |
|---|---|---|---|
| `getBy` | throws | throws | ❌ |
| `queryBy` | `null` | throws | ❌ |
| `findBy` | throws (after timeout) | throws | ✅ |
| `getAllBy` | throws | returns array | ❌ |
| `queryAllBy` | `[]` | returns array | ❌ |
| `findAllBy` | throws | returns array | ✅ |

Use `queryBy` when you need to assert an element is **absent**: `expect(screen.queryByText('Error')).not.toBeInTheDocument()`.

## Common Role Values

```tsx
screen.getByRole('button')        // <button>, role="button"
screen.getByRole('link')          // <a href>
screen.getByRole('textbox')       // <input type="text">, <textarea>
screen.getByRole('checkbox')      // <input type="checkbox">
screen.getByRole('combobox')      // <select>, custom dropdowns
screen.getByRole('listitem')      // <li>
screen.getByRole('heading', { level: 2 })  // <h2>
screen.getByRole('alert')         // role="alert" (error messages)
screen.getByRole('dialog')        // <dialog>, role="dialog"
screen.getByRole('img', { name: 'Profile photo' })  // <img alt="Profile photo">
```

## Common `jest-dom` Matchers

```tsx
expect(el).toBeInTheDocument()
expect(el).not.toBeInTheDocument()
expect(el).toBeVisible()
expect(el).toBeDisabled() / .not.toBeDisabled()
expect(el).toBeChecked() / .not.toBeChecked()
expect(el).toHaveValue('text')
expect(el).toHaveTextContent('Hello')
expect(el).toHaveAttribute('aria-label', 'Close')
expect(el).toHaveClass('active')
expect(el).toHaveFocus()
```

## `userEvent` Common Actions

```tsx
const user = userEvent.setup();

await user.click(button)
await user.type(input, 'hello')
await user.clear(input)
await user.selectOptions(select, ['option1'])
await user.keyboard('{Enter}')
await user.hover(element)
await user.tab()                  // move focus to next focusable element
```

## `waitFor` and `act`

```tsx
// Wait for a condition to be true (poll with timeout)
await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());

// Wait for all pending state updates
await act(async () => { fireEvent.click(button); });
```

Prefer `findBy*` over `waitFor(() => getBy*())` — it's shorter and has the same behaviour.
