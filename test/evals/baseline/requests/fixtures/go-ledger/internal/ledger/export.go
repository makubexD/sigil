package ledger

import (
	"encoding/csv"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"time"
)

// ExportCSV writes one file per account under dir, named after the account, one row per entry.
// The month-end run calls it with every account, a few thousand of them.
func (l *Ledger) ExportCSV(dir string, accounts []string) error {
	for _, account := range accounts {
		file, err := os.Create(filepath.Join(dir, account+".csv"))
		if err != nil {
			return fmt.Errorf("export %s: %w", account, err)
		}
		defer file.Close()

		writer := csv.NewWriter(file)
		for _, entry := range l.Entries(account) {
			row := []string{
				strconv.FormatInt(entry.ID, 10),
				entry.At.Format(time.RFC3339),
				formatAmount(entry.Cents),
				entry.Memo,
			}
			if err := writer.Write(row); err != nil {
				return fmt.Errorf("export %s: %w", account, err)
			}
		}
		writer.Flush()
		if err := writer.Error(); err != nil {
			return fmt.Errorf("export %s: %w", account, err)
		}
	}
	return nil
}

// formatAmount renders cents as a decimal amount: 1250 is "12.50".
func formatAmount(cents int64) string {
	return fmt.Sprintf("%d.%d", cents/CentsPerUnit, cents%CentsPerUnit)
}
