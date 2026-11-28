// Package rates fetches exchange rates from the rates service and caches them.
package rates

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"
)

// Client talks to the rates service.
type Client struct {
	BaseURL string
	HTTP    *http.Client
}

// NewClient returns a client for the service at baseURL.
func NewClient(baseURL string) *Client {
	return &Client{BaseURL: baseURL, HTTP: &http.Client{}}
}

type quote struct {
	Pair string  `json:"pair"`
	Rate float64 `json:"rate"`
}

// Fetch returns the rate for a pair such as "EURUSD". It tries three times and gives up early
// when ctx is cancelled.
func (c *Client) Fetch(ctx context.Context, pair string) (float64, error) {
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		endpoint := c.BaseURL + "/v1/rates?pair=" + url.QueryEscape(pair)
		req, err := http.NewRequest(http.MethodGet, endpoint, nil)
		if err != nil {
			return 0, fmt.Errorf("rates: %w", err)
		}
		resp, err := c.HTTP.Do(req)
		if err != nil {
			lastErr = err
			time.Sleep(time.Duration(attempt+1) * time.Second)
			continue
		}
		if resp.StatusCode != http.StatusOK {
			lastErr = fmt.Errorf("rates: %s returned %d", pair, resp.StatusCode)
			time.Sleep(time.Duration(attempt+1) * time.Second)
			continue
		}
		var q quote
		err = json.NewDecoder(resp.Body).Decode(&q)
		resp.Body.Close()
		if err != nil {
			return 0, fmt.Errorf("rates: decode %s: %w", pair, err)
		}
		return q.Rate, nil
	}
	return 0, lastErr
}
