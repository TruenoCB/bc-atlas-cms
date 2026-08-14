package domain

import (
	"encoding/json"
	"testing"
)

func TestContentInputAcceptsJSONNumbersForFootprints(t *testing.T) {
	input := ContentInput{
		Slug:       "field-note-lisbon",
		Title:      "Lisbon field note",
		Visibility: "public",
		Tags: []Tag{{
			Slug: "footprint",
			Properties: map[string]any{
				"latitude":      json.Number("38.7223"),
				"longitude":     json.Number("-9.1393"),
				"location_name": "Lisbon",
			},
		}},
	}

	if err := input.Validate(); err != nil {
		t.Fatalf("expected valid footprint input, got %v", err)
	}
	if input.Type != "article" {
		t.Fatalf("expected default content type article, got %q", input.Type)
	}
}
