package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/bc-dev/bc-atlas-cms/server/internal/domain"
)

// Knowledge is a content type. These tables only hold the type-specific
// catalogue and tree relations; titles, authorship, visibility, state, and
// Markdown object metadata live in contents like every other publication.
const knowledgeBaseColumns = `c.id, c.author_id, d.route_slug, c.title, c.summary, d.cover_url,
  c.visibility, d.position, c.created_at, c.updated_at`

const knowledgePageColumns = `c.id, s.knowledge_base_content_id, s.parent_content_id, c.author_id,
  s.route_slug, c.title, c.summary, c.body_markdown, c.body_object_key, c.body_revision,
  c.body_hash, c.body_size, s.position, c.status, c.visibility, c.created_at, c.updated_at`

func (repository *MySQLRepository) ListKnowledgeBases(ctx context.Context) ([]domain.KnowledgeBase, error) {
	rows, err := repository.db.QueryContext(ctx, `SELECT `+knowledgeBaseColumns+`
      FROM contents c JOIN knowledge_base_details d ON d.content_id = c.id
      WHERE c.content_type = 'knowledge_base' ORDER BY d.position, c.title`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]domain.KnowledgeBase, 0)
	for rows.Next() {
		item, err := scanKnowledgeBase(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (repository *MySQLRepository) FindKnowledgeBase(ctx context.Context, slug string) (domain.KnowledgeBase, error) {
	row := repository.db.QueryRowContext(ctx, `SELECT `+knowledgeBaseColumns+`
      FROM contents c JOIN knowledge_base_details d ON d.content_id = c.id
      WHERE c.content_type = 'knowledge_base' AND d.route_slug = ? LIMIT 1`, slug)
	item, err := scanKnowledgeBase(row)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.KnowledgeBase{}, ErrNotFound
	}
	return item, err
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
	tx, err := repository.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.KnowledgeBase{}, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `INSERT INTO contents
      (id, author_id, content_type, slug, title, summary, body_markdown, body_object_key, body_revision, body_hash, body_size,
       status, visibility, published_at, created_at, updated_at)
      VALUES (?, NULLIF(?, ''), 'knowledge_base', ?, ?, ?, '', '', 0, '', 0, 'published', ?, ?, ?, ?)`,
		id, input.AuthorID, knowledgeInternalSlug("base", id), input.Title, input.Description, input.Visibility, now, now, now); err != nil {
		return domain.KnowledgeBase{}, mapConflict(err)
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO knowledge_base_details
      (content_id, route_slug, cover_url, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		id, input.Slug, input.CoverURL, input.Position, now, now); err != nil {
		return domain.KnowledgeBase{}, mapConflict(err)
	}
	if err := upsertContentSearch(ctx, tx, id, input.Title, input.Description, "", "knowledge_base knowledge base", now); err != nil {
		return domain.KnowledgeBase{}, err
	}
	if err := tx.Commit(); err != nil {
		return domain.KnowledgeBase{}, err
	}
	return domain.KnowledgeBase{ID: id, AuthorID: input.AuthorID, Slug: input.Slug, Title: input.Title, Description: input.Description, CoverURL: input.CoverURL, Visibility: input.Visibility, Position: input.Position, CreatedAt: now, UpdatedAt: now}, nil
}

func (repository *MySQLRepository) UpdateKnowledgeBase(ctx context.Context, slug string, input domain.KnowledgeBaseInput) (domain.KnowledgeBase, error) {
	if err := input.Validate(); err != nil {
		return domain.KnowledgeBase{}, err
	}
	current, err := repository.FindKnowledgeBase(ctx, slug)
	if err != nil {
		return domain.KnowledgeBase{}, err
	}
	now := time.Now().UTC()
	tx, err := repository.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.KnowledgeBase{}, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE contents SET title = ?, summary = ?, visibility = ?, updated_at = ? WHERE id = ? AND content_type = 'knowledge_base'`, input.Title, input.Description, input.Visibility, now, current.ID); err != nil {
		return domain.KnowledgeBase{}, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE knowledge_base_details SET route_slug = ?, cover_url = ?, position = ?, updated_at = ? WHERE content_id = ?`, input.Slug, input.CoverURL, input.Position, now, current.ID); err != nil {
		return domain.KnowledgeBase{}, mapConflict(err)
	}
	if err := upsertContentSearch(ctx, tx, current.ID, input.Title, input.Description, "", "knowledge_base knowledge base", now); err != nil {
		return domain.KnowledgeBase{}, err
	}
	if err := tx.Commit(); err != nil {
		return domain.KnowledgeBase{}, err
	}
	current.Slug, current.Title, current.Description, current.CoverURL = input.Slug, input.Title, input.Description, input.CoverURL
	current.Visibility, current.Position, current.UpdatedAt = input.Visibility, input.Position, now
	return current, nil
}

func (repository *MySQLRepository) DeleteKnowledgeBase(ctx context.Context, slug string) error {
	base, err := repository.FindKnowledgeBase(ctx, slug)
	if err != nil {
		return err
	}
	tx, err := repository.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(ctx, `SELECT content_id FROM knowledge_structure WHERE knowledge_base_content_id = ?`, base.ID)
	if err != nil {
		return err
	}
	pageIDs := make([]string, 0)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		pageIDs = append(pageIDs, id)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	// Delete relation rows first: the parent relation deliberately uses RESTRICT
	// so accidental page deletion cannot orphan a subtree.
	if _, err := tx.ExecContext(ctx, `DELETE FROM knowledge_structure WHERE knowledge_base_content_id = ?`, base.ID); err != nil {
		return err
	}
	if len(pageIDs) > 0 {
		args := make([]any, len(pageIDs))
		for index, id := range pageIDs {
			args[index] = id
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM contents WHERE id IN (`+placeholders(len(pageIDs))+`)`, args...); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM contents WHERE id = ? AND content_type = 'knowledge_base'`, base.ID); err != nil {
		return err
	}
	return tx.Commit()
}

func (repository *MySQLRepository) ListKnowledgePages(ctx context.Context, baseSlug string) ([]domain.KnowledgePage, error) {
	rows, err := repository.db.QueryContext(ctx, `SELECT `+knowledgePageColumns+`
      FROM contents c
      JOIN knowledge_structure s ON s.content_id = c.id
      JOIN knowledge_base_details b ON b.content_id = s.knowledge_base_content_id
      WHERE c.content_type = 'knowledge_page' AND b.route_slug = ?
      ORDER BY s.position, c.title`, baseSlug)
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
      FROM contents c
      JOIN knowledge_structure s ON s.content_id = c.id
      JOIN knowledge_base_details b ON b.content_id = s.knowledge_base_content_id
      WHERE c.content_type = 'knowledge_page' AND b.route_slug = ? AND s.route_slug = ? LIMIT 1`, baseSlug, pageSlug)
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
	base, err := repository.FindKnowledgeBase(ctx, baseSlug)
	if err != nil {
		return domain.KnowledgePage{}, err
	}
	id := input.ID
	if id == "" {
		id, err = domain.NewID()
		if err != nil {
			return domain.KnowledgePage{}, err
		}
	}
	now := time.Now().UTC()
	tx, err := repository.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.KnowledgePage{}, err
	}
	defer tx.Rollback()
	if err := requireKnowledgeParent(ctx, tx, base.ID, input.ParentID, ""); err != nil {
		return domain.KnowledgePage{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO contents
      (id, author_id, content_type, slug, title, summary, body_markdown, body_object_key, body_revision, body_hash, body_size,
       status, visibility, published_at, created_at, updated_at)
      VALUES (?, NULLIF(?, ''), 'knowledge_page', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, input.AuthorID, knowledgeInternalSlug("page", id), input.Title, input.Summary, input.BodyMarkdown,
		input.BodyObjectKey, input.BodyRevision, input.BodyHash, input.BodySize,
		input.Status, input.Visibility, now, now, now); err != nil {
		return domain.KnowledgePage{}, mapConflict(err)
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO knowledge_structure
      (content_id, knowledge_base_content_id, parent_content_id, route_slug, position, created_at, updated_at)
      VALUES (?, ?, NULLIF(?, ''), ?, ?, ?, ?)`, id, base.ID, input.ParentID, input.Slug, input.Position, now, now); err != nil {
		return domain.KnowledgePage{}, mapConflict(err)
	}
	searchText := input.BodyMarkdown
	if err := upsertContentSearch(ctx, tx, id, input.Title, input.Summary, domain.SearchTextFromMarkdown(searchText), "knowledge_page knowledge page", now); err != nil {
		return domain.KnowledgePage{}, err
	}
	if err := tx.Commit(); err != nil {
		return domain.KnowledgePage{}, err
	}
	return domain.KnowledgePage{ID: id, KnowledgeBaseID: base.ID, ParentID: input.ParentID, AuthorID: input.AuthorID, Slug: input.Slug, Title: input.Title, Summary: input.Summary, BodyMarkdown: input.BodyMarkdown, BodyObjectKey: input.BodyObjectKey, BodyRevision: input.BodyRevision, BodyHash: input.BodyHash, BodySize: input.BodySize, Position: input.Position, Status: input.Status, Visibility: input.Visibility, CreatedAt: now, UpdatedAt: now}, nil
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
	tx, err := repository.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.KnowledgePage{}, err
	}
	defer tx.Rollback()
	if err := requireKnowledgeParent(ctx, tx, current.KnowledgeBaseID, input.ParentID, current.ID); err != nil {
		return domain.KnowledgePage{}, err
	}
	var publishedAt time.Time
	if err := tx.QueryRowContext(ctx, `SELECT published_at FROM contents WHERE id = ? FOR UPDATE`, current.ID).Scan(&publishedAt); err != nil {
		return domain.KnowledgePage{}, err
	}
	if input.Status == "published" && current.Status != "published" {
		publishedAt = now
	}
	query := `UPDATE contents SET title = ?, summary = ?, body_markdown = ?, body_object_key = ?, body_revision = ?, body_hash = ?, body_size = ?,
      status = ?, visibility = ?, published_at = ?, updated_at = ? WHERE id = ? AND content_type = 'knowledge_page'`
	args := []any{input.Title, input.Summary, input.BodyMarkdown, input.BodyObjectKey, input.BodyRevision, input.BodyHash, input.BodySize,
		input.Status, input.Visibility, publishedAt, now, current.ID}
	if input.BodyObjectKey != "" {
		query += " AND body_revision = ?"
		args = append(args, input.BodyRevision-1)
	}
	result, err := tx.ExecContext(ctx, query, args...)
	if err != nil {
		return domain.KnowledgePage{}, err
	}
	if input.BodyObjectKey != "" {
		count, err := result.RowsAffected()
		if err != nil || count != 1 {
			if err != nil {
				return domain.KnowledgePage{}, err
			}
			return domain.KnowledgePage{}, ErrConflict
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE knowledge_structure SET parent_content_id = NULLIF(?, ''), route_slug = ?, position = ?, updated_at = ? WHERE content_id = ?`, input.ParentID, input.Slug, input.Position, now, current.ID); err != nil {
		return domain.KnowledgePage{}, mapConflict(err)
	}
	if err := upsertContentSearch(ctx, tx, current.ID, input.Title, input.Summary, domain.SearchTextFromMarkdown(input.BodyMarkdown), "knowledge_page knowledge page", now); err != nil {
		return domain.KnowledgePage{}, err
	}
	if err := tx.Commit(); err != nil {
		return domain.KnowledgePage{}, err
	}
	current.ParentID, current.Slug, current.Title, current.Summary = input.ParentID, input.Slug, input.Title, input.Summary
	current.BodyMarkdown, current.BodyObjectKey, current.BodyRevision, current.BodyHash, current.BodySize = input.BodyMarkdown, input.BodyObjectKey, input.BodyRevision, input.BodyHash, input.BodySize
	current.Position, current.Status, current.Visibility, current.UpdatedAt = input.Position, input.Status, input.Visibility, now
	return current, nil
}

func (repository *MySQLRepository) DeleteKnowledgePage(ctx context.Context, baseSlug, pageSlug string) error {
	current, err := repository.FindKnowledgePage(ctx, baseSlug, pageSlug)
	if err != nil {
		return err
	}
	var children int
	if err := repository.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM knowledge_structure WHERE parent_content_id = ?`, current.ID).Scan(&children); err != nil {
		return err
	}
	if children > 0 {
		return ErrConflict
	}
	result, err := repository.db.ExecContext(ctx, `DELETE FROM contents WHERE id = ? AND content_type = 'knowledge_page'`, current.ID)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return ErrNotFound
	}
	return nil
}

func (repository *MySQLRepository) attachKnowledgeMetadata(ctx context.Context, content *domain.Content) error {
	switch content.Type {
	case "knowledge_base":
		row := repository.db.QueryRowContext(ctx, `SELECT route_slug, cover_url, position FROM knowledge_base_details WHERE content_id = ?`, content.ID)
		if err := row.Scan(&content.KnowledgeBaseSlug, &content.CoverURL, &content.Position); err != nil {
			return err
		}
	case "knowledge_page":
		row := repository.db.QueryRowContext(ctx, `SELECT b.route_slug, base.title, s.route_slug, s.parent_content_id, s.position
		  FROM knowledge_structure s
		  JOIN knowledge_base_details b ON b.content_id = s.knowledge_base_content_id
		  JOIN contents base ON base.id = s.knowledge_base_content_id
		  WHERE s.content_id = ?`, content.ID)
		var parent sql.NullString
		if err := row.Scan(&content.KnowledgeBaseSlug, &content.KnowledgeBaseTitle, &content.KnowledgePageSlug, &parent, &content.Position); err != nil {
			return err
		}
		content.ParentID = parent.String
	}
	return nil
}

func requireKnowledgeParent(ctx context.Context, tx *sql.Tx, baseID, parentID, currentID string) error {
	if parentID == "" {
		return nil
	}
	var count int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM knowledge_structure s
      JOIN contents c ON c.id = s.content_id
      WHERE s.content_id = ? AND s.knowledge_base_content_id = ? AND c.content_type = 'knowledge_page'`, parentID, baseID).Scan(&count); err != nil {
		return err
	}
	if count == 0 || parentID == currentID {
		return ErrConflict
	}
	return nil
}

func knowledgeInternalSlug(kind, id string) string { return "knowledge-" + kind + "--" + id }

func placeholders(count int) string { return strings.TrimRight(strings.Repeat("?,", count), ",") }

func mapConflict(err error) error {
	if isDuplicate(err) {
		return ErrConflict
	}
	return err
}

type knowledgeScanner interface{ Scan(...any) error }

func scanKnowledgeBase(scanner knowledgeScanner) (domain.KnowledgeBase, error) {
	var item domain.KnowledgeBase
	var authorID sql.NullString
	err := scanner.Scan(&item.ID, &authorID, &item.Slug, &item.Title, &item.Description, &item.CoverURL, &item.Visibility, &item.Position, &item.CreatedAt, &item.UpdatedAt)
	item.AuthorID = authorID.String
	return item, err
}

func scanKnowledgePage(scanner knowledgeScanner) (domain.KnowledgePage, error) {
	var item domain.KnowledgePage
	var parentID, authorID, bodyObjectKey, bodyHash sql.NullString
	err := scanner.Scan(&item.ID, &item.KnowledgeBaseID, &parentID, &authorID, &item.Slug, &item.Title, &item.Summary, &item.BodyMarkdown,
		&bodyObjectKey, &item.BodyRevision, &bodyHash, &item.BodySize, &item.Position, &item.Status, &item.Visibility, &item.CreatedAt, &item.UpdatedAt)
	item.ParentID, item.AuthorID, item.BodyObjectKey, item.BodyHash = parentID.String, authorID.String, bodyObjectKey.String, bodyHash.String
	return item, err
}
