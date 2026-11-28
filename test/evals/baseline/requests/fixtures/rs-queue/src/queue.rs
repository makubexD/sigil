use std::collections::VecDeque;
use std::sync::Mutex;

/// One unit of work.
#[derive(Debug, Clone, PartialEq)]
pub struct Job {
    pub id: u64,
    pub payload: String,
    /// How many times the job has failed so far.
    pub attempts: u32,
}

struct Inner {
    pending: VecDeque<Job>,
    next_id: u64,
}

/// A bounded queue shared by the intake thread and the workers.
pub struct Queue {
    inner: Mutex<Inner>,
    capacity: usize,
}

impl Queue {
    /// A queue that holds at most `capacity` jobs. The capacity comes from the worker's config
    /// file, where 0 turns the queue off.
    pub fn new(capacity: usize) -> Self {
        Queue {
            inner: Mutex::new(Inner {
                pending: VecDeque::with_capacity(capacity),
                next_id: 1,
            }),
            capacity,
        }
    }

    /// The number of jobs waiting.
    pub fn len(&self) -> usize {
        self.inner.lock().unwrap().pending.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn is_full(&self) -> bool {
        self.len() >= self.capacity
    }

    /// Adds a job and returns its id, or `None` when the queue is full.
    pub fn push(&self, payload: String) -> Option<u64> {
        let mut inner = self.inner.lock().unwrap();
        if self.is_full() {
            return None;
        }
        let id = inner.next_id;
        inner.next_id += 1;
        inner.pending.push_back(Job {
            id,
            payload,
            attempts: 0,
        });
        Some(id)
    }

    /// Takes up to `max` jobs, oldest first.
    pub fn take(&self, max: usize) -> Vec<Job> {
        let mut inner = self.inner.lock().unwrap();
        let count = max.min(inner.pending.len());
        inner.pending.drain(..count).collect()
    }

    /// Puts a failed job back at the front of the queue, so it runs again before newer work.
    pub fn requeue(&self, mut job: Job) {
        job.attempts += 1;
        let mut inner = self.inner.lock().unwrap();
        inner.pending.push_back(job);
    }

    /// The share of the capacity in use, from 0 to 100, for the metrics endpoint.
    pub fn fill_percent(&self) -> u8 {
        (self.len() * 100 / self.capacity) as u8
    }
}
