package store

import (
	"context"
	"sort"
	"time"

	"github.com/bc-dev/bc-atlas-cms/server/internal/domain"
)

func (repository *MemoryRepository) ListKnowledgeBases(_ context.Context) ([]domain.KnowledgeBase, error) {
	repository.mu.RLock()
	defer repository.mu.RUnlock()
	items := append([]domain.KnowledgeBase(nil), repository.knowledgeBases...)
	sort.SliceStable(items, func(i, j int) bool { return items[i].Position < items[j].Position })
	return items, nil
}

func (repository *MemoryRepository) CreateKnowledgeBase(_ context.Context, input domain.KnowledgeBaseInput) (domain.KnowledgeBase, error) {
	if err := input.Validate(); err != nil {
		return domain.KnowledgeBase{}, err
	}
	repository.mu.Lock()
	defer repository.mu.Unlock()
	for _, item := range repository.knowledgeBases {
		if item.Slug == input.Slug {
			return domain.KnowledgeBase{}, ErrConflict
		}
	}
	id, err := domain.NewID()
	if err != nil {
		return domain.KnowledgeBase{}, err
	}
	now := time.Now().UTC()
	item := domain.KnowledgeBase{ID: id, Slug: input.Slug, Title: input.Title, Description: input.Description, CoverURL: input.CoverURL, Visibility: input.Visibility, Position: input.Position, CreatedAt: now, UpdatedAt: now}
	repository.knowledgeBases = append(repository.knowledgeBases, item)
	return item, nil
}

func (repository *MemoryRepository) ListKnowledgePages(_ context.Context, baseSlug string) ([]domain.KnowledgePage, error) {
	repository.mu.RLock()
	defer repository.mu.RUnlock()
	baseID := repository.knowledgeBaseID(baseSlug)
	if baseID == "" {
		return nil, ErrNotFound
	}
	items := make([]domain.KnowledgePage, 0)
	for _, item := range repository.knowledgePages {
		if item.KnowledgeBaseID == baseID {
			items = append(items, item)
		}
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].Position < items[j].Position })
	return items, nil
}

func (repository *MemoryRepository) FindKnowledgePage(_ context.Context, baseSlug, pageSlug string) (domain.KnowledgePage, error) {
	repository.mu.RLock()
	defer repository.mu.RUnlock()
	baseID := repository.knowledgeBaseID(baseSlug)
	for _, item := range repository.knowledgePages {
		if item.KnowledgeBaseID == baseID && item.Slug == pageSlug {
			return item, nil
		}
	}
	return domain.KnowledgePage{}, ErrNotFound
}

func (repository *MemoryRepository) CreateKnowledgePage(_ context.Context, baseSlug string, input domain.KnowledgePageInput) (domain.KnowledgePage, error) {
	if err := input.Validate(); err != nil {
		return domain.KnowledgePage{}, err
	}
	repository.mu.Lock()
	defer repository.mu.Unlock()
	baseID := repository.knowledgeBaseID(baseSlug)
	if baseID == "" {
		return domain.KnowledgePage{}, ErrNotFound
	}
	for _, item := range repository.knowledgePages {
		if item.KnowledgeBaseID == baseID && item.Slug == input.Slug {
			return domain.KnowledgePage{}, ErrConflict
		}
	}
	if input.ParentID != "" && !repository.knowledgeParentExists(baseID, input.ParentID) {
		return domain.KnowledgePage{}, ErrNotFound
	}
	id, err := domain.NewID()
	if err != nil {
		return domain.KnowledgePage{}, err
	}
	now := time.Now().UTC()
	item := domain.KnowledgePage{ID: id, KnowledgeBaseID: baseID, ParentID: input.ParentID, AuthorID: input.AuthorID, Slug: input.Slug, Title: input.Title, Summary: input.Summary, BodyMarkdown: input.BodyMarkdown, Position: input.Position, Status: input.Status, Visibility: input.Visibility, CreatedAt: now, UpdatedAt: now}
	repository.knowledgePages = append(repository.knowledgePages, item)
	return item, nil
}

func (repository *MemoryRepository) UpdateKnowledgePage(_ context.Context, baseSlug, pageSlug string, input domain.KnowledgePageInput) (domain.KnowledgePage, error) {
	if err := input.Validate(); err != nil {
		return domain.KnowledgePage{}, err
	}
	repository.mu.Lock()
	defer repository.mu.Unlock()
	baseID := repository.knowledgeBaseID(baseSlug)
	for index, item := range repository.knowledgePages {
		if item.KnowledgeBaseID != baseID || item.Slug != pageSlug {
			continue
		}
		if input.ParentID == item.ID || (input.ParentID != "" && !repository.knowledgeParentExists(baseID, input.ParentID)) {
			return domain.KnowledgePage{}, ErrConflict
		}
		item.ParentID = input.ParentID
		item.Slug = input.Slug
		item.Title = input.Title
		item.Summary = input.Summary
		item.BodyMarkdown = input.BodyMarkdown
		item.Position = input.Position
		item.Status = input.Status
		item.Visibility = input.Visibility
		item.UpdatedAt = time.Now().UTC()
		repository.knowledgePages[index] = item
		return item, nil
	}
	return domain.KnowledgePage{}, ErrNotFound
}

func (repository *MemoryRepository) DeleteKnowledgePage(_ context.Context, baseSlug, pageSlug string) error {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	baseID := repository.knowledgeBaseID(baseSlug)
	for index, item := range repository.knowledgePages {
		if item.KnowledgeBaseID == baseID && item.Slug == pageSlug {
			for _, child := range repository.knowledgePages {
				if child.ParentID == item.ID {
					return ErrConflict
				}
			}
			repository.knowledgePages = append(repository.knowledgePages[:index], repository.knowledgePages[index+1:]...)
			return nil
		}
	}
	return ErrNotFound
}

func (repository *MemoryRepository) knowledgeBaseID(slug string) string {
	for _, item := range repository.knowledgeBases {
		if item.Slug == slug {
			return item.ID
		}
	}
	return ""
}

func (repository *MemoryRepository) knowledgeParentExists(baseID, parentID string) bool {
	for _, item := range repository.knowledgePages {
		if item.KnowledgeBaseID == baseID && item.ID == parentID {
			return true
		}
	}
	return false
}
