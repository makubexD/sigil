// Hidden behaviour tests for requests/react-async.json (README, Grading).
import assert from 'node:assert/strict';
import {
  button, calls, click, h, load, pick, queryClient, render, renderHook, route, unhandled,
  visibleText, wait, waitFor,
} from '../web/react-kit.mjs'; // prettier-ignore

const FAILURE = /fail|error|couldn.t|could not|unable|try again|went wrong|not saved|problem/i;
const list = (value, key) => value?.[key] ?? value?.data;

function ordersApi() {
  route('GET', /^\/api\/customers\/[^/]+\/orders/, call => {
    const id = call.path.split('/')[3];
    return { body: [{ id: `o-${id}`, total: 10 }], delay: id === 'slow' ? 200 : 20 };
  });
}
function searchApi() {
  route('GET', /\/products\?q=/, call => {
    const term = decodeURIComponent(call.path.split('q=')[1]);
    return { body: [{ sku: `${term}-1`, title: term }], delay: term.length === 1 ? 200 : 20 };
  });
}
function projectsApi() {
  const projects = [{ id: 'p1', name: 'Apollo' }];
  route('GET', '/api/projects', () => ({
    body: projects.map(project => ({ ...project })),
    delay: 10,
  }));
  route('PATCH', /^\/api\/projects\/p1$/, call => {
    projects[0].name = JSON.parse(call.body).name;
    return { body: { ...projects[0] }, delay: 20 };
  });
}
function dashboardApi(revenueDelay, ordersDelay) {
  route('GET', '/api/revenue', () => ({ body: [{ month: 'jan', total: 7 }], delay: revenueDelay }));
  route('GET', '/api/orders/recent', () => ({
    body: [{ id: 'o1', total: 5 }],
    delay: ordersDelay,
  }));
}
const dashboard = async () => {
  const Dashboard = pick(await load('Dashboard.tsx'), 'Dashboard');
  return render(h(Dashboard), { client: await queryClient() });
};
const saveButton = async () => {
  const SaveButton = pick(await load('SaveButton.tsx'), 'SaveButton');
  const view = await render(h(SaveButton, { text: 'hello draft' }), {
    client: await queryClient(),
  });
  await click(button(view.container, /save/i));
  return view;
};

export const CASES = {
  async 'orders-works'() {
    ordersApi();
    const useOrders = pick(await load('useOrders.ts'), 'useOrders');
    const { result } = await renderHook(useOrders, 'c1', { client: await queryClient() });
    await waitFor(
      () => list(result.current, 'orders')?.[0]?.id === 'o-c1',
      'the orders never arrived',
    );
  },
  async 'orders-one-request'() {
    ordersApi();
    const useOrders = pick(await load('useOrders.ts'), 'useOrders');
    const seen = [];
    const Reader = ({ slot }) => {
      seen[slot] = useOrders('c1');
      return null;
    };
    await render(h('div', null, h(Reader, { slot: 0 }), h(Reader, { slot: 1 })), {
      client: await queryClient(),
    });
    await waitFor(
      () => seen.every(value => list(value, 'orders')?.[0]?.id === 'o-c1'),
      'two readers of one customer did not both get the orders',
    );
    const requests = calls.filter(call => call.path.includes('/customers/c1/orders')).length;
    assert.equal(requests, 1, `two readers of one customer made ${requests} requests`);
  },
  async 'orders-latest-wins'() {
    ordersApi();
    const useOrders = pick(await load('useOrders.ts'), 'useOrders');
    const { result, rerender } = await renderHook(useOrders, 'slow', {
      client: await queryClient(),
    });
    await rerender('fast');
    await waitFor(
      () => list(result.current, 'orders')?.[0]?.id === 'o-fast',
      'no orders for the new customer',
    );
    await wait(400);
    assert.equal(
      list(result.current, 'orders')?.[0]?.id,
      'o-fast',
      'the slower answer for the previous customer replaced the current one',
    );
  },
  async 'search-works'() {
    searchApi();
    const useSearch = pick(await load('useSearch.ts'), 'useSearch');
    const { result } = await renderHook(useSearch, 'lamp');
    await waitFor(
      () => list(result.current, 'results')?.[0]?.sku === 'lamp-1',
      'no results arrived',
    );
  },
  async 'search-latest-wins'() {
    searchApi();
    const useSearch = pick(await load('useSearch.ts'), 'useSearch');
    const { result, rerender } = await renderHook(useSearch, 'l');
    await wait(30);
    await rerender('la');
    await waitFor(
      () => list(result.current, 'results')?.[0]?.sku === 'la-1',
      'no results for the new term',
    );
    await wait(400);
    assert.equal(
      list(result.current, 'results')?.[0]?.sku,
      'la-1',
      'the slower answer for the previous term replaced the current one',
    );
  },
  async 'search-aborts-stale'() {
    searchApi();
    const useSearch = pick(await load('useSearch.ts'), 'useSearch');
    const { result, rerender, unmount } = await renderHook(useSearch, 'l');
    await wait(30);
    await rerender('la');
    await waitFor(
      () => list(result.current, 'results')?.[0]?.sku === 'la-1',
      'no results for the new term',
    );
    const stale = calls.filter(call => call.path.endsWith('q=l'));
    assert.ok(
      stale.every(call => call.signal?.aborted),
      'the request for the previous term was left running',
    );
    await rerender('lam');
    await wait(5);
    await unmount();
    await wait(30);
    const last = calls.filter(call => call.path.endsWith('q=lam'));
    assert.ok(
      last.every(call => call.signal?.aborted),
      'the request in flight was left running after the widget was removed',
    );
  },
  async 'rename-works'() {
    projectsApi();
    const useRenameProject = pick(await load('useRenameProject.ts'), 'useRenameProject');
    const { result } = await renderHook(useRenameProject, undefined, {
      client: await queryClient(),
    });
    assert.equal(typeof result.current?.rename, 'function', 'the hook returns no rename function');
    await wait(0);
    void Promise.resolve(result.current.rename('p1', 'Zeus')).catch(() => {});
    await waitFor(
      () => calls.some(call => call.method === 'PATCH' && JSON.parse(call.body).name === 'Zeus'),
      'the rename was never sent',
    );
  },
  async 'rename-list-fresh'() {
    projectsApi();
    const useRenameProject = pick(await load('useRenameProject.ts'), 'useRenameProject');
    const useProjects = pick(await load('useProjects.ts'), 'useProjects');
    const seen = {};
    const Screen = () => {
      seen.projects = useProjects().data;
      seen.rename = useRenameProject().rename;
      return null;
    };
    await render(h(Screen), { client: await queryClient() });
    await waitFor(() => seen.projects?.[0]?.name === 'Apollo', 'the project list never loaded');
    void Promise.resolve(seen.rename('p1', 'Zeus')).catch(() => {});
    await waitFor(
      () => seen.projects?.[0]?.name === 'Zeus',
      'the project list on screen still shows the old name after the rename',
    );
  },
  async 'save-works'() {
    route('POST', '/api/drafts', () => ({ body: { id: 'd1' }, delay: 10 }));
    await saveButton();
    await waitFor(
      () =>
        calls.some(
          call =>
            call.method === 'POST' &&
            call.path === '/api/drafts' &&
            call.body.includes('hello draft'),
        ),
      'the draft was never sent',
    );
  },
  async 'save-failure-shown'() {
    route('POST', '/api/drafts', () => ({ status: 500, delay: 10 }));
    const { container } = await saveButton();
    await waitFor(
      () => container.querySelector('[role=alert]') || FAILURE.test(visibleText(container)),
      'a refused save shows the user nothing',
    );
  },
  async 'save-failure-handled'() {
    route('POST', '/api/drafts', () => ({ status: 500, delay: 10 }));
    await saveButton();
    await wait(300);
    assert.equal(unhandled.length, 0, 'a refused save ends in a promise rejection nothing handles');
  },
  async 'dashboard-works'() {
    dashboardApi(30, 10);
    const { container } = await dashboard();
    await waitFor(
      () =>
        /Customer portal/.test(visibleText(container)) &&
        /jan: 7/.test(visibleText(container)) &&
        /Order o1/.test(visibleText(container)),
      'the header, the chart and the orders are not all on the page',
    );
  },
  async 'dashboard-header-first'() {
    dashboardApi(500, 400);
    const { container } = await dashboard();
    await wait(100);
    assert.match(visibleText(container), /Customer portal/, 'the header waits for the data');
  },
  async 'dashboard-independent'() {
    dashboardApi(700, 30);
    const { container } = await dashboard();
    await wait(250);
    assert.match(visibleText(container), /Order o1/, 'the orders wait for the slow chart');
    assert.doesNotMatch(visibleText(container), /jan: 7/);
  },
  async 'initials-works'() {
    const Initials = pick(await load('Initials.tsx'), 'Initials');
    const { container } = await render(h(Initials, { name: 'Ada Lovelace' }));
    assert.equal(visibleText(container), 'AL');
  },
};
