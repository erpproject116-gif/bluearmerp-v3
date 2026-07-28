package helpassistant

import "testing"

func TestIsOffTopicERPQuery(t *testing.T) {
	off := []string{
		"write a React component for a todo list",
		"explain Python list comprehensions",
		"help me debug this TypeScript error",
		"what is the capital of France",
		"tell me a joke",
	}
	for _, q := range off {
		if !IsOffTopicERPQuery(q) {
			t.Fatalf("expected off-topic: %q", q)
		}
	}
	on := []string{
		"how do I create a quotation?",
		"what is my open AR?",
		"where is inventory serial registry",
		"create sales order for customer Acme",
	}
	for _, q := range on {
		if IsOffTopicERPQuery(q) {
			t.Fatalf("expected on-topic: %q", q)
		}
	}
}
