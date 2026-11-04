package hr

import "testing"

func TestAverageFiveScores(t *testing.T) {
	avg, err := averageFiveScores(map[string]float64{
		"attendance_punctuality": 5,
		"job_performance":        3,
		"work_attitude":          4,
		"communication":          2,
		"following_instructions": 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	if avg != 3 {
		t.Fatalf("average = %v", avg)
	}
	if _, err := averageFiveScores(map[string]float64{"attendance_punctuality": 6}); err == nil {
		t.Fatal("expected rejection")
	}
}

func TestHiredDoesNotCreateEmployee(t *testing.T) {
	if applicationCreatesEmployee("hired") {
		t.Fatal("hired must not create an employee")
	}
}
