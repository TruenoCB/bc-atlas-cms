package httpapi

import (
	"context"
	"crypto/sha256"
	"fmt"
	"io"
	"strings"

	"github.com/bc-dev/bc-atlas-cms/server/internal/domain"
	"github.com/bc-dev/bc-atlas-cms/server/internal/media"
)

const maxDocumentBodyBytes = 16 << 20

func documentObjectKey(kind, id string, revision int) string {
	if revision < 1 {
		revision = 1
	}
	return fmt.Sprintf("%s/%s/revisions/%06d.md", kind, id, revision)
}

func stageDocument(ctx context.Context, contentStore media.ContentStore, kind, id string, revision int, markdown string) (key, hash string, size int64, cleanup func(), err error) {
	if contentStore == nil {
		return "", "", 0, func() {}, nil
	}
	if int64(len(markdown)) > maxDocumentBodyBytes {
		return "", "", 0, nil, fmt.Errorf("document body exceeds %d bytes", maxDocumentBodyBytes)
	}
	key = documentObjectKey(kind, id, revision)
	digest := sha256.Sum256([]byte(markdown))
	hash = fmt.Sprintf("%x", digest[:])
	size = int64(len(markdown))
	_, err = contentStore.PutContent(ctx, key, "text/markdown; charset=utf-8", size, strings.NewReader(markdown), map[string]string{
		"document-kind": kind,
		"document-id":   id,
		"revision":      fmt.Sprintf("%d", revision),
	})
	if err != nil {
		return "", "", 0, nil, err
	}
	cleanup = func() { _ = contentStore.Delete(context.Background(), key) }
	return key, hash, size, cleanup, nil
}

func readDocument(ctx context.Context, contentStore media.ContentStore, content domain.Content) (domain.Content, error) {
	if content.BodyObjectKey == "" {
		return content, nil
	}
	if contentStore == nil {
		return content, fmt.Errorf("content object storage is unavailable")
	}
	reader, object, err := contentStore.Open(ctx, content.BodyObjectKey)
	if err != nil {
		return content, err
	}
	defer reader.Close()
	body, err := io.ReadAll(io.LimitReader(reader, maxDocumentBodyBytes+1))
	if err != nil {
		return content, err
	}
	if len(body) > maxDocumentBodyBytes {
		return content, fmt.Errorf("content object exceeds %d bytes", maxDocumentBodyBytes)
	}
	if content.BodySize > 0 && int64(len(body)) != content.BodySize {
		return content, fmt.Errorf("content object size mismatch")
	}
	if content.BodyHash != "" {
		digest := sha256.Sum256(body)
		if fmt.Sprintf("%x", digest[:]) != content.BodyHash {
			return content, fmt.Errorf("content object hash mismatch")
		}
	}
	content.BodyMarkdown = string(body)
	if content.BodySize == 0 {
		content.BodySize = object.Size
	}
	return content, nil
}

func readKnowledgeDocument(ctx context.Context, contentStore media.ContentStore, page domain.KnowledgePage) (domain.KnowledgePage, error) {
	if page.BodyObjectKey == "" {
		return page, nil
	}
	if contentStore == nil {
		return page, fmt.Errorf("content object storage is unavailable")
	}
	reader, object, err := contentStore.Open(ctx, page.BodyObjectKey)
	if err != nil {
		return page, err
	}
	defer reader.Close()
	body, err := io.ReadAll(io.LimitReader(reader, maxDocumentBodyBytes+1))
	if err != nil {
		return page, err
	}
	if len(body) > maxDocumentBodyBytes {
		return page, fmt.Errorf("knowledge document exceeds %d bytes", maxDocumentBodyBytes)
	}
	if page.BodySize > 0 && int64(len(body)) != page.BodySize {
		return page, fmt.Errorf("knowledge object size mismatch")
	}
	if page.BodyHash != "" {
		digest := sha256.Sum256(body)
		if fmt.Sprintf("%x", digest[:]) != page.BodyHash {
			return page, fmt.Errorf("knowledge object hash mismatch")
		}
	}
	page.BodyMarkdown = string(body)
	if page.BodySize == 0 {
		page.BodySize = object.Size
	}
	return page, nil
}
