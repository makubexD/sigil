import { useDeferredValue, useEffect, useId, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import DOMPurify from 'dompurify';

// Shape of one item returned by /api/posts/{postId}/comments.
// `body` is HTML produced by the rich-text editor.
export interface Comment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

interface IndexedComment {
  id: string;
  author: string;
  createdAt: string;
  safeHtml: string;
  // Lowercased author + plain text of the body, computed once per load
  // so filtering on every keystroke never touches the DOM or parses HTML.
  searchText: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; comments: IndexedComment[] };

// Sanitize once, then derive the searchable text from the sanitized HTML.
// DOMPurify strips scripts, event handlers and other unsafe markup, so the
// output is safe for dangerouslySetInnerHTML.
function indexComments(raw: Comment[]): IndexedComment[] {
  const parser = new DOMParser();
  return raw.map((c) => {
    const safeHtml = DOMPurify.sanitize(c.body);
    const text = parser.parseFromString(safeHtml, 'text/html').body.textContent ?? '';
    return {
      id: c.id,
      author: c.author,
      createdAt: c.createdAt,
      safeHtml,
      searchText: `${c.author}\n${text}`.toLowerCase(),
    };
  });
}

export function CommentList({ postId }: { postId: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [query, setQuery] = useState('');
  // Keeps typing responsive: the list may re-render slightly behind the input.
  const deferredQuery = useDeferredValue(query);
  const searchId = useId();

  useEffect(() => {
    // Abort the previous post's request and ignore late responses,
    // so comments from an old post never appear under the new one.
    const controller = new AbortController();
    setState({ status: 'loading' });

    fetch(`/api/posts/${encodeURIComponent(postId)}/comments`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load comments (${res.status})`);
        return (await res.json()) as Comment[];
      })
      .then((data) => {
        setState({ status: 'ready', comments: indexComments(data) });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Failed to load comments',
        });
      });

    return () => controller.abort();
  }, [postId]);

  const visible = useMemo(() => {
    if (state.status !== 'ready') return [];
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return state.comments;
    return state.comments.filter((c) => c.searchText.includes(q));
  }, [state, deferredQuery]);

  if (state.status === 'loading') {
    return <p role="status">Loading comments…</p>;
  }

  if (state.status === 'error') {
    return <p role="alert">{state.message}</p>;
  }

  const total = state.comments.length;
  const onQueryChange = (e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value);

  return (
    <section aria-labelledby={`${searchId}-heading`}>
      <h2 id={`${searchId}-heading`}>Comments ({total})</h2>

      <label htmlFor={`${searchId}-search`}>Search by author or text</label>
      <input
        id={`${searchId}-search`}
        type="search"
        value={query}
        onChange={onQueryChange}
        placeholder="Search comments"
        autoComplete="off"
      />

      {query.trim() && (
        <p aria-live="polite">
          {visible.length} of {total} match
        </p>
      )}

      {total === 0 ? (
        <p>No comments yet.</p>
      ) : visible.length === 0 ? (
        <p>No comments match “{query.trim()}”.</p>
      ) : (
        <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {visible.map((c) => (
            <li
              key={c.id}
              style={{
                // Lets the browser skip layout and paint for off-screen
                // comments, which keeps long threads scrollable.
                contentVisibility: 'auto',
                containIntrinsicBlockSize: 'auto 120px',
                borderBottom: '1px solid #ddd',
                padding: '0.75rem 0',
              }}
            >
              <header>
                <strong>{c.author}</strong>{' '}
                <time dateTime={c.createdAt}>
                  {new Date(c.createdAt).toLocaleString()}
                </time>
              </header>
              <div dangerouslySetInnerHTML={{ __html: c.safeHtml }} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
