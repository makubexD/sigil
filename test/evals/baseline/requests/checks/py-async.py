"""Hidden behaviour tests for requests/py-async.json (README, Grading).

    python py-async.py <case>     (cwd: the project a run left behind)

Each case imports the module the request asked for and runs it on an event loop. A `*-works` case is
the feature; the other cases are what a slow or fragile implementation gets wrong.
"""

import asyncio
import gc
import os
import sys
import threading
import time


def run(coroutine, limit=20):
    async def bounded():
        return await asyncio.wait_for(coroutine, limit)

    return asyncio.run(bounded())


def profiles_works():
    from jobs.profiles import Profile, load_profiles

    async def fetch(id):
        await asyncio.sleep(0.01 if id == "a" else 0)
        return Profile(id=id, name=id.upper())

    assert [p.id for p in run(load_profiles(["a", "b", "c"], fetch))] == ["a", "b", "c"]


def profiles_together():
    from jobs.profiles import Profile, load_profiles

    async def fetch(id):
        await asyncio.sleep(0.1)
        return Profile(id=id, name=id)

    started = time.perf_counter()
    run(load_profiles([str(i) for i in range(10)], fetch))
    elapsed = time.perf_counter() - started
    assert elapsed < 0.6, f"ten lookups of 0.1 s took {elapsed:.2f} s"


def enrich_works():
    from jobs.enrich import enrich

    assert run(enrich(["a", "b"])) == {"a": "region-a", "b": "region-b"}


def enrich_loop_free():
    from jobs.enrich import enrich

    async def measure():
        gaps = []
        done = False

        async def tick():
            last = time.perf_counter()
            while not done:
                await asyncio.sleep(0.01)
                now = time.perf_counter()
                gaps.append(now - last)
                last = now

        ticker = asyncio.create_task(tick())
        await asyncio.sleep(0.05)
        await enrich(["a", "b", "c"])
        done = True
        await ticker
        return max(gaps)

    worst = run(measure())
    assert worst < 0.15, f"the event loop stood still for {worst:.2f} s"


def visit_works():
    from jobs import visits

    async def scenario():
        visits.record_visit("home")
        await asyncio.sleep(0.1)
        return list(visits.store.saved)

    assert run(scenario()) == ["home"]


def visit_does_not_wait():
    from jobs import visits

    async def slow(page):
        await asyncio.sleep(0.5)
        visits.store.saved.append(page)

    async def scenario():
        visits.store.save = slow
        started = time.perf_counter()
        result = visits.record_visit("home")
        elapsed = time.perf_counter() - started
        assert result is None, "record_visit returns something to wait for"
        assert elapsed < 0.2, f"the caller waited {elapsed:.2f} s"
        await asyncio.sleep(0.7)
        assert visits.store.saved == ["home"], "the save never finished"

    run(scenario())


def visit_failure_handled():
    from jobs import visits

    reported = []

    async def broken(page):
        raise RuntimeError("database is down")

    async def scenario():
        asyncio.get_running_loop().set_exception_handler(lambda loop, context: reported.append(context))
        visits.store.save = broken
        visits.record_visit("home")
        await asyncio.sleep(0.1)
        gc.collect()
        await asyncio.sleep(0.1)

    run(scenario())
    gc.collect()
    assert not reported, f"a failed save is never looked at: {reported[0].get('message')}"


def worker_works():
    from jobs.worker import Job, drain

    handled = []

    async def handle(job):
        if job.id == 2:
            raise RuntimeError("bad job")
        handled.append(job.id)

    async def scenario():
        queue = asyncio.Queue()
        for id in [1, 2, 3]:
            queue.put_nowait(Job(id=id))
        task = asyncio.create_task(drain(queue, handle))
        await asyncio.sleep(0.3)
        assert handled == [1, 3], f"handled {handled}"
        assert not task.done(), "the worker stopped"
        # Leave from here: closing the loop would wait on a worker that ignores cancellation, and
        # that is worker-cancellable's case, not this one.
        sys.stdout.flush()
        os._exit(0)

    run(scenario())


def worker_cancellable():
    from jobs.worker import Job, drain

    async def handle(job):
        await asyncio.sleep(30)

    async def scenario(busy):
        queue = asyncio.Queue()
        if busy:
            queue.put_nowait(Job(id=1))
            queue.put_nowait(Job(id=2))
        task = asyncio.create_task(drain(queue, handle))
        await asyncio.sleep(0.1)
        task.cancel()
        await asyncio.wait({task}, timeout=1)
        stopped = task.done()
        if not stopped:
            for _ in range(5):
                task.cancel()
                await asyncio.sleep(0)
        return stopped and task.cancelled()

    assert run(scenario(busy=False)), "cancelling an idle worker does not stop it"
    assert run(scenario(busy=True)), "cancelling a busy worker does not stop it"


def flight(delay):
    state = {"now": 0, "most": 0}

    async def resize(path):
        state["now"] += 1
        state["most"] = max(state["most"], state["now"])
        await asyncio.sleep(delay)
        state["now"] -= 1
        return path + ".thumb"

    return state, resize


def resize_works():
    from jobs.thumbnails import resize_all

    _, resize = flight(0)
    assert run(resize_all(["a", "b", "c"], resize)) == ["a.thumb", "b.thumb", "c.thumb"]


def resize_bounded():
    from jobs.thumbnails import resize_all

    state, resize = flight(0)
    run(resize_all([f"img{i}" for i in range(3000)], resize))
    assert state["most"] <= 500, f"{state['most']} of 3000 files were open at once"


def resize_not_serial():
    from jobs.thumbnails import resize_all

    state, resize = flight(0.001)
    run(resize_all([f"img{i}" for i in range(200)], resize))
    assert state["most"] > 1, "the images were resized one at a time"


def initials_works():
    from jobs.names import initials

    assert initials("Ada Lovelace") == "AL"
    assert initials("grace brewster hopper") == "GBH"


CASES = {
    "profiles-works": profiles_works,
    "profiles-together": profiles_together,
    "enrich-works": enrich_works,
    "enrich-loop-free": enrich_loop_free,
    "visit-works": visit_works,
    "visit-does-not-wait": visit_does_not_wait,
    "visit-failure-handled": visit_failure_handled,
    "worker-works": worker_works,
    "worker-cancellable": worker_cancellable,
    "resize-works": resize_works,
    "resize-bounded": resize_bounded,
    "resize-not-serial": resize_not_serial,
    "initials-works": initials_works,
}


def main():
    name = sys.argv[1]
    sys.path.insert(0, ".")
    sys.dont_write_bytecode = True
    # A case that hangs (a worker that cannot be cancelled, a call with no deadline) fails here.
    watchdog = threading.Timer(25, lambda: (print(f"{name}: timed out", flush=True), os._exit(1)))
    watchdog.daemon = True
    watchdog.start()
    try:
        CASES[name]()
    except BaseException as error:  # a failed case is any exception, an assert included
        print(f"{name}: {type(error).__name__}: {error}")
        sys.stdout.flush()
        os._exit(1)
    sys.stdout.flush()
    os._exit(0)


if __name__ == "__main__":
    main()
