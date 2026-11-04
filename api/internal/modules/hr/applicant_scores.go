package hr

import "fmt"

var fiveScoreKeys = []string{
	"attendance_punctuality",
	"job_performance",
	"work_attitude",
	"communication",
	"following_instructions",
}

func averageFiveScores(scores map[string]float64) (float64, error) {
	if len(scores) != len(fiveScoreKeys) {
		return 0, fmt.Errorf("five scores required")
	}
	sum := 0.0
	for _, key := range fiveScoreKeys {
		n, ok := scores[key]
		if !ok || n < 1 || n > 5 || n != float64(int(n)) {
			return 0, fmt.Errorf("score %s must be a whole number from 1 to 5", key)
		}
		sum += n
	}
	return sum / float64(len(fiveScoreKeys)), nil
}

func applicationCreatesEmployee(status string) bool {
	return false
}
