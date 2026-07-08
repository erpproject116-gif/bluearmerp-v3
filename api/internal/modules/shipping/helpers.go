package shipping

import (
	"fmt"
	"time"
)

func formatDateNoDisplay(d time.Time, dateSeq int) string {
	return fmt.Sprintf("%s-%d", d.Format("01/02/2006"), dateSeq)
}
