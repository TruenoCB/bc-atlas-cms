package domain

import (
	"errors"
	"strings"
	"time"
)

type KnowledgeBase struct {
	ID          string    `json:"id"`
	Slug        string    `json:"slug"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	CoverURL    string    `json:"coverUrl,omitempty"`
	Visibility  string    `json:"visibility"`
	Position    int       `json:"position"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type KnowledgeBaseInput struct {
	Slug        string `json:"slug"`
	Title       string `json:"title"`
	Description string `json:"description"`
	CoverURL    string `json:"coverUrl"`
	Visibility  string `json:"visibility"`
	Position    int    `json:"position"`
}

func (input *KnowledgeBaseInput) Validate() error {
	input.Slug = strings.TrimSpace(input.Slug)
	input.Title = strings.TrimSpace(input.Title)
	input.Description = strings.TrimSpace(input.Description)
	input.CoverURL = strings.TrimSpace(input.CoverURL)
	if input.Slug == "" || input.Title == "" {
		return errors.New("knowledge base slug and title are required")
	}
	if input.Visibility == "" {
		input.Visibility = "public"
	}
	if input.Visibility != "public" && input.Visibility != "members" && input.Visibility != "private" {
		return errors.New("visibility must be public, members, or private")
	}
	return nil
}

type KnowledgePage struct {
	ID              string    `json:"id"`
	KnowledgeBaseID string    `json:"knowledgeBaseId"`
	ParentID        string    `json:"parentId,omitempty"`
	AuthorID        string    `json:"authorId,omitempty"`
	Slug            string    `json:"slug"`
	Title           string    `json:"title"`
	Summary         string    `json:"summary"`
	BodyMarkdown    string    `json:"bodyMarkdown"`
	Position        int       `json:"position"`
	Status          string    `json:"status"`
	Visibility      string    `json:"visibility"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
	Locked          bool      `json:"locked,omitempty"`
}

type KnowledgePageInput struct {
	ParentID     string `json:"parentId"`
	AuthorID     string `json:"-"`
	Slug         string `json:"slug"`
	Title        string `json:"title"`
	Summary      string `json:"summary"`
	BodyMarkdown string `json:"bodyMarkdown"`
	Position     int    `json:"position"`
	Status       string `json:"status"`
	Visibility   string `json:"visibility"`
}

func (input *KnowledgePageInput) Validate() error {
	input.ParentID = strings.TrimSpace(input.ParentID)
	input.Slug = strings.TrimSpace(input.Slug)
	input.Title = strings.TrimSpace(input.Title)
	input.Summary = strings.TrimSpace(input.Summary)
	if input.Slug == "" || input.Title == "" {
		return errors.New("knowledge page slug and title are required")
	}
	if input.Status == "" {
		input.Status = "published"
	}
	if input.Status != "draft" && input.Status != "published" && input.Status != "archived" {
		return errors.New("status must be draft, published, or archived")
	}
	if input.Visibility == "" {
		input.Visibility = "public"
	}
	if input.Visibility != "public" && input.Visibility != "members" && input.Visibility != "private" {
		return errors.New("visibility must be public, members, or private")
	}
	return nil
}
