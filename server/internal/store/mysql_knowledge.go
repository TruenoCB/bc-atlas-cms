package store

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/bc-dev/bc-atlas-cms/server/internal/domain"
)

const knowledgePageColumns = `p.id, p.knowledge_base_id, p.parent_id, p.author_id, p.slug, p.title,
  p.summary, p.body_markdown, p.body_object_key, p.body_revision, p.body_hash, p.body_size,
  p.position, p.status, p.visibility, p.created_at, p.updated_at`

func (repository *MySQLRepository) ListKnowledgeBases(ctx context.Context) ([]domain.KnowledgeBase, error) {
	rows, err := repository.db.QueryContext(ctx, `SELECT id, slug, title, description, cover_url, visibility, position, created_at, updated_at
      FROM knowledge_bases ORDER BY position, title`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]domain.KnowledgeBase, 0)
	for rows.Next() {
		var item domain.KnowledgeBase
		if err := rows.Scan(&item.ID, &item.Slug, &item.Title, &item.Description, &item.CoverURL, &item.Visibility, &item.Position, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (repository *MySQLRepository) CreateKnowledgeBase(ctx context.Context, input domain.KnowledgeBaseInput) (domain.KnowledgeBase, error) {
	if err := input.Validate(); err != nil {
		return domain.KnowledgeBase{}, err
	}
	id, err := domain.NewID()
	if err != nil {
		return domain.KnowledgeBase{}, err
	}
	now := time.Now().UTC()
	_, err = repository.db.ExecContext(ctx, `INSERT INTO knowledge_bases
		(id, slug, title, description, cover_url, visibility, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, input.Slug, input.Title, input.Description, input.CoverURL, input.Visibility, input.Position, now, now)
	if err != nil {
		return domain.KnowledgeBase{}, err
	}
	return domain.KnowledgeBase{ID: id, Slug: input.Slug, Title: input.Title, Description: input.Description, CoverURL: input.CoverURL, Visibility: input.Visibility, Position: input.Position, CreatedAt: now, UpdatedAt: now}, nil
}

func (repository *MySQLRepository) ListKnowledgePages(ctx context.Context, baseSlug string) ([]domain.KnowledgePage, error) {
	rows, err := repository.db.QueryContext(ctx, `SELECT `+knowledgePageColumns+`
      FROM knowledge_pages p JOIN knowledge_bases b ON b.id = p.knowledge_base_id
      WHERE b.slug = ? ORDER BY p.position, p.title`, baseSlug)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]domain.KnowledgePage, 0)
	for rows.Next() {
		item, err := scanKnowledgePage(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (repository *MySQLRepository) FindKnowledgePage(ctx context.Context, baseSlug, pageSlug string) (domain.KnowledgePage, error) {
	row := repository.db.QueryRowContext(ctx, `SELECT `+knowledgePageColumns+`
      FROM knowledge_pages p JOIN knowledge_bases b ON b.id = p.knowledge_base_id
      WHERE b.slug = ? AND p.slug = ? LIMIT 1`, baseSlug, pageSlug)
	item, err := scanKnowledgePage(row)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.KnowledgePage{}, ErrNotFound
	}
	return item, err
}

func (repository *MySQLRepository) CreateKnowledgePage(ctx context.Context, baseSlug string, input domain.KnowledgePageInput) (domain.KnowledgePage, error) {
	if err := input.Validate(); err != nil {
		return domain.KnowledgePage{}, err
	}
	var baseID string
	if err := repository.db.QueryRowContext(ctx, `SELECT id FROM knowledge_bases WHERE slug = ?`, baseSlug).Scan(&baseID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return domain.KnowledgePage{}, ErrNotFound
		}
		return domain.KnowledgePage{}, err
	}
	id := input.ID
	if id == "" {
		var err error
		id, err = domain.NewID()
		if err != nil {
			return domain.KnowledgePage{}, err
		}
	}
	now := time.Now().UTC()
	_, err := repository.db.ExecContext(ctx, `INSERT INTO knowledge_pages
      (id, knowledge_base_id, parent_id, author_id, slug, title, summary, body_markdown, body_object_key, body_revision, body_hash, body_size,
       position, status, visibility, created_at, updated_at)
      VALUES (?, ?, NULLIF(?, ''), NULLIF(?, ''), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, baseID, input.ParentID, input.AuthorID, input.Slug, input.Title, input.Summary, input.BodyMarkdown,
		input.BodyObjectKey, input.BodyRevision, input.BodyHash, input.BodySize,
		input.Position, input.Status, input.Visibility, now, now)
	if err != nil {
		return domain.KnowledgePage{}, err
	}
	return domain.KnowledgePage{ID: id, KnowledgeBaseID: baseID, ParentID: input.ParentID, AuthorID: input.AuthorID, Slug: input.Slug, Title: input.Title, Summary: input.Summary, BodyMarkdown: input.BodyMarkdown, BodyObjectKey: input.BodyObjectKey, BodyRevision: input.BodyRevision, BodyHash: input.BodyHash, BodySize: input.BodySize, Position: input.Position, Status: input.Status, Visibility: input.Visibility, CreatedAt: now, UpdatedAt: now}, nil
}

func (repository *MySQLRepository) UpdateKnowledgePage(ctx context.Context, baseSlug, pageSlug string, input domain.KnowledgePageInput) (domain.KnowledgePage, error) {
	if err := input.Validate(); err != nil {
		return domain.KnowledgePage{}, err
	}
	current, err := repository.FindKnowledgePage(ctx, baseSlug, pageSlug)
	if err != nil {
		return domain.KnowledgePage{}, err
	}
	if input.ParentID == current.ID {
		return domain.KnowledgePage{}, ErrConflict
	}
	if input.BodyObjectKey != "" && current.BodyRevision != input.BodyRevision-1 {
		return domain.KnowledgePage{}, ErrConflict
	}
	now := time.Now().UTC()
	updateQuery := `UPDATE knowledge_pages SET parent_id = NULLIF(?, ''), slug = ?, title = ?, summary = ?,
      body_markdown = ?, body_object_key = ?, body_revision = ?, body_hash = ?, body_size = ?,
	      position = ?, status = ?, visibility = ?, updated_at = ? WHERE id = ?`
	updateArgs := []any{
		input.ParentID, input.Slug, input.Title, input.Summary, input.BodyMarkdown,
		input.BodyObjectKey, input.BodyRevision, input.BodyHash, input.BodySize,
		input.Position, input.Status, input.Visibility, now, current.ID,
	}
	if input.BodyObjectKey != "" {
		updateQuery += " AND body_revision = ?"
		updateArgs = append(updateArgs, input.BodyRevision-1)
	}
	result, err := repository.db.ExecContext(ctx, updateQuery, updateArgs...)
	if err != nil {
		return domain.KnowledgePage{}, err
	}
	if input.BodyObjectKey != "" {
		rowsAffected, err := result.RowsAffected()
		if err != nil {
			return domain.KnowledgePage{}, err
		}
		if rowsAffected != 1 {
			return domain.KnowledgePage{}, ErrConflict
		}
	}
	current.ParentID = input.ParentID
	current.Slug = input.Slug
	current.Title = input.Title
	current.Summary = input.Summary
	current.BodyMarkdown = input.BodyMarkdown
	current.BodyObjectKey = input.BodyObjectKey
	current.BodyRevision = input.BodyRevision
	current.BodyHash = input.BodyHash
	current.BodySize = input.BodySize
	current.Position = input.Position
	current.Status = input.Status
	current.Visibility = input.Visibility
	current.UpdatedAt = now
	return current, nil
}

func (repository *MySQLRepository) DeleteKnowledgePage(ctx context.Context, baseSlug, pageSlug string) error {
	item, err := repository.FindKnowledgePage(ctx, baseSlug, pageSlug)
	if err != nil {
		return err
	}
	result, err := repository.db.ExecContext(ctx, `DELETE FROM knowledge_pages WHERE id = ?`, item.ID)
	if err != nil {
		return err
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return ErrNotFound
	}
	return nil
}

type knowledgeScanner interface {
	Scan(...any) error
}

func scanKnowledgePage(scanner knowledgeScanner) (domain.KnowledgePage, error) {
	var item domain.KnowledgePage
	var parentID, authorID sql.NullString
	var bodyObjectKey, bodyHash sql.NullString
	err := scanner.Scan(&item.ID, &item.KnowledgeBaseID, &parentID, &authorID, &item.Slug, &item.Title, &item.Summary, &item.BodyMarkdown,
		&bodyObjectKey, &item.BodyRevision, &bodyHash, &item.BodySize,
		&item.Position, &item.Status, &item.Visibility, &item.CreatedAt, &item.UpdatedAt)
	item.ParentID = parentID.String
	item.AuthorID = authorID.String
	item.BodyObjectKey = bodyObjectKey.String
	item.BodyHash = bodyHash.String
	return item, err
}
