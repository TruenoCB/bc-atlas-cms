package domain

import (
	"regexp"
	"strings"
)

var (
	markdownFencePattern = regexp.MustCompile("(?s)```.*?```")
	markdownImagePattern = regexp.MustCompile(`!\[([^]]*)\]\([^)]*\)`)
	markdownLinkPattern  = regexp.MustCompile(`\[([^]]+)\]\([^)]*\)`)
	htmlTagPattern       = regexp.MustCompile(`(?s)<[^>]+>`)
)

// SearchTextFromMarkdown produces a compact, non-rendered projection for
// keyword search. The original Markdown remains the canonical document.
func SearchTextFromMarkdown(markdown string) string {
	text := markdownFencePattern.ReplaceAllString(markdown, " ")
	text = markdownImagePattern.ReplaceAllString(text, " $1 ")
	text = markdownLinkPattern.ReplaceAllString(text, " $1 ")
	text = htmlTagPattern.ReplaceAllString(text, " ")
	text = strings.NewReplacer(
		"#", " ", "*", " ", "_", " ", "~", " ", "`", " ", ">", " ",
		".", " ", ",", " ", ":", " ", ";", " ", "!", " ", "?", " ",
		"(", " ", ")", " ", "{", " ", "}", " ", "[", " ", "]", " ", "|", " ",
		"- ", " ", "+ ", " ",
	).Replace(text)
	return strings.Join(strings.Fields(text), " ")
}
