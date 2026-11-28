// Package ledger keeps account balances in minor units (cents) and the entries behind them.
package ledger

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

var (
	// ErrUnknownAccount is returned for an account that was never opened.
	ErrUnknownAccount = errors.New("ledger: unknown account")
	// ErrInsufficient is returned when an entry would take a balance below zero.
	ErrInsufficient = errors.New("ledger: insufficient funds")
	// ErrAmount is returned for a transfer of zero or less.
	ErrAmount = errors.New("ledger: amount must be positive")
)

// Entry is one movement on one account.
type Entry struct {
	ID      int64
	Account string
	Cents   int64
	At      time.Time
	Memo    string
}

// Ledger is safe for use from several goroutines.
type Ledger struct {
	mu       sync.RWMutex
	balances map[string]int64
	entries  []Entry
	nextID   int64
}

// New returns an empty ledger.
func New() *Ledger {
	return &Ledger{balances: make(map[string]int64), nextID: 1}
}

// Open adds an account with a zero balance. Opening it twice changes nothing.
func (l *Ledger) Open(account string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if _, ok := l.balances[account]; !ok {
		l.balances[account] = 0
	}
}

// Balance returns what an account holds, in cents.
func (l *Ledger) Balance(account string) (int64, error) {
	l.mu.RLock()
	defer l.mu.RUnlock()
	cents, ok := l.balances[account]
	if !ok {
		return 0, fmt.Errorf("%w: %s", ErrUnknownAccount, account)
	}
	return cents, nil
}

// Post records one entry and moves the balance by it.
func (l *Ledger) Post(account string, cents int64, memo string) (Entry, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.post(account, cents, memo)
}

// post does the work of Post. The caller holds the write lock.
func (l *Ledger) post(account string, cents int64, memo string) (Entry, error) {
	balance, ok := l.balances[account]
	if !ok {
		return Entry{}, fmt.Errorf("%w: %s", ErrUnknownAccount, account)
	}
	if balance+cents < 0 {
		return Entry{}, fmt.Errorf("%w: %s", ErrInsufficient, account)
	}
	entry := Entry{ID: l.nextID, Account: account, Cents: cents, At: time.Now().UTC(), Memo: memo}
	l.nextID++
	l.balances[account] = balance + cents
	l.entries = append(l.entries, entry)
	return entry, nil
}

// Transfer moves cents from one account to another, or moves nothing and returns the reason.
func (l *Ledger) Transfer(from, to string, cents int64) error {
	if cents <= 0 {
		return ErrAmount
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	if _, err := l.post(from, -cents, "transfer to "+to); err != nil {
		return err
	}
	if _, err := l.post(to, cents, "transfer from "+from); err != nil {
		return err
	}
	return nil
}

// Entries returns the entries of one account, oldest first.
func (l *Ledger) Entries(account string) []Entry {
	var out []Entry
	for _, entry := range l.entries {
		if entry.Account == account {
			out = append(out, entry)
		}
	}
	return out
}
