package media

import (
	"context"
	"fmt"
	"io"
	"mime/multipart"
	"path/filepath"
	"strings"
	"time"

	"github.com/bc-dev/bc-atlas-cms/server/internal/domain"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type Object struct {
	ID          string    `json:"id"`
	Key         string    `json:"key"`
	Bucket      string    `json:"bucket"`
	Name        string    `json:"name"`
	ContentType string    `json:"contentType"`
	Size        int64     `json:"size"`
	URL         string    `json:"url,omitempty"`
	ModifiedAt  time.Time `json:"-"`
}

type ReadSeekCloser interface {
	io.Reader
	io.Seeker
	io.Closer
}

type Store interface {
	Health(context.Context) error
	Put(context.Context, *multipart.FileHeader, io.Reader) (Object, error)
	Open(context.Context, string) (ReadSeekCloser, Object, error)
	Delete(context.Context, string) error
}

// ContentStore is the private object boundary for Markdown/HTML documents.
// It deliberately uses explicit keys so article revisions are immutable and
// can be copied between S3-compatible providers without database changes.
type ContentStore interface {
	PutContent(context.Context, string, string, int64, io.Reader, map[string]string) (Object, error)
	Open(context.Context, string) (ReadSeekCloser, Object, error)
	Delete(context.Context, string) error
}

func (store *MinIOStore) Health(ctx context.Context) error {
	_, err := store.client.BucketExists(ctx, store.bucket)
	return err
}

type MinIOStore struct {
	client    *minio.Client
	bucket    string
	publicURL string
}

func NewMinIOStore(ctx context.Context, endpoint, accessKey, secretKey, bucket, publicURL string, secure bool) (*MinIOStore, error) {
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: secure,
	})
	if err != nil {
		return nil, err
	}
	exists, err := client.BucketExists(ctx, bucket)
	if err != nil {
		return nil, err
	}
	if !exists {
		if err := client.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, err
		}
	}
	return &MinIOStore{client: client, bucket: bucket, publicURL: strings.TrimRight(publicURL, "/")}, nil
}

func (store *MinIOStore) Put(ctx context.Context, header *multipart.FileHeader, source io.Reader) (Object, error) {
	id, err := domain.NewID()
	if err != nil {
		return Object{}, err
	}
	createdAt := time.Now().UTC()
	cleanName := filepath.Base(header.Filename)
	extension := strings.ToLower(filepath.Ext(cleanName))
	if len(extension) > 16 {
		extension = ""
	}
	key := fmt.Sprintf("%s/%s%s", createdAt.Format("2006/01"), id, extension)
	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	object, err := store.PutContent(ctx, key, contentType, header.Size, source, map[string]string{"original-name": cleanName})
	if err != nil {
		return Object{}, err
	}
	object.ID = id
	object.Name = cleanName
	object.ModifiedAt = createdAt
	if store.publicURL != "" {
		if strings.HasPrefix(store.publicURL, "/") {
			object.URL = fmt.Sprintf("%s/%s", store.publicURL, key)
		} else {
			object.URL = fmt.Sprintf("%s/%s/%s", store.publicURL, store.bucket, key)
		}
	}
	return object, nil
}

func (store *MinIOStore) PutContent(ctx context.Context, key, contentType string, size int64, source io.Reader, metadata map[string]string) (Object, error) {
	if strings.TrimSpace(key) == "" {
		return Object{}, fmt.Errorf("content object key is required")
	}
	if contentType == "" {
		contentType = "text/markdown; charset=utf-8"
	}
	info, err := store.client.PutObject(ctx, store.bucket, key, source, size, minio.PutObjectOptions{
		ContentType:  contentType,
		UserMetadata: metadata,
	})
	if err != nil {
		return Object{}, err
	}
	return Object{Key: key, Bucket: store.bucket, ContentType: contentType, Size: info.Size, ModifiedAt: time.Now().UTC()}, nil
}

func (store *MinIOStore) Open(ctx context.Context, key string) (ReadSeekCloser, Object, error) {
	object, err := store.client.GetObject(ctx, store.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, Object{}, err
	}
	info, err := object.Stat()
	if err != nil {
		_ = object.Close()
		return nil, Object{}, err
	}
	name := info.UserMetadata["X-Amz-Meta-Original-Name"]
	if name == "" {
		name = info.UserMetadata["Original-Name"]
	}
	if name == "" {
		name = filepath.Base(key)
	}
	return object, Object{
		Key: key, Bucket: store.bucket, Name: name, ContentType: info.ContentType,
		Size: info.Size, ModifiedAt: info.LastModified,
	}, nil
}

func (store *MinIOStore) Delete(ctx context.Context, key string) error {
	return store.client.RemoveObject(ctx, store.bucket, key, minio.RemoveObjectOptions{})
}
