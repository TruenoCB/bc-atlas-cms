package store

import (
	"context"
	"time"

	"github.com/bc-dev/bc-atlas-cms/server/internal/domain"
)

// MigrateContentObject records a successfully uploaded canonical document and
// keeps the search projection in the same MySQL transaction.
func (repository *MySQLRepository) MigrateContentObject(ctx context.Context, content domain.Content, objectKey, hash string, size int64, bodyText string) error {
	tx, err := repository.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	now := time.Now().UTC()
	revision := content.BodyRevision + 1
	if revision < 1 {
		revision = 1
	}
	if _, err := tx.ExecContext(ctx, `UPDATE contents SET body_markdown = '', body_object_key = ?, body_revision = ?, body_hash = ?, body_size = ?, updated_at = ? WHERE id = ?`, objectKey, revision, hash, size, now, content.ID); err != nil {
		return err
	}
	if err := upsertContentSearch(ctx, tx, content.ID, content.Title, content.Summary, bodyText, tagsSearchText(content.Tags), now); err != nil {
		return err
	}
	return tx.Commit()
}

func (repository *MySQLRepository) ReindexContentSearch(ctx context.Context, content domain.Content, bodyText string) error {
	tx, err := repository.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := upsertContentSearch(ctx, tx, content.ID, content.Title, content.Summary, bodyText, tagsSearchText(content.Tags), time.Now().UTC()); err != nil {
		return err
	}
	return tx.Commit()
}

func (repository *MySQLRepository) MigrateKnowledgeObject(ctx context.Context, page domain.KnowledgePage, objectKey, hash string, size int64) error {
	revision := page.BodyRevision + 1
	if revision < 1 {
		revision = 1
	}
	_, err := repository.db.ExecContext(ctx, `UPDATE knowledge_pages SET body_markdown = '', body_object_key = ?, body_revision = ?, body_hash = ?, body_size = ?, updated_at = ? WHERE id = ?`, objectKey, revision, hash, size, time.Now().UTC(), page.ID)
	return err
}

func (repository *MySQLRepository) ListAllKnowledgePages(ctx context.Context) ([]domain.KnowledgePage, error) {
	bases, err := repository.ListKnowledgeBases(ctx)
	if err != nil {
		return nil, err
	}
	pages := make([]domain.KnowledgePage, 0)
	for _, base := range bases {
		items, err := repository.ListKnowledgePages(ctx, base.Slug)
		if err != nil {
			return nil, err
		}
		pages = append(pages, items...)
	}
	return pages, nil
}
