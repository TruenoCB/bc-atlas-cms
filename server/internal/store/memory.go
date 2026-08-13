package store

import (
	"context"
	"strings"
	"sync"
	"time"

	"github.com/bc-dev/bc-atlas-cms/server/internal/domain"
)

type MemoryRepository struct {
	mu             sync.RWMutex
	contents       []domain.Content
	usersByID      map[string]domain.User
	userIDByMail   map[string]string
	sessions       map[string]domain.Session
	comments       []domain.Comment
	mediaObjects   []domain.MediaObject
	knowledgeBases []domain.KnowledgeBase
	knowledgePages []domain.KnowledgePage
}

func (repository *MemoryRepository) Health(context.Context) error {
	return nil
}

func (repository *MemoryRepository) CreateMediaObject(_ context.Context, object domain.MediaObject) error {
	repository.mu.Lock()
	repository.mediaObjects = append(repository.mediaObjects, object)
	repository.mu.Unlock()
	return nil
}

func NewMemoryRepository() *MemoryRepository {
	now := time.Now().UTC()
	calmEssayBody := "# Building calm systems in a noisy world\n\nReliable systems are less about removing every failure than making the next useful action obvious. A calm system can be under pressure without transferring that pressure to every person operating it.\n\n## Calm is an operational property\n\nCalmness does not mean silence. It means the system exposes enough state for a person to decide what to do next. Healthy paths, degraded paths, and recovery paths should be visible without reconstructing the entire architecture from logs.\n\nThe useful question is not whether a component can fail. It is whether that failure remains bounded, legible, and recoverable.\n\n## Design the recovery path first\n\nTeams often spend most of their design time on the successful request path. Production teaches the inverse lesson: recovery deserves the clearest interface.\n\n### Bound the failure domain\n\nPrefer small failure domains, explicit timeouts, idempotent retries, and state transitions that can be inspected. A dependency should not be able to consume unbounded time, memory, or attention.\n\n### Make the next action visible\n\nAn alert should carry a decision, not only a measurement. Connect the signal to the affected user path, the current owner, and the safest reversible action.\n\n## A working rule\n\nPrefer bounded complexity, visible recovery, and interfaces that respect attention.\n\n$$\\text{calm} = \\frac{\\text{clarity} \\times \\text{recovery}}{\\text{noise} + 1}$$\n\nThis is not a literal reliability equation. It is a reminder that more telemetry does not automatically produce more understanding. Clarity and recovery multiply each other; noise taxes both.\n\n## What to review before shipping\n\n1. Identify the smallest unit that can fail independently.\n2. Decide how operators will recognize the failure.\n3. Define one reversible recovery action.\n4. Record the event with stable identifiers.\n5. Test the degraded path before production traffic does.\n\nThe goal is not a system that never surprises you. The goal is a system whose surprises remain discussable."
	return &MemoryRepository{
		usersByID:    map[string]domain.User{},
		userIDByMail: map[string]string{},
		sessions:     map[string]domain.Session{},
		comments:     []domain.Comment{},
		knowledgeBases: []domain.KnowledgeBase{
			{ID: "kb-systems", Slug: "systems-field-manual", Title: "Systems Field Manual", Description: "Calm infrastructure, observability, and practical AI engineering.", CoverURL: "", Visibility: "public", Position: 10, CreatedAt: now, UpdatedAt: now},
			{ID: "kb-practice", Slug: "practice-notes", Title: "Practice Notes", Description: "Training systems, recovery, and deliberate repetition.", Visibility: "public", Position: 20, CreatedAt: now, UpdatedAt: now},
		},
		knowledgePages: []domain.KnowledgePage{
			{ID: "kp-systems-intro", KnowledgeBaseID: "kb-systems", Slug: "start-here", Title: "Start here", Summary: "How to use this field manual.", BodyMarkdown: "# Systems Field Manual\n\nA connected guide to building software that stays understandable under pressure.\n\n## How this guide is organized\n\nEach entry can have ordered child pages. Images use ordinary Markdown, videos use a linked media file, and small interactive demonstrations live in sandboxed HTML blocks.\n\n## A working principle\n\n$$\\text{operability} = \\frac{\\text{clarity} \\times \\text{recovery}}{\\text{hidden coupling} + 1}$$", Position: 10, Status: "published", Visibility: "public", CreatedAt: now, UpdatedAt: now},
			{ID: "kp-calm-root", KnowledgeBaseID: "kb-systems", Slug: "calm-systems", Title: "Calm systems", Summary: "A chapter about visible recovery paths.", BodyMarkdown: "# Calm systems\n\nCalmness is an operational property: the next useful action is visible.\n\n## Bound the failure\n\nPrefer small failure domains and explicit recovery paths.\n\n## Make state legible\n\nA dashboard is useful only when its state leads to a decision.", Position: 20, Status: "published", Visibility: "public", CreatedAt: now, UpdatedAt: now},
			{ID: "kp-observability", KnowledgeBaseID: "kb-systems", ParentID: "kp-calm-root", Slug: "observability", Title: "Observability", Summary: "Signals that support decisions.", BodyMarkdown: "# Observability\n\nCollect signals that answer a question, not signals that merely fill a chart.\n\n## Logs\n\nKeep events structured and attach stable identifiers.\n\n## Metrics\n\nMeasure work, saturation, errors, and latency before decorative totals.", Position: 10, Status: "published", Visibility: "public", CreatedAt: now, UpdatedAt: now},
			{ID: "kp-rag-root", KnowledgeBaseID: "kb-systems", Slug: "ai-retrieval", Title: "AI retrieval", Summary: "Notes on retrieval systems and evaluation.", BodyMarkdown: "# AI retrieval\n\nRetrieval quality depends on the document model before it depends on the vector store.\n\n## Keep source boundaries\n\nStore document and section identities with every chunk.\n\n## Evaluate the path\n\nMeasure retrieval coverage separately from answer quality.\n\n### Tiny interactive example\n\nThe block below runs in an isolated iframe with no access to the CMS session.\n\n```html-sandbox\n<button id=\"toggle\">Show retrieval note</button>\n<p id=\"note\" hidden>Keep the source document and section ID beside every chunk.</p>\n<script>\ndocument.querySelector('#toggle').onclick = () => { document.querySelector('#note').hidden = false; };\n</script>\n```", Position: 30, Status: "published", Visibility: "public", CreatedAt: now, UpdatedAt: now},
			{ID: "kp-practice-intro", KnowledgeBaseID: "kb-practice", Slug: "training-system", Title: "Training system", Summary: "A compact system for consistent practice.", BodyMarkdown: "# Training system\n\nSkill grows through repeatable sessions, honest feedback, and enough recovery to return.\n\n## Session shape\n\nWarm up, isolate one variable, apply it under pressure, and write the observation down.", Position: 10, Status: "published", Visibility: "public", CreatedAt: now, UpdatedAt: now},
		},
		contents: []domain.Content{
			{
				ID: "essay-calm-systems", Type: "article", Slug: "building-calm-systems",
				Title: "Building calm systems in a noisy world", Summary: "Notes on software, infrastructure, and deliberate practice.",
				BodyMarkdown: calmEssayBody,
				Status:       "published", Visibility: "public", PublishedAt: now.Add(-24 * time.Hour), CreatedAt: now, UpdatedAt: now,
				Tags: []domain.Tag{{Slug: "infrastructure", Name: "Infrastructure", Properties: map[string]any{}}, {Slug: "ai", Name: "AI", Properties: map[string]any{}}},
			},
			{
				ID: "essay-interface-boundaries", Type: "article", Slug: "interface-boundaries-in-production",
				Title: "Interface boundaries in production", Summary: "Why the seams between services deserve more design attention than their internals.",
				BodyMarkdown: "# Interface boundaries in production\n\nThe most expensive production failures often live between components.\n\n## Design the contract\n\nMake timeouts, ownership, versioning, and recovery behavior explicit.\n\n## Observe the seam\n\nMeasure handoffs, not only isolated components.",
				Status:       "published", Visibility: "public", PublishedAt: time.Date(2026, time.June, 14, 10, 0, 0, 0, time.UTC), CreatedAt: now, UpdatedAt: now,
				Tags: []domain.Tag{{Slug: "infrastructure", Name: "Infrastructure", Properties: map[string]any{}}, {Slug: "systems", Name: "Systems", Properties: map[string]any{}}},
			},
			{
				ID: "essay-retrieval-pipelines", Type: "article", Slug: "notes-on-retrieval-pipelines",
				Title: "Notes on retrieval pipelines", Summary: "Document boundaries, evaluation, and the work that matters before choosing a vector store.",
				BodyMarkdown: "# Notes on retrieval pipelines\n\nRetrieval quality begins with a legible document model.\n\n## Preserve source structure\n\nKeep document and section identities beside every chunk.\n\n## Evaluate separately\n\nMeasure retrieval coverage before judging answer quality.",
				Status:       "published", Visibility: "public", PublishedAt: time.Date(2025, time.November, 22, 8, 30, 0, 0, time.UTC), CreatedAt: now, UpdatedAt: now,
				Tags: []domain.Tag{{Slug: "ai", Name: "AI", Properties: map[string]any{}}, {Slug: "retrieval", Name: "Retrieval", Properties: map[string]any{}}},
			},
			{
				ID: "essay-debug-before-optimize", Type: "article", Slug: "debug-before-you-optimize",
				Title: "Debug before you optimize", Summary: "A small field guide for separating evidence, hypotheses, and performance work.",
				BodyMarkdown: "# Debug before you optimize\n\nOptimization without a model is only movement.\n\n## Build the timeline\n\nPut events in order before assigning causes.\n\n## Change one variable\n\nMake the smallest reversible experiment that can disprove the current hypothesis.",
				Status:       "published", Visibility: "public", PublishedAt: time.Date(2025, time.August, 8, 12, 0, 0, 0, time.UTC), CreatedAt: now, UpdatedAt: now,
				Tags: []domain.Tag{{Slug: "systems", Name: "Systems", Properties: map[string]any{}}, {Slug: "practice", Name: "Practice", Properties: map[string]any{}}},
			},
			{
				ID: "thought-visible-complexity", Type: "thought", Slug: "make-complexity-visible",
				Title: "Make complexity visible before making it clever", Summary: "A short note about observability as a design property.",
				BodyMarkdown: "Complexity that can be seen can be discussed, measured, and reduced. Cleverness that hides the system only compounds the cost of change.",
				Status:       "published", Visibility: "public", PublishedAt: now.Add(-36 * time.Hour), CreatedAt: now, UpdatedAt: now,
				Tags: []domain.Tag{{Slug: "systems", Name: "Systems", Properties: map[string]any{}}},
			},
			{
				ID: "gallery-road-work", Type: "gallery", Slug: "roads-between-rounds",
				Title: "Roads between rounds", Summary: "A media collection about training rooms, night roads, and the distance between familiar places.",
				BodyMarkdown: "# Roads between rounds\n\nThis gallery is ready for photographs and video uploaded to the S3 media library. Media references stay attached to a normal content entry through typed tag properties.",
				Status:       "published", Visibility: "public", PublishedAt: now.Add(-72 * time.Hour), CreatedAt: now, UpdatedAt: now,
				Tags: []domain.Tag{{Slug: "media", Name: "Media", Properties: map[string]any{"kind": "mixed", "item_count": 0}}, {Slug: "boxing", Name: "Boxing", Properties: map[string]any{}}},
			},
			{
				ID: "footprint-tokyo", Type: "article", Slug: "field-note-tokyo",
				Title:        "Interfaces for a moving city",
				Summary:      "A field note on public systems, rhythm, and the small details that keep a city legible.",
				BodyMarkdown: "# Interfaces for a moving city\n\nTokyo rewards attention. Complexity can remain calm when paths, signals, and recovery are designed together.",
				Status:       "published", Visibility: "public", PublishedAt: now.Add(-48 * time.Hour), CreatedAt: now, UpdatedAt: now,
				Tags: []domain.Tag{{Slug: "footprint", Name: "Footprint", Properties: map[string]any{"latitude": 35.6762, "longitude": 139.6503, "location_name": "Tokyo"}}, {Slug: "systems", Name: "Systems", Properties: map[string]any{}}},
			},
			{
				ID: "footprint-paris", Type: "article", Slug: "field-note-paris",
				Title:        "A city built for long questions",
				Summary:      "Notes from Paris on research, distance, and choosing a direction without rushing the answer.",
				BodyMarkdown: "# A city built for long questions\n\nSome places make unfinished thoughts feel welcome.\n\n$$\\text{direction} = \\frac{\\text{curiosity} \\times \\text{practice}}{\\text{noise} + 1}$$",
				Status:       "published", Visibility: "members", PublishedAt: now.Add(-96 * time.Hour), CreatedAt: now, UpdatedAt: now,
				Tags: []domain.Tag{{Slug: "footprint", Name: "Footprint", Properties: map[string]any{"latitude": 48.8566, "longitude": 2.3522, "location_name": "Paris"}}, {Slug: "research", Name: "Research", Properties: map[string]any{}}},
			},
		},
	}
}

func (repository *MemoryRepository) ListContents(_ context.Context, filter domain.ContentFilter) ([]domain.Content, error) {
	repository.mu.RLock()
	defer repository.mu.RUnlock()
	items := make([]domain.Content, 0, len(repository.contents))
	for _, content := range repository.contents {
		if filter.Type != "" && content.Type != filter.Type {
			continue
		}
		if filter.Status != "" && content.Status != filter.Status {
			continue
		}
		if query := strings.ToLower(strings.TrimSpace(filter.Query)); query != "" {
			searchable := strings.ToLower(content.Title + " " + content.Summary + " " + content.BodyMarkdown)
			for _, tag := range content.Tags {
				searchable += " " + strings.ToLower(tag.Slug+" "+tag.Name)
			}
			if !strings.Contains(searchable, query) {
				continue
			}
		}
		if filter.Tag != "" {
			matched := false
			for _, tag := range content.Tags {
				if tag.Slug == filter.Tag {
					matched = true
					break
				}
			}
			if !matched {
				continue
			}
		}
		items = append(items, content)
	}
	SortContentsByPublished(items)
	return items, nil
}

func (repository *MemoryRepository) ListFootprints(_ context.Context) ([]domain.Content, error) {
	repository.mu.RLock()
	defer repository.mu.RUnlock()
	result := make([]domain.Content, 0, len(repository.contents))
	for _, content := range repository.contents {
		for _, tag := range content.Tags {
			if tag.Slug == "footprint" {
				result = append(result, content)
				break
			}
		}
	}
	return result, nil
}

func (repository *MemoryRepository) CreateContent(_ context.Context, input domain.ContentInput) (domain.Content, error) {
	if err := input.Validate(); err != nil {
		return domain.Content{}, err
	}
	id, err := domain.NewID()
	if err != nil {
		return domain.Content{}, err
	}
	now := time.Now().UTC()
	content := domain.Content{
		ID: id, AuthorID: input.AuthorID, Type: input.Type, Slug: input.Slug, Title: input.Title, Summary: input.Summary,
		BodyMarkdown: input.BodyMarkdown, Status: input.Status, Visibility: input.Visibility,
		PublishedAt: now, CreatedAt: now, UpdatedAt: now, Tags: input.Tags,
	}
	repository.mu.Lock()
	repository.contents = append([]domain.Content{content}, repository.contents...)
	repository.mu.Unlock()
	return content, nil
}

func (repository *MemoryRepository) UpdateContent(_ context.Context, slug string, input domain.ContentInput) (domain.Content, error) {
	if err := input.Validate(); err != nil {
		return domain.Content{}, err
	}
	repository.mu.Lock()
	defer repository.mu.Unlock()
	for index, content := range repository.contents {
		if content.Slug != slug {
			continue
		}
		content.Type = input.Type
		content.Slug = input.Slug
		content.Title = input.Title
		content.Summary = input.Summary
		content.BodyMarkdown = input.BodyMarkdown
		if input.Status == "published" && content.Status != "published" {
			content.PublishedAt = time.Now().UTC()
		}
		content.Status = input.Status
		content.Visibility = input.Visibility
		content.Tags = input.Tags
		content.UpdatedAt = time.Now().UTC()
		repository.contents[index] = content
		return content, nil
	}
	return domain.Content{}, ErrNotFound
}

func (repository *MemoryRepository) DeleteContent(_ context.Context, slug string) error {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	for index, content := range repository.contents {
		if content.Slug == slug {
			repository.contents = append(repository.contents[:index], repository.contents[index+1:]...)
			return nil
		}
	}
	return ErrNotFound
}

func (repository *MemoryRepository) FindBySlug(_ context.Context, slug string) (domain.Content, error) {
	repository.mu.RLock()
	defer repository.mu.RUnlock()
	for _, content := range repository.contents {
		if content.Slug == slug {
			return content, nil
		}
	}
	return domain.Content{}, ErrNotFound
}

func (repository *MemoryRepository) CreateComment(_ context.Context, contentSlug, userID, authorDisplayName, body string) (domain.Comment, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	var contentID string
	for _, content := range repository.contents {
		if content.Slug == contentSlug {
			contentID = content.ID
			break
		}
	}
	if contentID == "" {
		return domain.Comment{}, ErrNotFound
	}
	displayName := strings.TrimSpace(authorDisplayName)
	if userID != "" {
		user, exists := repository.usersByID[userID]
		if !exists {
			return domain.Comment{}, ErrNotFound
		}
		displayName = user.DisplayName
	}
	id, err := domain.NewID()
	if err != nil {
		return domain.Comment{}, err
	}
	now := time.Now().UTC()
	comment := domain.Comment{ID: id, ContentID: contentID, UserID: userID, AuthorDisplayName: displayName, Body: strings.TrimSpace(body), Status: "published", CreatedAt: now, UpdatedAt: now}
	repository.comments = append(repository.comments, comment)
	return comment, nil
}

func (repository *MemoryRepository) ListComments(_ context.Context, contentSlug string) ([]domain.Comment, error) {
	repository.mu.RLock()
	defer repository.mu.RUnlock()
	var contentID string
	for _, content := range repository.contents {
		if content.Slug == contentSlug {
			contentID = content.ID
			break
		}
	}
	if contentID == "" {
		return nil, ErrNotFound
	}
	comments := make([]domain.Comment, 0)
	for _, comment := range repository.comments {
		if comment.ContentID == contentID && comment.Status == "published" {
			comments = append(comments, comment)
		}
	}
	return comments, nil
}

func (repository *MemoryRepository) CreateUser(_ context.Context, input domain.UserInput) (domain.User, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	email := strings.ToLower(strings.TrimSpace(input.Email))
	if _, exists := repository.userIDByMail[email]; exists {
		return domain.User{}, ErrConflict
	}
	id, err := domain.NewID()
	if err != nil {
		return domain.User{}, err
	}
	now := time.Now().UTC()
	user := domain.User{
		ID: id, Email: email, DisplayName: strings.TrimSpace(input.DisplayName), Role: input.Role,
		PasswordHash: append([]byte(nil), input.PasswordHash...), CreatedAt: now, UpdatedAt: now,
	}
	repository.usersByID[id] = user
	repository.userIDByMail[email] = id
	return user, nil
}

func (repository *MemoryRepository) EnsureAdmin(ctx context.Context, input domain.UserInput) (domain.User, error) {
	email := strings.ToLower(strings.TrimSpace(input.Email))
	repository.mu.Lock()
	if id, exists := repository.userIDByMail[email]; exists {
		user := repository.usersByID[id]
		user.Role = domain.RoleAdmin
		user.DisplayName = strings.TrimSpace(input.DisplayName)
		user.PasswordHash = append([]byte(nil), input.PasswordHash...)
		user.UpdatedAt = time.Now().UTC()
		repository.usersByID[id] = user
		repository.mu.Unlock()
		return user, nil
	}
	repository.mu.Unlock()
	input.Role = domain.RoleAdmin
	return repository.CreateUser(ctx, input)
}

func (repository *MemoryRepository) FindUserByEmail(_ context.Context, email string) (domain.User, error) {
	repository.mu.RLock()
	defer repository.mu.RUnlock()
	id, exists := repository.userIDByMail[strings.ToLower(strings.TrimSpace(email))]
	if !exists {
		return domain.User{}, ErrNotFound
	}
	return repository.usersByID[id], nil
}

func (repository *MemoryRepository) CreateSession(_ context.Context, session domain.Session) error {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	if _, exists := repository.usersByID[session.UserID]; !exists {
		return ErrNotFound
	}
	repository.sessions[session.TokenHash] = session
	return nil
}

func (repository *MemoryRepository) FindUserBySessionHash(_ context.Context, tokenHash string, now time.Time) (domain.User, error) {
	repository.mu.RLock()
	defer repository.mu.RUnlock()
	session, exists := repository.sessions[tokenHash]
	if !exists || !session.ExpiresAt.After(now) {
		return domain.User{}, ErrNotFound
	}
	user, exists := repository.usersByID[session.UserID]
	if !exists {
		return domain.User{}, ErrNotFound
	}
	return user, nil
}

func (repository *MemoryRepository) DeleteSession(_ context.Context, tokenHash string) error {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	delete(repository.sessions, tokenHash)
	return nil
}
