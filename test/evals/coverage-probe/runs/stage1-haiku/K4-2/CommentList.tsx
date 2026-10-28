import { memo, useDeferredValue, useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';

export interface PostComment {
  id: string;
  author: string;
  body: string; // HTML produced by the rich text editor
  createdAt: string;
}

// Comments are prepared once, when they arrive, so filtering and rendering
// never re-sanitize or re-parse HTML.
interface PreparedComment {
  id: string;
  author: string;
  createdAt: string;
  html: string;
  searchText: string; // lowercased author + plain text of the body
}

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'code', 'pre',
  'blockquote', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'a',
];

// DOMPurify hooks are global to the app. Force links to open safely.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node instanceof HTMLAnchorElement) {
    node.rel = 'noopener noreferrer';
    node.target = '_blank';
  }
});

function prepare(comment: PostComment): PreparedComment {
  const html = DOMPurify.sanitize(comment.body, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'title'],
  });

  // A <template> is inert, so parsing the sanitized HTML here runs no scripts.
  const template = document.createElement('template');
  template.innerHTML = html;
  const text = template.content.textContent ?? '';

  return {
    id: comment.id,
    author: comment.author,
    createdAt: comment.createdAt,
    html,
    searchText: `${comment.author}\n${text}`.toLowerCase(),
  };
}

type LoadState =
  | { postId: string; status: 'loading' }
  | { postId: string; status: 'error'; message: string }
  | { postId: string; status: 'ready'; comments: PreparedComment[] };

interface CommentListProps {
  postId: string;
}

export function CommentList({ postId }: CommentListProps) {
  const [state, setState] = useState<LoadState>({ postId, status: 'loading' });
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/posts/${encodeURIComponent(postId)}/comments`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load comments (${res.status})`);
        return (await res.json()) as PostComment[];
      })
      .then((comments) => {
        if (controller.signal.aborted) return;
        setState({ postId, status: 'ready', comments: comments.map(prepare) });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          postId,
          status: 'error',
          message: err instanceof Error ? err.message : 'Failed to load comments',
        });
      });

    return () => controller.abort();
  }, [postId]);

  // State belonging to a previous post is ignored until the new one loads.
  const loaded = state.postId === postId ? state : undefined;

  const visible = useMemo(() => {
    if (loaded?.status !== 'ready') return [];
    const q = deferredQuery.trim().toLowerCase();
    return q ? loaded.comments.filter((c) => c.searchText.includes(q)) : loaded.comments;
  }, [loaded, deferredQuery]);

  return (
    <section aria-label="Comments">
      <input
        type="search"
        placeholder="Search by author or text"
        aria-label="Search comments"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {(!loaded || loaded.status === 'loading') && <p role="status">Loading comments…</p>}

      {loaded?.status === 'error' && <p role="alert">{loaded.message}</p>}

      {loaded?.status === 'ready' && loaded.comments.length === 0 && <p>No comments yet.</p>}

      {loaded?.status === 'ready' && loaded.comments.length > 0 && (
        <>
          <p>
            {visible.length === loaded.comments.length
              ? `${visible.length} comments`
              : `${visible.length} of ${loaded.comments.length} comments`}
          </p>
          {visible.length === 0 ? (
            <p>No comments match “{query}”.</p>
          ) : (
            <ul className="comment-list">
              {visible.map((comment) => (
                <CommentItem key={comment.id} comment={comment} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

const CommentItem = memo(function CommentItem({ comment }: { comment: PreparedComment }) {
  return (
    <li
      className="comment"
      // Lets the browser skip layout and paint for off-screen comments.
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 120px' }}
    >
      <header>
        <strong>{comment.author}</strong>{' '}
        <time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time>
      </header>
      {/* Sanitized in prepare(); the only HTML that reaches the DOM. */}
      <div className="comment-body" dangerouslySetInnerHTML={{ __html: comment.html }} />
    </li>
  );
});
