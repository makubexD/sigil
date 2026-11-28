package ledger

// CentsPerUnit is the number of minor units in one unit of every currency the ledger holds.
const CentsPerUnit = 100

// Abs returns the size of an amount without its sign.
func Abs(cents int64) int64 {
	if cents < 0 {
		return -cents
	}
	return cents
}
