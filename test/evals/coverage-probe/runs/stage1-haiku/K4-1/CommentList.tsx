import { memo, useDeferredValue, useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';

export interface PostComment {
  id: string;
  author: string;
  /** HTML produced by the rich-text editor. Untrusted: sanitized before rendering. */
  body: string;
  createdAt?: string;
}

interface CommentListProps {
  postId: string;
}

interface IndexedComment {
  comment: PostComment;
  /** Lowercased, so each keystroke only does substring checks. */
  author: string;
  /** Lowercased plain text of the body, with tags stripped. */
  text: string;
}

const PAGE_SIZE = 100;

function htmlToText(html: string): string {
  // DOMParser documents are inert: no scripts run and no resources load.
  return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
}

function useComments(postId: string) {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; comments: PostComment[] }
  >({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/posts/${encodeURIComponent(postId)}/comments`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
        return (await res.json()) as PostComment[];
      })
      .then((comments) => setState({ status: 'ready', comments }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
      });

    return () => controller.abort();
  }, [postId]);

  return state;
}

/**
 * Renders the comments of a post. When `postId` changes, the inner list is
 * remounted via `key`, so the old post's comments, search query and paging
 * are dropped and the in-flight request for the old post is aborted.
 */
export function CommentList({ postId }: CommentListProps) {
  return <CommentListContent key={postId} postId={postId} />;
}

function CommentListContent({ postId }: CommentListProps) {
  const state = useComments(postId);
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Typing updates the input immediately; the filtered list catches up in a
  // lower-priority render, so a few thousand comments do not block input.
  const deferredQuery = useDeferredValue(query);

  const indexed = useMemo<IndexedComment[]>(() => {
    if (state.status !== 'ready') return [];
    return state.comments.map((comment) => ({
      comment,
      author: comment.author.toLowerCase(),
      text: htmlToText(comment.body).toLowerCase(),
    }));
  }, [state]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return indexed;
    return indexed.filter((item) => item.author.includes(q) || item.text.includes(q));
  }, [indexed, deferredQuery]);

  if (state.status === 'loading') return <p role="status">Loading comments…</p>;
  if (state.status === 'error') return <p role="alert">Could not load comments: {state.message}</p>;

  const shown = filtered.slice(0, visibleCount);

  return (
    <section>
      <input
        type="search"
        placeholder="Search by author or text"
        aria-label="Search comments"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setVisibleCount(PAGE_SIZE);
        }}
      />
      <p aria-live="polite">
        {filtered.length} of {indexed.length} comments
      </p>

      {filtered.length === 0 ? (
        <p>No comments match.</p>
      ) : (
        <ul className="comment-list">
          {shown.map(({ comment }) => (
            <CommentItem key={comment.id} comment={comment} />
          ))}
        </ul>
      )}

      {filtered.length > shown.length && (
        <button type="button" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
          Show more ({filtered.length - shown.length} remaining)
        </button>
      )}
    </section>
  );
}

const CommentItem = memo(function CommentItem({ comment }: { comment: PostComment }) {
  const html = useMemo(() => DOMPurify.sanitize(comment.body), [comment.body]);

  return (
    <li className="comment">
      <header>
        <strong>{comment.author}</strong>
        {comment.createdAt && <time dateTime={comment.createdAt}> {new Date(comment.createdAt).toLocaleString()}</time>}
      </header>
      <div className="comment-body" dangerouslySetInnerHTML={{ __html: html }} />
    </li>
  );
});
