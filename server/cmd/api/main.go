package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	bcAuth "github.com/bc-dev/bc-atlas-cms/server/internal/auth"
	"github.com/bc-dev/bc-atlas-cms/server/internal/domain"
	"github.com/bc-dev/bc-atlas-cms/server/internal/httpapi"
	"github.com/bc-dev/bc-atlas-cms/server/internal/media"
	"github.com/bc-dev/bc-atlas-cms/server/internal/store"
)

func main() {
	address := flag.String("addr", envOr("HTTP_ADDR", ":8080"), "HTTP listen address")
	webRoot := flag.String("web", envOr("WEB_ROOT", ""), "built frontend directory")
	flag.Parse()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	repository, closeRepository, err := repositoryFromEnvironment(ctx, logger)
	if err != nil {
		logger.Error("database startup failed", "error", err)
		return
	}
	defer closeRepository()
	if err := bootstrapAdmin(ctx, repository, logger); err != nil {
		logger.Error("admin bootstrap failed", "error", err)
		return
	}
	mediaStore, err := mediaFromEnvironment(ctx, logger)
	if err != nil {
		logger.Error("object storage startup failed", "error", err)
		return
	}

	server := &http.Server{
		Addr:              *address,
		Handler:           httpapi.New(repository, mediaStore, *webRoot, logger),
		ReadHeaderTimeout: 8 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       90 * time.Second,
	}

	go func() {
		logger.Info("server started", "address", *address, "webRoot", *webRoot)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server stopped unexpectedly", "error", err)
			stop()
		}
	}()

	<-ctx.Done()
	shutdownContext, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownContext); err != nil {
		logger.Error("graceful shutdown failed", "error", err)
	}
}

func bootstrapAdmin(ctx context.Context, repository store.Repository, logger *slog.Logger) error {
	email := os.Getenv("ADMIN_EMAIL")
	password := os.Getenv("ADMIN_PASSWORD")
	if email == "" && password == "" {
		logger.Warn("ADMIN_EMAIL and ADMIN_PASSWORD are empty; no publishing account was bootstrapped")
		return nil
	}
	normalizedEmail, err := bcAuth.NormalizeEmail(email)
	if err != nil {
		return err
	}
	hash, err := bcAuth.HashPassword(password)
	if err != nil {
		return err
	}
	displayName := envOr("ADMIN_DISPLAY_NAME", "B.C")
	if err := bcAuth.ValidateDisplayName(displayName); err != nil {
		return err
	}
	user, err := repository.EnsureAdmin(ctx, domain.UserInput{
		Email: normalizedEmail, DisplayName: displayName, Role: domain.RoleAdmin, PasswordHash: hash,
	})
	if err != nil {
		return err
	}
	logger.Info("admin account is ready", "email", user.Email)
	return nil
}

func repositoryFromEnvironment(ctx context.Context, logger *slog.Logger) (store.Repository, func(), error) {
	dsn := os.Getenv("DATABASE_DSN")
	if dsn == "" {
		logger.Warn("DATABASE_DSN is empty; using the in-memory development repository")
		return store.NewMemoryRepository(), func() {}, nil
	}

	var repository *store.MySQLRepository
	var err error
	for attempt := 1; attempt <= 30; attempt++ {
		repository, err = store.OpenMySQL(ctx, dsn)
		if err == nil {
			logger.Info("connected to MySQL")
			return repository, func() { _ = repository.Close() }, nil
		}
		logger.Warn("waiting for MySQL", "attempt", attempt, "error", err)
		select {
		case <-ctx.Done():
			return nil, func() {}, ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
	return nil, func() {}, fmt.Errorf("MySQL unavailable after retries: %w", err)
}

func mediaFromEnvironment(ctx context.Context, logger *slog.Logger) (media.Store, error) {
	endpoint := os.Getenv("S3_ENDPOINT")
	if endpoint == "" {
		logger.Warn("S3_ENDPOINT is empty; media uploads are disabled")
		return nil, nil
	}
	secure, _ := strconv.ParseBool(envOr("S3_SECURE", "false"))
	var objectStore *media.MinIOStore
	var err error
	for attempt := 1; attempt <= 20; attempt++ {
		objectStore, err = media.NewMinIOStore(
			ctx,
			endpoint,
			os.Getenv("S3_ACCESS_KEY"),
			os.Getenv("S3_SECRET_KEY"),
			envOr("S3_BUCKET", "bc-content"),
			os.Getenv("S3_PUBLIC_URL"),
			secure,
		)
		if err == nil {
			logger.Info("connected to S3-compatible storage", "endpoint", endpoint)
			return objectStore, nil
		}
		logger.Warn("waiting for S3-compatible storage", "attempt", attempt, "error", err)
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
	return nil, fmt.Errorf("S3-compatible storage unavailable after retries: %w", err)
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
