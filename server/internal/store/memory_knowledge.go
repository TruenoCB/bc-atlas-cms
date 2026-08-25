package store

import (
	"context"
	"sort"
	"time"

	"github.com/bc-dev/bc-atlas-cms/server/internal/domain"
)

// The in-memory repository mirrors the production model: typed content is the
// source of truth, with small type-specific maps representing catalogue and
// tree extension tables.
func (repository *MemoryRepository) ListKnowledgeBases(_ context.Context) ([]domain.KnowledgeBase, error) {
	repository.mu.RLock()
	defer repository.mu.RUnlock()
	items := make([]domain.KnowledgeBase, 0)
	for _, content := range repository.contents {
		if content.Type != "knowledge_base" {
			continue
		}
		detail, ok := repository.knowledgeBaseDetails[content.ID]
		if !ok {
			continue
		}
		items = append(items, memoryKnowledgeBase(content, detail))
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].Position < items[j].Position })
	return items, nil
}

func (repository *MemoryRepository) FindKnowledgeBase(_ context.Context, slug string) (domain.KnowledgeBase, error) {
	repository.mu.RLock()
	defer repository.mu.RUnlock()
	return repository.findKnowledgeBaseLocked(slug)
}

func (repository *MemoryRepository) CreateKnowledgeBase(_ context.Context, input domain.KnowledgeBaseInput) (domain.KnowledgeBase, error) {
	if err := input.Validate(); err != nil {
		return domain.KnowledgeBase{}, err
	}
	repository.mu.Lock()
	defer repository.mu.Unlock()
	if _, err := repository.findKnowledgeBaseLocked(input.Slug); err == nil {
		return domain.KnowledgeBase{}, ErrConflict
	}
	id, err := domain.NewID()
	if err != nil {
		return domain.KnowledgeBase{}, err
	}
	now := time.Now().UTC()
	content := domain.Content{ID: id, AuthorID: input.AuthorID, Type: "knowledge_base", Slug: knowledgeInternalSlug("base", id), Title: input.Title, Summary: input.Description, Status: "published", Visibility: input.Visibility, PublishedAt: now, CreatedAt: now, UpdatedAt: now}
	detail := memoryKnowledgeBaseDetail{RouteSlug: input.Slug, CoverURL: input.CoverURL, Position: input.Position}
	repository.contents = append(repository.contents, content)
	repository.knowledgeBaseDetails[id] = detail
	return memoryKnowledgeBase(content, detail), nil
}

func (repository *MemoryRepository) UpdateKnowledgeBase(_ context.Context, slug string, input domain.KnowledgeBaseInput) (domain.KnowledgeBase, error) {
	if err := input.Validate(); err != nil {
		return domain.KnowledgeBase{}, err
	}
	repository.mu.Lock()
	defer repository.mu.Unlock()
	base, err := repository.findKnowledgeBaseLocked(slug)
	if err != nil {
		return domain.KnowledgeBase{}, err
	}
	if other, err := repository.findKnowledgeBaseLocked(input.Slug); err == nil && other.ID != base.ID {
		return domain.KnowledgeBase{}, ErrConflict
	}
	for index := range repository.contents {
		if repository.contents[index].ID != base.ID {
			continue
		}
		content := repository.contents[index]
		content.Title, content.Summary, content.Visibility, content.UpdatedAt = input.Title, input.Description, input.Visibility, time.Now().UTC()
		repository.contents[index] = content
		break
	}
	detail := repository.knowledgeBaseDetails[base.ID]
	detail.RouteSlug, detail.CoverURL, detail.Position = input.Slug, input.CoverURL, input.Position
	repository.knowledgeBaseDetails[base.ID] = detail
	updated, _ := repository.findKnowledgeBaseLocked(input.Slug)
	return updated, nil
}

func (repository *MemoryRepository) DeleteKnowledgeBase(_ context.Context, slug string) error {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	base, err := repository.findKnowledgeBaseLocked(slug)
	if err != nil {
		return err
	}
	removed := map[string]bool{base.ID: true}
	for pageID, node := range repository.knowledgeStructure {
		if node.KnowledgeBaseID == base.ID {
			removed[pageID] = true
			delete(repository.knowledgeStructure, pageID)
		}
	}
	delete(repository.knowledgeBaseDetails, base.ID)
	items := repository.contents[:0]
	for _, content := range repository.contents {
		if !removed[content.ID] {
			items = append(items, content)
		}
	}
	repository.contents = items
	return nil
}

func (repository *MemoryRepository) ListKnowledgePages(_ context.Context, baseSlug string) ([]domain.KnowledgePage, error) {
	repository.mu.RLock()
	defer repository.mu.RUnlock()
	base, err := repository.findKnowledgeBaseLocked(baseSlug)
	if err != nil {
		return nil, err
	}
	items := make([]domain.KnowledgePage, 0)
	for _, content := range repository.contents {
		node, ok := repository.knowledgeStructure[content.ID]
		if !ok || node.KnowledgeBaseID != base.ID || content.Type != "knowledge_page" {
			continue
		}
		items = append(items, memoryKnowledgePage(content, node))
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].Position < items[j].Position })
	return items, nil
}

func (repository *MemoryRepository) FindKnowledgePage(_ context.Context, baseSlug, pageSlug string) (domain.KnowledgePage, error) {
	repository.mu.RLock()
	defer repository.mu.RUnlock()
	return repository.findKnowledgePageLocked(baseSlug, pageSlug)
}

func (repository *MemoryRepository) CreateKnowledgePage(_ context.Context, baseSlug string, input domain.KnowledgePageInput) (domain.KnowledgePage, error) {
	if err := input.Validate(); err != nil {
		return domain.KnowledgePage{}, err
	}
	repository.mu.Lock()
	defer repository.mu.Unlock()
	base, err := repository.findKnowledgeBaseLocked(baseSlug)
	if err != nil {
		return domain.KnowledgePage{}, err
	}
	if _, err := repository.findKnowledgePageLocked(baseSlug, input.Slug); err == nil {
		return domain.KnowledgePage{}, ErrConflict
	}
	if input.ParentID != "" && !repository.knowledgeParentExistsLocked(base.ID, input.ParentID) {
		return domain.KnowledgePage{}, ErrNotFound
	}
	id := input.ID
	if id == "" {
		id, err = domain.NewID()
		if err != nil {
			return domain.KnowledgePage{}, err
		}
	}
	now := time.Now().UTC()
	content := domain.Content{ID: id, AuthorID: input.AuthorID, Type: "knowledge_page", Slug: knowledgeInternalSlug("page", id), Title: input.Title, Summary: input.Summary, BodyMarkdown: input.BodyMarkdown, BodyObjectKey: input.BodyObjectKey, BodyRevision: input.BodyRevision, BodyHash: input.BodyHash, BodySize: input.BodySize, Status: input.Status, Visibility: input.Visibility, PublishedAt: now, CreatedAt: now, UpdatedAt: now}
	node := memoryKnowledgeNode{KnowledgeBaseID: base.ID, ParentID: input.ParentID, RouteSlug: input.Slug, Position: input.Position}
	repository.contents = append(repository.contents, content)
	repository.knowledgeStructure[id] = node
	return memoryKnowledgePage(content, node), nil
}

func (repository *MemoryRepository) UpdateKnowledgePage(_ context.Context, baseSlug, pageSlug string, input domain.KnowledgePageInput) (domain.KnowledgePage, error) {
	if err := input.Validate(); err != nil {
		return domain.KnowledgePage{}, err
	}
	repository.mu.Lock()
	defer repository.mu.Unlock()
	current, err := repository.findKnowledgePageLocked(baseSlug, pageSlug)
	if err != nil {
		return domain.KnowledgePage{}, err
	}
	if input.ParentID == current.ID || (input.ParentID != "" && !repository.knowledgeParentExistsLocked(current.KnowledgeBaseID, input.ParentID)) {
		return domain.KnowledgePage{}, ErrConflict
	}
	if other, err := repository.findKnowledgePageLocked(baseSlug, input.Slug); err == nil && other.ID != current.ID {
		return domain.KnowledgePage{}, ErrConflict
	}
	for index := range repository.contents {
		if repository.contents[index].ID != current.ID {
			continue
		}
		content := repository.contents[index]
		content.Title, content.Summary, content.BodyMarkdown = input.Title, input.Summary, input.BodyMarkdown
		content.BodyObjectKey, content.BodyRevision, content.BodyHash, content.BodySize = input.BodyObjectKey, input.BodyRevision, input.BodyHash, input.BodySize
		content.Status, content.Visibility, content.UpdatedAt = input.Status, input.Visibility, time.Now().UTC()
		repository.contents[index] = content
		break
	}
	node := repository.knowledgeStructure[current.ID]
	node.ParentID, node.RouteSlug, node.Position = input.ParentID, input.Slug, input.Position
	repository.knowledgeStructure[current.ID] = node
	updated, _ := repository.findKnowledgePageLocked(baseSlug, input.Slug)
	return updated, nil
}

func (repository *MemoryRepository) DeleteKnowledgePage(_ context.Context, baseSlug, pageSlug string) error {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	current, err := repository.findKnowledgePageLocked(baseSlug, pageSlug)
	if err != nil {
		return err
	}
	for _, node := range repository.knowledgeStructure {
		if node.ParentID == current.ID {
			return ErrConflict
		}
	}
	delete(repository.knowledgeStructure, current.ID)
	for index, content := range repository.contents {
		if content.ID == current.ID {
			repository.contents = append(repository.contents[:index], repository.contents[index+1:]...)
			return nil
		}
	}
	return ErrNotFound
}

func (repository *MemoryRepository) findKnowledgeBaseLocked(slug string) (domain.KnowledgeBase, error) {
	for _, content := range repository.contents {
		detail, ok := repository.knowledgeBaseDetails[content.ID]
		if ok && content.Type == "knowledge_base" && detail.RouteSlug == slug {
			return memoryKnowledgeBase(content, detail), nil
		}
	}
	return domain.KnowledgeBase{}, ErrNotFound
}

func (repository *MemoryRepository) findKnowledgePageLocked(baseSlug, pageSlug string) (domain.KnowledgePage, error) {
	base, err := repository.findKnowledgeBaseLocked(baseSlug)
	if err != nil {
		return domain.KnowledgePage{}, err
	}
	for _, content := range repository.contents {
		node, ok := repository.knowledgeStructure[content.ID]
		if ok && content.Type == "knowledge_page" && node.KnowledgeBaseID == base.ID && node.RouteSlug == pageSlug {
			return memoryKnowledgePage(content, node), nil
		}
	}
	return domain.KnowledgePage{}, ErrNotFound
}

func (repository *MemoryRepository) knowledgeParentExistsLocked(baseID, parentID string) bool {
	node, ok := repository.knowledgeStructure[parentID]
	return ok && node.KnowledgeBaseID == baseID
}

func memoryKnowledgeBase(content domain.Content, detail memoryKnowledgeBaseDetail) domain.KnowledgeBase {
	return domain.KnowledgeBase{ID: content.ID, AuthorID: content.AuthorID, Slug: detail.RouteSlug, Title: content.Title, Description: content.Summary, CoverURL: detail.CoverURL, Visibility: content.Visibility, Position: detail.Position, CreatedAt: content.CreatedAt, UpdatedAt: content.UpdatedAt}
}

func memoryKnowledgePage(content domain.Content, node memoryKnowledgeNode) domain.KnowledgePage {
	return domain.KnowledgePage{ID: content.ID, KnowledgeBaseID: node.KnowledgeBaseID, ParentID: node.ParentID, AuthorID: content.AuthorID, Slug: node.RouteSlug, Title: content.Title, Summary: content.Summary, BodyMarkdown: content.BodyMarkdown, BodyObjectKey: content.BodyObjectKey, BodyRevision: content.BodyRevision, BodyHash: content.BodyHash, BodySize: content.BodySize, Position: node.Position, Status: content.Status, Visibility: content.Visibility, CreatedAt: content.CreatedAt, UpdatedAt: content.UpdatedAt}
}
