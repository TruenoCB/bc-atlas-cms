package domain

import "testing"

func TestSearchTextFromMarkdownKeepsVisibleTextAndDropsMarkup(t *testing.T) {
	markdown := "# Calm systems\n\nThe **recovery path** is [documented](https://example.com).\n\n![diagram](https://example.com/diagram.png)\n\n<div data-demo=\"true\">small HTML wrapper</div>\n\n```go\nsecretImplementation()\n```\n"

	got := SearchTextFromMarkdown(markdown)
	want := "Calm systems The recovery path is documented diagram small HTML wrapper"
	if got != want {
		t.Fatalf("SearchTextFromMarkdown() = %q, want %q", got, want)
	}
}

func TestSearchTextFromMarkdownNormalizesWhitespace(t *testing.T) {
	if got := SearchTextFromMarkdown("  alpha\n\n beta\t gamma "); got != "alpha beta gamma" {
		t.Fatalf("normalized text = %q", got)
	}
}
