package store

import (
	"context"
	"database/sql"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/bc-dev/bc-atlas-cms/server/internal/domain"
	mysqldriver "github.com/go-sql-driver/mysql"
)

//go:embed migrations/001_init.sql
var initialMigration string

//go:embed migrations/002_membership.sql
var membershipMigration string

//go:embed migrations/003_comments.sql
var commentsMigration string

//go:embed migrations/004_knowledge.sql
var knowledgeMigration string

//go:embed migrations/005_content_storage.sql
var contentStorageMigration string

type MySQLRepository struct {
	db *sql.DB
}

const contentColumns = `c.id, c.author_id, c.content_type, c.slug, c.title, c.summary,
  c.body_markdown, c.body_object_key, c.body_revision, c.body_hash, c.body_size,
  c.status, c.visibility, c.published_at, c.created_at, c.updated_at`

func OpenMySQL(ctx context.Context, dsn string) (*MySQLRepository, error) {
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(16)
	db.SetMaxIdleConns(8)
	db.SetConnMaxLifetime(30 * time.Minute)
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, err
	}
	repository := &MySQLRepository{db: db}
	if err := repository.Migrate(ctx); err != nil {
		db.Close()
		return nil, err
	}
	if err := repository.ensureFootprintSchema(ctx); err != nil {
		db.Close()
		return nil, err
	}
	return repository, nil
}

func (repository *MySQLRepository) Close() error {
	return repository.db.Close()
}

func (repository *MySQLRepository) Health(ctx context.Context) error {
	return repository.db.PingContext(ctx)
}

func (repository *MySQLRepository) CreateMediaObject(ctx context.Context, object domain.MediaObject) error {
	_, err := repository.db.ExecContext(ctx, `INSERT INTO media_objects
      (id, object_key, bucket_name, original_name, content_type, size_bytes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, object.ID, object.ObjectKey, object.BucketName,
		object.OriginalName, object.ContentType, object.SizeBytes, object.CreatedAt)
	return err
}

func (repository *MySQLRepository) Migrate(ctx context.Context) error {
	for _, migration := range []string{initialMigration, membershipMigration, commentsMigration, knowledgeMigration, contentStorageMigration} {
		for _, statement := range strings.Split(migration, ";") {
			statement = strings.TrimSpace(statement)
			if statement == "" {
				continue
			}
			if _, err := repository.db.ExecContext(ctx, statement); err != nil {
				return fmt.Errorf("migration failed: %w", err)
			}
		}
	}
	if err := repository.ensureContentsAuthorColumn(ctx); err != nil {
		return err
	}
	if err := repository.ensureKnowledgeBaseCoverColumn(ctx); err != nil {
		return err
	}
	return repository.ensureContentStorageSchema(ctx)
}

func (repository *MySQLRepository) ensureContentStorageSchema(ctx context.Context) error {
	columns := []struct {
		table string
		name  string
		spec  string
	}{
		{table: "contents", name: "body_object_key", spec: "VARCHAR(512) NOT NULL DEFAULT '' AFTER body_markdown"},
		{table: "contents", name: "body_revision", spec: "INT NOT NULL DEFAULT 0 AFTER body_object_key"},
		{table: "contents", name: "body_hash", spec: "CHAR(64) NOT NULL DEFAULT '' AFTER body_revision"},
		{table: "contents", name: "body_size", spec: "BIGINT NOT NULL DEFAULT 0 AFTER body_hash"},
		{table: "knowledge_pages", name: "body_object_key", spec: "VARCHAR(512) NOT NULL DEFAULT '' AFTER body_markdown"},
		{table: "knowledge_pages", name: "body_revision", spec: "INT NOT NULL DEFAULT 0 AFTER body_object_key"},
		{table: "knowledge_pages", name: "body_hash", spec: "CHAR(64) NOT NULL DEFAULT '' AFTER body_revision"},
		{table: "knowledge_pages", name: "body_size", spec: "BIGINT NOT NULL DEFAULT 0 AFTER body_hash"},
	}
	for _, column := range columns {
		var count int
		if err := repository.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, column.table, column.name).Scan(&count); err != nil {
			return err
		}
		if count == 0 {
			if _, err := repository.db.ExecContext(ctx, fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", column.table, column.name, column.spec)); err != nil {
				return err
			}
		}
	}
	return nil
}

func (repository *MySQLRepository) ensureKnowledgeBaseCoverColumn(ctx context.Context) error {
	var count int
	if err := repository.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'knowledge_bases' AND COLUMN_NAME = 'cover_url'`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	_, err := repository.db.ExecContext(ctx, `ALTER TABLE knowledge_bases ADD COLUMN cover_url VARCHAR(2048) NOT NULL DEFAULT '' AFTER description`)
	return err
}

func (repository *MySQLRepository) ensureContentsAuthorColumn(ctx context.Context) error {
	var count int
	if err := repository.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contents' AND COLUMN_NAME = 'author_id'`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	_, err := repository.db.ExecContext(ctx, `ALTER TABLE contents
      ADD COLUMN author_id CHAR(36) NULL AFTER id,
      ADD INDEX idx_contents_author (author_id),
      ADD CONSTRAINT fk_content_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL`)
	return err
}

func (repository *MySQLRepository) ensureFootprintSchema(ctx context.Context) error {
	tx, err := repository.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	tagID, err := ensureTag(ctx, tx, domain.Tag{Slug: domain.FootprintSchema.Slug, Name: domain.FootprintSchema.Name})
	if err != nil {
		return err
	}
	for _, property := range domain.FootprintSchema.Properties {
		if _, err := ensureDefinition(ctx, tx, tagID, property.Key, property.Type, property.Required); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (repository *MySQLRepository) CreateContent(ctx context.Context, input domain.ContentInput) (domain.Content, error) {
	if err := input.Validate(); err != nil {
		return domain.Content{}, err
	}
	id := input.ID
	if id == "" {
		var err error
		id, err = domain.NewID()
		if err != nil {
			return domain.Content{}, err
		}
	}
	now := time.Now().UTC()
	tx, err := repository.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.Content{}, err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `INSERT INTO contents
      (id, author_id, content_type, slug, title, summary, body_markdown, body_object_key, body_revision, body_hash, body_size,
       status, visibility, published_at, created_at, updated_at)
      VALUES (?, NULLIF(?, ''), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, input.AuthorID, input.Type, input.Slug, input.Title, input.Summary, input.BodyMarkdown,
		input.BodyObjectKey, input.BodyRevision, input.BodyHash, input.BodySize,
		input.Status, input.Visibility, now, now, now)
	if err != nil {
		return domain.Content{}, err
	}

	for _, tag := range input.Tags {
		tagID, err := ensureTag(ctx, tx, tag)
		if err != nil {
			return domain.Content{}, err
		}
		contentTagID, err := domain.NewID()
		if err != nil {
			return domain.Content{}, err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO content_tags (id, content_id, tag_id, created_at) VALUES (?, ?, ?, ?)`, contentTagID, id, tagID, now); err != nil {
			return domain.Content{}, err
		}
		for key, value := range tag.Properties {
			propertyType := inferPropertyType(value)
			definitionID, err := ensureDefinition(ctx, tx, tagID, key, propertyType, tag.Slug == "footprint")
			if err != nil {
				return domain.Content{}, err
			}
			if err := insertPropertyValue(ctx, tx, contentTagID, definitionID, propertyType, value, now); err != nil {
				return domain.Content{}, err
			}
		}
	}
	searchText := input.SearchText
	if strings.TrimSpace(searchText) == "" {
		searchText = domain.SearchTextFromMarkdown(input.BodyMarkdown)
	}
	if err := upsertContentSearch(ctx, tx, id, input.Title, input.Summary, searchText, tagsSearchText(input.Tags), now); err != nil {
		return domain.Content{}, err
	}
	if err := tx.Commit(); err != nil {
		return domain.Content{}, err
	}
	return domain.Content{
		ID: id, AuthorID: input.AuthorID, Type: input.Type, Slug: input.Slug, Title: input.Title, Summary: input.Summary,
		BodyMarkdown: input.BodyMarkdown, Status: input.Status, Visibility: input.Visibility,
		BodyObjectKey: input.BodyObjectKey, BodyRevision: input.BodyRevision, BodyHash: input.BodyHash, BodySize: input.BodySize,
		PublishedAt: now, CreatedAt: now, UpdatedAt: now, Tags: input.Tags,
	}, nil
}

func (repository *MySQLRepository) ListContents(ctx context.Context, filter domain.ContentFilter) ([]domain.Content, error) {
	query := `SELECT DISTINCT ` + contentColumns + ` FROM contents c LEFT JOIN content_search cs ON cs.content_id = c.id`
	arguments := make([]any, 0, 6)
	conditions := make([]string, 0, 4)
	if filter.Tag != "" {
		query += ` JOIN content_tags ct ON ct.content_id = c.id JOIN tags t ON t.id = ct.tag_id`
		conditions = append(conditions, "t.slug = ?")
		arguments = append(arguments, filter.Tag)
	}
	if filter.Type != "" {
		conditions = append(conditions, "c.content_type = ?")
		arguments = append(arguments, filter.Type)
	}
	if filter.Status != "" {
		conditions = append(conditions, "c.status = ?")
		arguments = append(arguments, filter.Status)
	}
	if queryText := strings.ToLower(strings.TrimSpace(filter.Query)); queryText != "" {
		conditions = append(conditions, "(LOWER(c.title) LIKE ? OR LOWER(c.summary) LIKE ? OR LOWER(COALESCE(cs.body_text, c.body_markdown)) LIKE ? OR LOWER(COALESCE(cs.tags_text, '')) LIKE ?)")
		pattern := "%" + queryText + "%"
		arguments = append(arguments, pattern, pattern, pattern, pattern)
	}
	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}
	query += " ORDER BY c.published_at DESC"
	rows, err := repository.db.QueryContext(ctx, query, arguments...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	contents := make([]domain.Content, 0)
	for rows.Next() {
		content, err := scanContent(rows)
		if err != nil {
			return nil, err
		}
		content.Tags, err = repository.loadTags(ctx, content.ID)
		if err != nil {
			return nil, err
		}
		contents = append(contents, content)
	}
	return contents, rows.Err()
}

func (repository *MySQLRepository) UpdateContent(ctx context.Context, slug string, input domain.ContentInput) (domain.Content, error) {
	if err := input.Validate(); err != nil {
		return domain.Content{}, err
	}
	tx, err := repository.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.Content{}, err
	}
	defer tx.Rollback()
	var contentID, currentStatus string
	var currentBodyRevision int
	var publishedAt time.Time
	if err := tx.QueryRowContext(ctx, `SELECT id, status, body_revision, published_at FROM contents WHERE slug = ? FOR UPDATE`, slug).Scan(&contentID, &currentStatus, &currentBodyRevision, &publishedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return domain.Content{}, ErrNotFound
		}
		return domain.Content{}, err
	}
	now := time.Now().UTC()
	if input.Status == "published" && currentStatus != "published" {
		publishedAt = now
	}
	if input.BodyObjectKey != "" && currentBodyRevision != input.BodyRevision-1 {
		return domain.Content{}, ErrConflict
	}
	updateQuery := `UPDATE contents SET content_type = ?, slug = ?, title = ?, summary = ?,
		body_markdown = ?, body_object_key = ?, body_revision = ?, body_hash = ?, body_size = ?,
		status = ?, visibility = ?, published_at = ?, updated_at = ? WHERE id = ?`
	updateArgs := []any{input.Type, input.Slug,
		input.Title, input.Summary, input.BodyMarkdown, input.BodyObjectKey, input.BodyRevision, input.BodyHash, input.BodySize,
		input.Status, input.Visibility, publishedAt, now, contentID}
	if input.BodyObjectKey != "" {
		updateQuery += " AND body_revision = ?"
		updateArgs = append(updateArgs, input.BodyRevision-1)
	}
	result, err := tx.ExecContext(ctx, updateQuery, updateArgs...)
	if err != nil {
		return domain.Content{}, err
	}
	if input.BodyObjectKey != "" {
		rowsAffected, err := result.RowsAffected()
		if err != nil {
			return domain.Content{}, err
		}
		if rowsAffected != 1 {
			return domain.Content{}, ErrConflict
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM content_tags WHERE content_id = ?`, contentID); err != nil {
		return domain.Content{}, err
	}
	for _, tag := range input.Tags {
		tagID, err := ensureTag(ctx, tx, tag)
		if err != nil {
			return domain.Content{}, err
		}
		contentTagID, err := domain.NewID()
		if err != nil {
			return domain.Content{}, err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO content_tags (id, content_id, tag_id, created_at) VALUES (?, ?, ?, ?)`, contentTagID, contentID, tagID, now); err != nil {
			return domain.Content{}, err
		}
		for key, value := range tag.Properties {
			propertyType := inferPropertyType(value)
			definitionID, err := ensureDefinition(ctx, tx, tagID, key, propertyType, tag.Slug == "footprint")
			if err != nil {
				return domain.Content{}, err
			}
			if err := insertPropertyValue(ctx, tx, contentTagID, definitionID, propertyType, value, now); err != nil {
				return domain.Content{}, err
			}
		}
	}
	searchText := input.SearchText
	if strings.TrimSpace(searchText) == "" {
		searchText = domain.SearchTextFromMarkdown(input.BodyMarkdown)
	}
	if err := upsertContentSearch(ctx, tx, contentID, input.Title, input.Summary, searchText, tagsSearchText(input.Tags), now); err != nil {
		return domain.Content{}, err
	}
	if err := tx.Commit(); err != nil {
		return domain.Content{}, err
	}
	return repository.FindBySlug(ctx, input.Slug)
}

func (repository *MySQLRepository) DeleteContent(ctx context.Context, slug string) error {
	result, err := repository.db.ExecContext(ctx, `DELETE FROM contents WHERE slug = ?`, slug)
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

func (repository *MySQLRepository) ListFootprints(ctx context.Context) ([]domain.Content, error) {
	rows, err := repository.db.QueryContext(ctx, `
	    SELECT DISTINCT `+contentColumns+`
    FROM contents c LEFT JOIN content_search cs ON cs.content_id = c.id
    JOIN content_tags ct ON ct.content_id = c.id
    JOIN tags t ON t.id = ct.tag_id
    WHERE t.slug = 'footprint' AND c.status = 'published'
    ORDER BY c.published_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var contents []domain.Content
	for rows.Next() {
		content, err := scanContent(rows)
		if err != nil {
			return nil, err
		}
		content.Tags, err = repository.loadTags(ctx, content.ID)
		if err != nil {
			return nil, err
		}
		contents = append(contents, content)
	}
	return contents, rows.Err()
}

func (repository *MySQLRepository) FindBySlug(ctx context.Context, slug string) (domain.Content, error) {
	row := repository.db.QueryRowContext(ctx, `SELECT `+contentColumns+` FROM contents c WHERE c.slug = ? LIMIT 1`, slug)
	content, err := scanContent(row)
	if err != nil {
		return domain.Content{}, err
	}
	content.Tags, err = repository.loadTags(ctx, content.ID)
	return content, err
}

type scanner interface {
	Scan(...any) error
}

func scanContent(row scanner) (domain.Content, error) {
	var content domain.Content
	var authorID sql.NullString
	var bodyObjectKey, bodyHash sql.NullString
	err := row.Scan(&content.ID, &authorID, &content.Type, &content.Slug, &content.Title, &content.Summary,
		&content.BodyMarkdown, &bodyObjectKey, &content.BodyRevision, &bodyHash, &content.BodySize,
		&content.Status, &content.Visibility, &content.PublishedAt,
		&content.CreatedAt, &content.UpdatedAt)
	content.AuthorID = authorID.String
	content.BodyObjectKey = bodyObjectKey.String
	content.BodyHash = bodyHash.String
	return content, err
}

func upsertContentSearch(ctx context.Context, tx *sql.Tx, contentID, title, summary, bodyText, tagsText string, updatedAt time.Time) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO content_search
      (content_id, title, summary, body_text, tags_text, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE title = VALUES(title), summary = VALUES(summary), body_text = VALUES(body_text),
        tags_text = VALUES(tags_text), updated_at = VALUES(updated_at)`,
		contentID, title, summary, bodyText, tagsText, updatedAt)
	return err
}

func tagsSearchText(tags []domain.Tag) string {
	parts := make([]string, 0, len(tags)*2)
	for _, tag := range tags {
		parts = append(parts, tag.Slug, tag.Name)
		for key, value := range tag.Properties {
			parts = append(parts, key, fmt.Sprint(value))
		}
	}
	return strings.Join(parts, " ")
}

func (repository *MySQLRepository) loadTags(ctx context.Context, contentID string) ([]domain.Tag, error) {
	rows, err := repository.db.QueryContext(ctx, `
    SELECT t.id, t.slug, t.name, d.key_name, d.value_type,
      v.string_value, v.number_value, v.boolean_value, v.json_value
    FROM content_tags ct
    JOIN tags t ON t.id = ct.tag_id
    LEFT JOIN content_tag_property_values v ON v.content_tag_id = ct.id
    LEFT JOIN tag_property_definitions d ON d.id = v.definition_id
    WHERE ct.content_id = ?
    ORDER BY t.slug, d.key_name`, contentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tagsByID := map[string]*domain.Tag{}
	var order []string
	for rows.Next() {
		var tagID, slug, name string
		var key, valueType sql.NullString
		var stringValue sql.NullString
		var numberValue sql.NullFloat64
		var booleanValue sql.NullBool
		var jsonValue []byte
		if err := rows.Scan(&tagID, &slug, &name, &key, &valueType, &stringValue, &numberValue, &booleanValue, &jsonValue); err != nil {
			return nil, err
		}
		tag, ok := tagsByID[tagID]
		if !ok {
			tag = &domain.Tag{Slug: slug, Name: name, Properties: map[string]any{}}
			tagsByID[tagID] = tag
			order = append(order, tagID)
		}
		if key.Valid {
			switch domain.PropertyType(valueType.String) {
			case domain.PropertyNumber:
				tag.Properties[key.String] = numberValue.Float64
			case domain.PropertyBoolean:
				tag.Properties[key.String] = booleanValue.Bool
			case domain.PropertyJSON:
				var decoded any
				if len(jsonValue) > 0 && json.Unmarshal(jsonValue, &decoded) == nil {
					tag.Properties[key.String] = decoded
				}
			default:
				tag.Properties[key.String] = stringValue.String
			}
		}
	}
	var tags []domain.Tag
	for _, id := range order {
		tags = append(tags, *tagsByID[id])
	}
	return tags, rows.Err()
}

func ensureTag(ctx context.Context, tx *sql.Tx, tag domain.Tag) (string, error) {
	var id string
	err := tx.QueryRowContext(ctx, `SELECT id FROM tags WHERE slug = ?`, tag.Slug).Scan(&id)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	id, err = domain.NewID()
	if err != nil {
		return "", err
	}
	name := tag.Name
	if name == "" {
		name = strings.ReplaceAll(strings.Title(strings.ReplaceAll(tag.Slug, "-", " ")), " ", " ")
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO tags (id, slug, name, created_at) VALUES (?, ?, ?, ?)`, id, tag.Slug, name, time.Now().UTC())
	return id, err
}

func ensureDefinition(ctx context.Context, tx *sql.Tx, tagID, key string, propertyType domain.PropertyType, required bool) (string, error) {
	var id string
	err := tx.QueryRowContext(ctx, `SELECT id FROM tag_property_definitions WHERE tag_id = ? AND key_name = ?`, tagID, key).Scan(&id)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	id, err = domain.NewID()
	if err != nil {
		return "", err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO tag_property_definitions (id, tag_id, key_name, value_type, is_required, created_at) VALUES (?, ?, ?, ?, ?, ?)`, id, tagID, key, propertyType, required, time.Now().UTC())
	return id, err
}

func insertPropertyValue(ctx context.Context, tx *sql.Tx, contentTagID, definitionID string, propertyType domain.PropertyType, value any, now time.Time) error {
	id, err := domain.NewID()
	if err != nil {
		return err
	}
	var stringValue, numberValue, booleanValue, jsonValue any
	switch propertyType {
	case domain.PropertyNumber:
		numberValue = value
	case domain.PropertyBoolean:
		booleanValue = value
	case domain.PropertyJSON:
		encoded, err := json.Marshal(value)
		if err != nil {
			return err
		}
		jsonValue = string(encoded)
	default:
		stringValue = fmt.Sprint(value)
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO content_tag_property_values
    (id, content_tag_id, definition_id, string_value, number_value, boolean_value, json_value, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, contentTagID, definitionID, stringValue, numberValue, booleanValue, jsonValue, now)
	return err
}

func inferPropertyType(value any) domain.PropertyType {
	switch value.(type) {
	case float64, float32, int, int64, json.Number:
		return domain.PropertyNumber
	case bool:
		return domain.PropertyBoolean
	case string:
		return domain.PropertyString
	default:
		return domain.PropertyJSON
	}
}

func (repository *MySQLRepository) CreateUser(ctx context.Context, input domain.UserInput) (domain.User, error) {
	id, err := domain.NewID()
	if err != nil {
		return domain.User{}, err
	}
	now := time.Now().UTC()
	role := input.Role
	if role == "" {
		role = domain.RoleMember
	}
	user := domain.User{
		ID: id, Email: strings.ToLower(strings.TrimSpace(input.Email)), DisplayName: strings.TrimSpace(input.DisplayName),
		Role: role, PasswordHash: append([]byte(nil), input.PasswordHash...), CreatedAt: now, UpdatedAt: now,
	}
	_, err = repository.db.ExecContext(ctx, `INSERT INTO users
      (id, email, display_name, role, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
		user.ID, user.Email, user.DisplayName, user.Role, user.PasswordHash, now, now)
	if isDuplicate(err) {
		return domain.User{}, ErrConflict
	}
	return user, err
}

func (repository *MySQLRepository) EnsureAdmin(ctx context.Context, input domain.UserInput) (domain.User, error) {
	id, err := domain.NewID()
	if err != nil {
		return domain.User{}, err
	}
	now := time.Now().UTC()
	email := strings.ToLower(strings.TrimSpace(input.Email))
	_, err = repository.db.ExecContext(ctx, `INSERT INTO users
      (id, email, display_name, role, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, 'admin', ?, ?, ?)
      ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), role = 'admin',
        password_hash = VALUES(password_hash), updated_at = VALUES(updated_at)`,
		id, email, strings.TrimSpace(input.DisplayName), input.PasswordHash, now, now)
	if err != nil {
		return domain.User{}, err
	}
	return repository.FindUserByEmail(ctx, email)
}

func (repository *MySQLRepository) FindUserByEmail(ctx context.Context, email string) (domain.User, error) {
	row := repository.db.QueryRowContext(ctx, `SELECT id, email, display_name, role, password_hash, created_at, updated_at
      FROM users WHERE email = ? LIMIT 1`, strings.ToLower(strings.TrimSpace(email)))
	return scanUser(row)
}

func scanUser(row scanner) (domain.User, error) {
	var user domain.User
	err := row.Scan(&user.ID, &user.Email, &user.DisplayName, &user.Role, &user.PasswordHash, &user.CreatedAt, &user.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.User{}, ErrNotFound
	}
	return user, err
}

func (repository *MySQLRepository) CreateSession(ctx context.Context, session domain.Session) error {
	_, err := repository.db.ExecContext(ctx, `INSERT INTO sessions
      (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
		session.ID, session.UserID, session.TokenHash, session.ExpiresAt, session.CreatedAt)
	return err
}

func (repository *MySQLRepository) FindUserBySessionHash(ctx context.Context, tokenHash string, now time.Time) (domain.User, error) {
	row := repository.db.QueryRowContext(ctx, `SELECT u.id, u.email, u.display_name, u.role, u.password_hash, u.created_at, u.updated_at
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? LIMIT 1`, tokenHash, now)
	return scanUser(row)
}

func (repository *MySQLRepository) DeleteSession(ctx context.Context, tokenHash string) error {
	_, err := repository.db.ExecContext(ctx, `DELETE FROM sessions WHERE token_hash = ?`, tokenHash)
	return err
}

func (repository *MySQLRepository) CreateComment(ctx context.Context, contentSlug, userID, authorDisplayName, body string) (domain.Comment, error) {
	id, err := domain.NewID()
	if err != nil {
		return domain.Comment{}, err
	}
	now := time.Now().UTC()
	var contentID string
	err = repository.db.QueryRowContext(ctx, `SELECT id FROM contents WHERE slug = ? LIMIT 1`, contentSlug).Scan(&contentID)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Comment{}, ErrNotFound
	}
	if err != nil {
		return domain.Comment{}, err
	}
	displayName := strings.TrimSpace(authorDisplayName)
	var nullableUserID any
	if userID != "" {
		err = repository.db.QueryRowContext(ctx, `SELECT display_name FROM users WHERE id = ? LIMIT 1`, userID).Scan(&displayName)
		if errors.Is(err, sql.ErrNoRows) {
			return domain.Comment{}, ErrNotFound
		}
		if err != nil {
			return domain.Comment{}, err
		}
		nullableUserID = userID
	}
	comment := domain.Comment{ID: id, ContentID: contentID, UserID: userID, AuthorDisplayName: displayName, Body: strings.TrimSpace(body), Status: "published", CreatedAt: now, UpdatedAt: now}
	_, err = repository.db.ExecContext(ctx, `INSERT INTO comments
      (id, content_id, user_id, author_display_name, body, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'published', ?, ?)`, comment.ID, comment.ContentID, nullableUserID, comment.AuthorDisplayName, comment.Body, now, now)
	return comment, err
}

func (repository *MySQLRepository) ListComments(ctx context.Context, contentSlug string) ([]domain.Comment, error) {
	rows, err := repository.db.QueryContext(ctx, `SELECT cm.id, cm.content_id, cm.user_id, cm.author_display_name,
      cm.body, cm.status, cm.created_at, cm.updated_at FROM comments cm
      JOIN contents c ON c.id = cm.content_id WHERE c.slug = ? AND cm.status = 'published'
      ORDER BY cm.created_at ASC`, contentSlug)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	comments := make([]domain.Comment, 0)
	for rows.Next() {
		var comment domain.Comment
		var userID sql.NullString
		if err := rows.Scan(&comment.ID, &comment.ContentID, &userID, &comment.AuthorDisplayName, &comment.Body,
			&comment.Status, &comment.CreatedAt, &comment.UpdatedAt); err != nil {
			return nil, err
		}
		comment.UserID = userID.String
		comments = append(comments, comment)
	}
	return comments, rows.Err()
}

func isDuplicate(err error) bool {
	var mysqlError *mysqldriver.MySQLError
	return errors.As(err, &mysqlError) && mysqlError.Number == 1062
}

func SortContentsByPublished(contents []domain.Content) {
	sort.Slice(contents, func(i, j int) bool { return contents[i].PublishedAt.After(contents[j].PublishedAt) })
}
