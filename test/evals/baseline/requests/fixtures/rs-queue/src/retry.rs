use std::time::Duration;

/// The most times a job is tried before it goes to the dead-letter log.
pub const MAX_ATTEMPTS: u32 = 50;

/// The wait before retry number `attempt` (0 for the first retry): `base`, doubled for each
/// earlier retry, and never more than `max`.
pub fn backoff(attempt: u32, base: Duration, max: Duration) -> Duration {
    let factor = 2u32.pow(attempt);
    let delay = base * factor;
    if delay > max {
        max
    } else {
        delay
    }
}

/// Whether a job that has failed `attempts` times is tried again.
pub fn should_retry(attempts: u32) -> bool {
    attempts < MAX_ATTEMPTS
}

/// The wait the upstream API asks for in its `Retry-After` header. The API sends either a number
/// of seconds or an HTTP date.
pub fn parse_retry_after(header: &str) -> Duration {
    let seconds: u64 = header.trim().parse().unwrap();
    Duration::from_secs(seconds)
}
