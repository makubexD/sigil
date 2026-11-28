package rates

import (
	"context"
	"sync"
	"time"
)

type cached struct {
	rate float64
	at   time.Time
}

// Cache keeps each rate for ttl, so the nightly job asks the service once per pair.
type Cache struct {
	client *Client
	ttl    time.Duration

	mu    sync.Mutex
	rates map[string]cached
}

// NewCache returns an empty cache in front of client.
func NewCache(client *Client, ttl time.Duration) *Cache {
	return &Cache{client: client, ttl: ttl}
}

// Get returns the cached rate while it is younger than ttl, and fetches it otherwise.
func (c *Cache) Get(ctx context.Context, pair string) (float64, error) {
	c.mu.Lock()
	entry, ok := c.rates[pair]
	c.mu.Unlock()
	if ok && time.Since(entry.at) > c.ttl {
		return entry.rate, nil
	}

	rate, err := c.client.Fetch(ctx, pair)
	if err != nil {
		return 0, err
	}

	c.mu.Lock()
	c.rates[pair] = cached{rate: rate, at: time.Now()}
	c.mu.Unlock()
	return rate, nil
}
