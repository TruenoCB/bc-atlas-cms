package store

import (
	"context"
	"errors"
	"time"

	"github.com/bc-dev/bc-atlas-cms/server/internal/domain"
)

var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("conflict")
)

type Repository interface {
	Health(context.Context) error
	ListContents(context.Context, domain.ContentFilter) ([]domain.Content, error)
	ListFootprints(context.Context) ([]domain.Content, error)
	CreateContent(context.Context, domain.ContentInput) (domain.Content, error)
	UpdateContent(context.Context, string, domain.ContentInput) (domain.Content, error)
	DeleteContent(context.Context, string) error
	FindBySlug(context.Context, string) (domain.Content, error)
	CreateComment(context.Context, string, string, string, string) (domain.Comment, error)
	ListComments(context.Context, string) ([]domain.Comment, error)
	CreateMediaObject(context.Context, domain.MediaObject) error
	ListMediaObjects(context.Context, domain.MediaFilter) ([]domain.MediaObject, error)
	CountMediaObjects(context.Context, domain.MediaFilter) (int, error)
	FindMediaObject(context.Context, string) (domain.MediaObject, error)
	DeleteMediaObject(context.Context, string) error
	ListKnowledgeBases(context.Context) ([]domain.KnowledgeBase, error)
	FindKnowledgeBase(context.Context, string) (domain.KnowledgeBase, error)
	CreateKnowledgeBase(context.Context, domain.KnowledgeBaseInput) (domain.KnowledgeBase, error)
	UpdateKnowledgeBase(context.Context, string, domain.KnowledgeBaseInput) (domain.KnowledgeBase, error)
	DeleteKnowledgeBase(context.Context, string) error
	ListKnowledgePages(context.Context, string) ([]domain.KnowledgePage, error)
	FindKnowledgePage(context.Context, string, string) (domain.KnowledgePage, error)
	CreateKnowledgePage(context.Context, string, domain.KnowledgePageInput) (domain.KnowledgePage, error)
	UpdateKnowledgePage(context.Context, string, string, domain.KnowledgePageInput) (domain.KnowledgePage, error)
	DeleteKnowledgePage(context.Context, string, string) error
	CreateUser(context.Context, domain.UserInput) (domain.User, error)
	EnsureAdmin(context.Context, domain.UserInput) (domain.User, error)
	FindUserByEmail(context.Context, string) (domain.User, error)
	CreateSession(context.Context, domain.Session) error
	FindUserBySessionHash(context.Context, string, time.Time) (domain.User, error)
	DeleteSession(context.Context, string) error
}
