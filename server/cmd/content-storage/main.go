package main

import (
	"context"
	"crypto/sha256"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"strconv"
	"strings"

	"github.com/bc-dev/bc-atlas-cms/server/internal/domain"
	"github.com/bc-dev/bc-atlas-cms/server/internal/media"
	"github.com/bc-dev/bc-atlas-cms/server/internal/store"
)

const maxDocumentBytes = 16 << 20

func main() {
	mode := flag.String("mode", "migrate", "migrate, reindex, or verify")
	flag.Parse()
	ctx := context.Background()

	dsn := os.Getenv("DATABASE_DSN")
	if dsn == "" {
		fail("DATABASE_DSN is required")
	}
	repository, err := store.OpenMySQL(ctx, dsn)
	if err != nil {
		fail("open MySQL: %v", err)
	}
	defer repository.Close()

	objectStore, err := openObjectStore(ctx)
	if err != nil {
		fail("open object storage: %v", err)
	}

	var runErr error
	switch *mode {
	case "migrate":
		runErr = migrate(ctx, repository, objectStore)
	case "reindex":
		runErr = reindex(ctx, repository, objectStore)
	case "verify":
		runErr = verify(ctx, repository, objectStore)
	default:
		fail("unknown mode %q", *mode)
	}
	if runErr != nil {
		fail("%s: %v", *mode, runErr)
	}
}

func openObjectStore(ctx context.Context) (*media.MinIOStore, error) {
	endpoint := os.Getenv("S3_ENDPOINT")
	if endpoint == "" {
		return nil, fmt.Errorf("S3_ENDPOINT is required")
	}
	secure, _ := strconv.ParseBool(envOr("S3_SECURE", "false"))
	return media.NewMinIOStore(ctx, endpoint, os.Getenv("S3_ACCESS_KEY"), os.Getenv("S3_SECRET_KEY"), envOr("S3_BUCKET", "bc-content"), "", secure)
}

func migrate(ctx context.Context, repository *store.MySQLRepository, objectStore *media.MinIOStore) error {
	contents, err := repository.ListContents(ctx, domain.ContentFilter{})
	if err != nil {
		return err
	}
	migratedContents := 0
	for _, content := range contents {
		if content.BodyObjectKey != "" {
			continue
		}
		body := content.BodyMarkdown
		key := documentKey("contents", content.ID, 1)
		hash, size, err := putDocument(ctx, objectStore, key, body, "contents", content.ID)
		if err != nil {
			return fmt.Errorf("upload content %s: %w", content.Slug, err)
		}
		if err := repository.MigrateContentObject(ctx, content, key, hash, size, domain.SearchTextFromMarkdown(body)); err != nil {
			_ = objectStore.Delete(ctx, key)
			return fmt.Errorf("record content %s: %w", content.Slug, err)
		}
		migratedContents++
	}

	pages, err := repository.ListAllKnowledgePages(ctx)
	if err != nil {
		return err
	}
	migratedPages := 0
	for _, page := range pages {
		if page.BodyObjectKey != "" {
			continue
		}
		body := page.BodyMarkdown
		key := documentKey("knowledge", page.ID, 1)
		hash, size, err := putDocument(ctx, objectStore, key, body, "knowledge", page.ID)
		if err != nil {
			return fmt.Errorf("upload knowledge page %s: %w", page.Slug, err)
		}
		if err := repository.MigrateKnowledgeObject(ctx, page, key, hash, size); err != nil {
			_ = objectStore.Delete(ctx, key)
			return fmt.Errorf("record knowledge page %s: %w", page.Slug, err)
		}
		migratedPages++
	}
	slog.Default().Info("content migration complete", "contents", migratedContents, "knowledgePages", migratedPages)
	return nil
}

func reindex(ctx context.Context, repository *store.MySQLRepository, objectStore *media.MinIOStore) error {
	contents, err := repository.ListContents(ctx, domain.ContentFilter{})
	if err != nil {
		return err
	}
	for _, content := range contents {
		body, err := loadBody(ctx, objectStore, content.BodyObjectKey, content.BodyMarkdown)
		if err != nil {
			return fmt.Errorf("read content %s: %w", content.Slug, err)
		}
		if err := repository.ReindexContentSearch(ctx, content, domain.SearchTextFromMarkdown(body)); err != nil {
			return fmt.Errorf("reindex content %s: %w", content.Slug, err)
		}
	}
	slog.Default().Info("content search reindex complete", "contents", len(contents))
	return nil
}

func verify(ctx context.Context, repository *store.MySQLRepository, objectStore *media.MinIOStore) error {
	contents, err := repository.ListContents(ctx, domain.ContentFilter{})
	if err != nil {
		return err
	}
	checked := 0
	for _, content := range contents {
		if content.BodyObjectKey == "" {
			continue
		}
		if _, err := loadAndVerifyBody(ctx, objectStore, content.BodyObjectKey, "", content.BodyHash, content.BodySize); err != nil {
			return fmt.Errorf("verify content %s: %w", content.Slug, err)
		}
		checked++
	}
	pages, err := repository.ListAllKnowledgePages(ctx)
	if err != nil {
		return err
	}
	for _, page := range pages {
		if page.BodyObjectKey == "" {
			continue
		}
		if _, err := loadAndVerifyBody(ctx, objectStore, page.BodyObjectKey, "", page.BodyHash, page.BodySize); err != nil {
			return fmt.Errorf("verify knowledge page %s: %w", page.Slug, err)
		}
		checked++
	}
	slog.Default().Info("content objects verified", "objects", checked)
	return nil
}

func putDocument(ctx context.Context, objectStore *media.MinIOStore, key, body, kind, id string) (string, int64, error) {
	if int64(len(body)) > maxDocumentBytes {
		return "", 0, fmt.Errorf("body exceeds %d bytes", maxDocumentBytes)
	}
	digest := sha256.Sum256([]byte(body))
	if _, err := objectStore.PutContent(ctx, key, "text/markdown; charset=utf-8", int64(len(body)), strings.NewReader(body), map[string]string{
		"document-kind": kind,
		"document-id":   id,
		"revision":      "1",
	}); err != nil {
		return "", 0, err
	}
	return fmt.Sprintf("%x", digest[:]), int64(len(body)), nil
}

func loadBody(ctx context.Context, objectStore *media.MinIOStore, key, fallback string) (string, error) {
	if key == "" {
		return fallback, nil
	}
	reader, _, err := objectStore.Open(ctx, key)
	if err != nil {
		return "", err
	}
	defer reader.Close()
	body, err := io.ReadAll(io.LimitReader(reader, maxDocumentBytes+1))
	if err != nil {
		return "", err
	}
	if len(body) > maxDocumentBytes {
		return "", fmt.Errorf("object exceeds %d bytes", maxDocumentBytes)
	}
	return string(body), nil
}

func loadAndVerifyBody(ctx context.Context, objectStore *media.MinIOStore, key, fallback, expectedHash string, expectedSize int64) (string, error) {
	body, err := loadBody(ctx, objectStore, key, fallback)
	if err != nil {
		return "", err
	}
	if expectedSize > 0 && int64(len(body)) != expectedSize {
		return "", fmt.Errorf("object size mismatch: expected %d, got %d", expectedSize, len(body))
	}
	if expectedHash != "" {
		digest := sha256.Sum256([]byte(body))
		actual := fmt.Sprintf("%x", digest[:])
		if actual != expectedHash {
			return "", fmt.Errorf("object hash mismatch")
		}
	}
	return body, nil
}

func documentKey(kind, id string, revision int) string {
	return fmt.Sprintf("%s/%s/revisions/%06d.md", kind, id, revision)
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func fail(format string, args ...any) {
	log := slog.Default()
	log.Error("content storage command failed", "error", fmt.Sprintf(format, args...))
	os.Exit(1)
}
