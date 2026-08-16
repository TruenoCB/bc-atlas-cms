package domain

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

type PropertyType string

const (
	PropertyString  PropertyType = "string"
	PropertyNumber  PropertyType = "number"
	PropertyBoolean PropertyType = "boolean"
	PropertyJSON    PropertyType = "json"
)

type Tag struct {
	Slug       string         `json:"slug"`
	Name       string         `json:"name"`
	Properties map[string]any `json:"properties"`
}

type Content struct {
	ID           string    `json:"id"`
	AuthorID     string    `json:"authorId,omitempty"`
	Type         string    `json:"type"`
	Slug         string    `json:"slug"`
	Title        string    `json:"title"`
	Summary      string    `json:"summary"`
	BodyMarkdown string    `json:"bodyMarkdown"`
	Status       string    `json:"status"`
	Visibility   string    `json:"visibility"`
	PublishedAt  time.Time `json:"publishedAt"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
	Tags         []Tag     `json:"tags"`
	Locked       bool      `json:"locked,omitempty"`
	// Body storage metadata is intentionally hidden from the public API response.
	BodyObjectKey string `json:"-"`
	BodyRevision  int    `json:"-"`
	BodyHash      string `json:"-"`
	BodySize      int64  `json:"-"`
}

type ContentInput struct {
	ID            string `json:"-"`
	AuthorID      string `json:"-"`
	Type          string `json:"type"`
	Slug          string `json:"slug"`
	Title         string `json:"title"`
	Summary       string `json:"summary"`
	BodyMarkdown  string `json:"bodyMarkdown"`
	Status        string `json:"status"`
	Visibility    string `json:"visibility"`
	Tags          []Tag  `json:"tags"`
	BodyObjectKey string `json:"-"`
	BodyRevision  int    `json:"-"`
	BodyHash      string `json:"-"`
	BodySize      int64  `json:"-"`
	SearchText    string `json:"-"`
}

type ContentFilter struct {
	Type   string
	Tag    string
	Status string
	Query  string
}

type Comment struct {
	ID                string    `json:"id"`
	ContentID         string    `json:"contentId"`
	UserID            string    `json:"userId,omitempty"`
	AuthorDisplayName string    `json:"authorDisplayName"`
	Body              string    `json:"body"`
	Status            string    `json:"status"`
	CreatedAt         time.Time `json:"createdAt"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

type MediaObject struct {
	ID           string    `json:"id"`
	ObjectKey    string    `json:"objectKey"`
	BucketName   string    `json:"bucketName"`
	OriginalName string    `json:"originalName"`
	ContentType  string    `json:"contentType"`
	SizeBytes    int64     `json:"sizeBytes"`
	CreatedAt    time.Time `json:"createdAt"`
}

type PropertyDefinition struct {
	Key      string       `json:"key"`
	Type     PropertyType `json:"type"`
	Required bool         `json:"required"`
}

type TagSchema struct {
	Slug       string               `json:"slug"`
	Name       string               `json:"name"`
	Properties []PropertyDefinition `json:"properties"`
}

var FootprintSchema = TagSchema{
	Slug: "footprint",
	Name: "Footprint",
	Properties: []PropertyDefinition{
		{Key: "latitude", Type: PropertyNumber, Required: true},
		{Key: "longitude", Type: PropertyNumber, Required: true},
		{Key: "location_name", Type: PropertyString, Required: true},
	},
}

func NewID() (string, error) {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", err
	}
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	raw := hex.EncodeToString(bytes[:])
	return fmt.Sprintf("%s-%s-%s-%s-%s", raw[0:8], raw[8:12], raw[12:16], raw[16:20], raw[20:32]), nil
}

func (input *ContentInput) Validate() error {
	if strings.TrimSpace(input.Title) == "" {
		return errors.New("title is required")
	}
	if strings.TrimSpace(input.Slug) == "" {
		return errors.New("slug is required")
	}
	if input.Type == "" {
		input.Type = "article"
	}
	switch input.Type {
	case "article", "thought", "gallery", "video", "page":
	default:
		return errors.New("type must be article, thought, gallery, video, or page")
	}
	if input.Status == "" {
		input.Status = "published"
	}
	if input.Status != "draft" && input.Status != "published" && input.Status != "archived" {
		return errors.New("status must be draft, published, or archived")
	}
	if input.Visibility != "public" && input.Visibility != "members" && input.Visibility != "private" {
		return errors.New("visibility must be public, members, or private")
	}

	for _, tag := range input.Tags {
		if tag.Slug != "footprint" {
			continue
		}
		latitude, latitudeOK := number(tag.Properties["latitude"])
		longitude, longitudeOK := number(tag.Properties["longitude"])
		location, locationOK := tag.Properties["location_name"].(string)
		if !latitudeOK || latitude < -90 || latitude > 90 {
			return errors.New("footprint latitude must be between -90 and 90")
		}
		if !longitudeOK || longitude < -180 || longitude > 180 {
			return errors.New("footprint longitude must be between -180 and 180")
		}
		if !locationOK || strings.TrimSpace(location) == "" {
			return errors.New("footprint location_name is required")
		}
	}
	return nil
}

func number(value any) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	case int:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case json.Number:
		parsed, err := typed.Float64()
		return parsed, err == nil
	default:
		return 0, false
	}
}
