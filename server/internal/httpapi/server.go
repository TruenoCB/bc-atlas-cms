package httpapi

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/bc-dev/bc-atlas-cms/server/internal/domain"
	"github.com/bc-dev/bc-atlas-cms/server/internal/media"
	"github.com/bc-dev/bc-atlas-cms/server/internal/store"
)

type Server struct {
	repository   store.Repository
	mediaStore   media.Store
	contentStore media.ContentStore
	webRoot      string
	logger       *slog.Logger
	cookieSecure bool
}

func New(repository store.Repository, mediaStore media.Store, webRoot string, logger *slog.Logger) http.Handler {
	contentStore, _ := mediaStore.(media.ContentStore)
	server := &Server{
		repository: repository, mediaStore: mediaStore, contentStore: contentStore, webRoot: webRoot, logger: logger,
		cookieSecure: strings.EqualFold(os.Getenv("COOKIE_SECURE"), "true"),
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", server.health)
	mux.HandleFunc("/api/auth/register", server.register)
	mux.HandleFunc("/api/auth/login", server.login)
	mux.HandleFunc("/api/auth/logout", server.logout)
	mux.HandleFunc("/api/auth/me", server.me)
	mux.HandleFunc("/api/footprints", server.footprints)
	mux.HandleFunc("/api/contents", server.contents)
	mux.HandleFunc("/api/contents/", server.contentBySlug)
	mux.HandleFunc("/api/schema/tags/footprint", server.footprintSchema)
	mux.HandleFunc("/api/media", server.uploadMedia)
	mux.HandleFunc("/media/", server.serveMedia)
	mux.HandleFunc("/api/knowledge-bases", server.knowledgeBases)
	mux.HandleFunc("/api/knowledge-bases/", server.knowledgeBaseRoutes)
	mux.HandleFunc("/rss.xml", server.rss)
	mux.Handle("/", server.spa())
	return requestLogger(logger, securityHeaders(mux))
}

func (server *Server) health(writer http.ResponseWriter, request *http.Request) {
	ctx, cancel := context.WithTimeout(request.Context(), 2*time.Second)
	defer cancel()
	components := map[string]string{"database": "ok", "objectStorage": "disabled"}
	if err := server.repository.Health(ctx); err != nil {
		components["database"] = "unavailable"
		writeJSON(writer, http.StatusServiceUnavailable, map[string]any{"status": "degraded", "service": "bc-atlas-cms", "components": components})
		return
	}
	if server.mediaStore != nil {
		components["objectStorage"] = "ok"
		if err := server.mediaStore.Health(ctx); err != nil {
			components["objectStorage"] = "unavailable"
			writeJSON(writer, http.StatusServiceUnavailable, map[string]any{"status": "degraded", "service": "bc-atlas-cms", "components": components})
			return
		}
	}
	writeJSON(writer, http.StatusOK, map[string]any{"status": "ok", "service": "bc-atlas-cms", "components": components})
}

func (server *Server) footprints(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer, http.MethodGet)
		return
	}
	items, err := server.repository.ListFootprints(request.Context())
	if err != nil {
		server.internalError(writer, err)
		return
	}
	user := server.currentUser(request)
	visible := make([]domain.Content, 0, len(items))
	for _, item := range items {
		if filtered, ok := contentForList(item, user); ok {
			visible = append(visible, filtered)
		}
	}
	writeJSON(writer, http.StatusOK, map[string]any{"items": visible})
}

func (server *Server) contents(writer http.ResponseWriter, request *http.Request) {
	switch request.Method {
	case http.MethodGet:
		user := server.currentUser(request)
		status := "published"
		if requestedStatus := request.URL.Query().Get("status"); user != nil && user.CanPublish() && requestedStatus != "" {
			if requestedStatus == "all" {
				status = ""
			} else {
				status = requestedStatus
			}
		}
		items, err := server.repository.ListContents(request.Context(), domain.ContentFilter{
			Type: request.URL.Query().Get("type"), Tag: request.URL.Query().Get("tag"), Status: status, Query: request.URL.Query().Get("q"),
		})
		if err != nil {
			server.internalError(writer, err)
			return
		}
		visible := make([]domain.Content, 0, len(items))
		for _, item := range items {
			if filtered, ok := contentForList(item, user); ok {
				visible = append(visible, filtered)
			}
		}
		writeJSON(writer, http.StatusOK, map[string]any{"items": visible})
	case http.MethodPost:
		user := server.currentUser(request)
		if user == nil {
			writeError(writer, http.StatusUnauthorized, "sign in to publish")
			return
		}
		if !user.CanPublish() {
			writeError(writer, http.StatusForbidden, "editor access is required")
			return
		}
		request.Body = http.MaxBytesReader(writer, request.Body, maxDocumentBodyBytes)
		decoder := json.NewDecoder(request.Body)
		decoder.UseNumber()
		var input domain.ContentInput
		if err := decoder.Decode(&input); err != nil {
			writeError(writer, http.StatusBadRequest, "invalid JSON body")
			return
		}
		input.AuthorID = user.ID
		bodyMarkdown := input.BodyMarkdown
		input.SearchText = domain.SearchTextFromMarkdown(bodyMarkdown)
		if input.ID == "" {
			id, err := domain.NewID()
			if err != nil {
				server.internalError(writer, err)
				return
			}
			input.ID = id
		}
		if server.contentStore != nil {
			key, hash, size, cleanup, err := stageDocument(request.Context(), server.contentStore, "contents", input.ID, 1, bodyMarkdown)
			if err != nil {
				writeError(writer, http.StatusUnprocessableEntity, err.Error())
				return
			}
			input.BodyMarkdown = ""
			input.BodyObjectKey, input.BodyRevision, input.BodyHash, input.BodySize = key, 1, hash, size
			content, err := server.repository.CreateContent(request.Context(), input)
			if err != nil {
				cleanup()
				writeError(writer, http.StatusUnprocessableEntity, err.Error())
				return
			}
			content.BodyMarkdown = bodyMarkdown
			writeJSON(writer, http.StatusCreated, content)
			return
		}
		content, err := server.repository.CreateContent(request.Context(), input)
		if err != nil {
			writeError(writer, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeJSON(writer, http.StatusCreated, content)
	default:
		methodNotAllowed(writer, http.MethodGet, http.MethodPost)
	}
}

func (server *Server) contentBySlug(writer http.ResponseWriter, request *http.Request) {
	path := strings.Trim(strings.TrimPrefix(request.URL.Path, "/api/contents/"), "/")
	parts := strings.Split(path, "/")
	if len(parts) == 2 && parts[1] == "comments" {
		server.comments(writer, request, parts[0])
		return
	}
	if len(parts) != 1 || parts[0] == "" {
		writeError(writer, http.StatusNotFound, "content not found")
		return
	}
	slug := parts[0]
	switch request.Method {
	case http.MethodGet:
		server.readContent(writer, request, slug)
	case http.MethodPut:
		user := server.currentUser(request)
		if user == nil {
			writeError(writer, http.StatusUnauthorized, "sign in to edit content")
			return
		}
		if !user.CanPublish() {
			writeError(writer, http.StatusForbidden, "editor access is required")
			return
		}
		current, err := server.repository.FindBySlug(request.Context(), slug)
		if err != nil {
			writeError(writer, http.StatusNotFound, "content not found")
			return
		}
		if !canManageContent(current, user) {
			writeError(writer, http.StatusForbidden, "only the author or an administrator can edit this content")
			return
		}
		request.Body = http.MaxBytesReader(writer, request.Body, maxDocumentBodyBytes)
		decoder := json.NewDecoder(request.Body)
		decoder.UseNumber()
		var input domain.ContentInput
		if err := decoder.Decode(&input); err != nil {
			writeError(writer, http.StatusBadRequest, "invalid JSON body")
			return
		}
		bodyMarkdown := input.BodyMarkdown
		input.SearchText = domain.SearchTextFromMarkdown(bodyMarkdown)
		input.ID = current.ID
		if server.contentStore != nil {
			revision := current.BodyRevision + 1
			key, hash, size, cleanup, err := stageDocument(request.Context(), server.contentStore, "contents", current.ID, revision, bodyMarkdown)
			if err != nil {
				writeError(writer, http.StatusUnprocessableEntity, err.Error())
				return
			}
			input.BodyMarkdown = ""
			input.BodyObjectKey, input.BodyRevision, input.BodyHash, input.BodySize = key, revision, hash, size
			updated, err := server.repository.UpdateContent(request.Context(), slug, input)
			if err != nil {
				cleanup()
				writeError(writer, http.StatusUnprocessableEntity, err.Error())
				return
			}
			updated.BodyMarkdown = bodyMarkdown
			writeJSON(writer, http.StatusOK, updated)
			return
		}
		updated, err := server.repository.UpdateContent(request.Context(), slug, input)
		if err != nil {
			writeError(writer, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, updated)
	case http.MethodDelete:
		user := server.currentUser(request)
		if user == nil {
			writeError(writer, http.StatusUnauthorized, "sign in to delete content")
			return
		}
		if !user.CanPublish() {
			writeError(writer, http.StatusForbidden, "editor access is required")
			return
		}
		current, err := server.repository.FindBySlug(request.Context(), slug)
		if err != nil {
			writeError(writer, http.StatusNotFound, "content not found")
			return
		}
		if !canManageContent(current, user) {
			writeError(writer, http.StatusForbidden, "only the author or an administrator can delete this content")
			return
		}
		if err := server.repository.DeleteContent(request.Context(), slug); err != nil {
			writeError(writer, http.StatusNotFound, "content not found")
			return
		}
		writer.WriteHeader(http.StatusNoContent)
	default:
		methodNotAllowed(writer, http.MethodGet, http.MethodPut, http.MethodDelete)
	}
}

func (server *Server) readContent(writer http.ResponseWriter, request *http.Request, slug string) {
	content, err := server.repository.FindBySlug(request.Context(), slug)
	if err != nil {
		writeError(writer, http.StatusNotFound, "content not found")
		return
	}
	user := server.currentUser(request)
	if !canReadContent(content, user) {
		if content.Visibility == "members" && user == nil {
			writeError(writer, http.StatusUnauthorized, "sign in to read this article")
		} else {
			writeError(writer, http.StatusNotFound, "content not found")
		}
		return
	}
	content, err = readDocument(request.Context(), server.contentStore, content)
	if err != nil {
		server.internalError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, content)
}

func (server *Server) comments(writer http.ResponseWriter, request *http.Request, slug string) {
	content, err := server.repository.FindBySlug(request.Context(), slug)
	if err != nil {
		writeError(writer, http.StatusNotFound, "content not found")
		return
	}
	user := server.currentUser(request)
	if !canReadContent(content, user) {
		writeError(writer, http.StatusNotFound, "content not found")
		return
	}
	switch request.Method {
	case http.MethodGet:
		items, err := server.repository.ListComments(request.Context(), slug)
		if err != nil {
			server.internalError(writer, err)
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"items": items})
	case http.MethodPost:
		request.Body = http.MaxBytesReader(writer, request.Body, 16<<10)
		var input struct {
			Body              string `json:"body"`
			AuthorDisplayName string `json:"authorDisplayName"`
			Website           string `json:"website"`
		}
		if err := json.NewDecoder(request.Body).Decode(&input); err != nil {
			writeError(writer, http.StatusBadRequest, "invalid JSON body")
			return
		}
		body := strings.TrimSpace(input.Body)
		if length := utf8.RuneCountInString(body); length < 1 || length > 2000 {
			writeError(writer, http.StatusUnprocessableEntity, "comment must be between 1 and 2000 characters")
			return
		}
		if strings.TrimSpace(input.Website) != "" {
			writeError(writer, http.StatusUnprocessableEntity, "comment could not be published")
			return
		}
		userID := ""
		displayName := strings.TrimSpace(input.AuthorDisplayName)
		if user != nil {
			userID = user.ID
			displayName = user.DisplayName
		} else if length := utf8.RuneCountInString(displayName); length < 2 || length > 80 {
			writeError(writer, http.StatusUnprocessableEntity, "guest name must be between 2 and 80 characters")
			return
		}
		comment, err := server.repository.CreateComment(request.Context(), slug, userID, displayName, body)
		if err != nil {
			server.internalError(writer, err)
			return
		}
		writeJSON(writer, http.StatusCreated, comment)
	default:
		methodNotAllowed(writer, http.MethodGet, http.MethodPost)
	}
}

func (server *Server) footprintSchema(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer, http.MethodGet)
		return
	}
	writeJSON(writer, http.StatusOK, domain.FootprintSchema)
}

type rss struct {
	XMLName xml.Name   `xml:"rss"`
	Version string     `xml:"version,attr"`
	Channel rssChannel `xml:"channel"`
}

type rssChannel struct {
	Title       string    `xml:"title"`
	Link        string    `xml:"link"`
	Description string    `xml:"description"`
	Items       []rssItem `xml:"item"`
}

type rssItem struct {
	Title       string `xml:"title"`
	Link        string `xml:"link"`
	GUID        string `xml:"guid"`
	Description string `xml:"description"`
	PubDate     string `xml:"pubDate"`
}

func (server *Server) rss(writer http.ResponseWriter, request *http.Request) {
	items, err := server.repository.ListContents(request.Context(), domain.ContentFilter{Status: "published"})
	if err != nil {
		server.internalError(writer, err)
		return
	}
	baseURL := strings.TrimRight(envOr("PUBLIC_BASE_URL", "http://localhost:8080"), "/")
	feed := rss{Version: "2.0", Channel: rssChannel{Title: "B.C Field Notes", Link: baseURL, Description: "Essays, systems, and footprints."}}
	for _, item := range items {
		if item.Visibility != "public" {
			continue
		}
		link := fmt.Sprintf("%s/articles/%s", baseURL, item.Slug)
		feed.Channel.Items = append(feed.Channel.Items, rssItem{Title: item.Title, Link: link, GUID: link, Description: item.Summary, PubDate: item.PublishedAt.Format(time.RFC1123Z)})
	}
	writer.Header().Set("Content-Type", "application/rss+xml; charset=utf-8")
	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write([]byte(xml.Header))
	_ = xml.NewEncoder(writer).Encode(feed)
}

func (server *Server) spa() http.Handler {
	if server.webRoot == "" {
		return http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
			writeError(writer, http.StatusNotFound, "frontend is served by Vite in development")
		})
	}
	files := http.FileServer(http.Dir(server.webRoot))
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		clean := filepath.Clean(strings.TrimPrefix(request.URL.Path, "/"))
		if clean == "." {
			clean = "index.html"
		}
		candidate := filepath.Join(server.webRoot, clean)
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			files.ServeHTTP(writer, request)
			return
		}
		http.ServeFile(writer, request, filepath.Join(server.webRoot, "index.html"))
	})
}

func (server *Server) internalError(writer http.ResponseWriter, err error) {
	server.logger.Error("request failed", "error", err)
	writeError(writer, http.StatusInternalServerError, "internal server error")
}

func writeJSON(writer http.ResponseWriter, status int, value any) {
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(value)
}

func canReadContent(content domain.Content, user *domain.User) bool {
	if content.Status != "published" {
		return canManageContent(content, user)
	}
	switch content.Visibility {
	case "public":
		return true
	case "members":
		return user != nil
	case "private":
		return user != nil && (user.Role == domain.RoleAdmin || content.AuthorID == user.ID)
	default:
		return false
	}
}

func canManageContent(content domain.Content, user *domain.User) bool {
	return user != nil && (user.Role == domain.RoleAdmin || (user.Role == domain.RoleEditor && content.AuthorID == user.ID))
}

func contentForList(content domain.Content, user *domain.User) (domain.Content, bool) {
	if canReadContent(content, user) {
		return content, true
	}
	if content.Visibility == "members" && user == nil {
		content.BodyMarkdown = ""
		content.AuthorID = ""
		content.Locked = true
		return content, true
	}
	return domain.Content{}, false
}

func writeError(writer http.ResponseWriter, status int, message string) {
	writeJSON(writer, status, map[string]string{"error": message})
}

func methodNotAllowed(writer http.ResponseWriter, methods ...string) {
	writer.Header().Set("Allow", strings.Join(methods, ", "))
	writeError(writer, http.StatusMethodNotAllowed, "method not allowed")
}

func requestLogger(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		started := time.Now()
		next.ServeHTTP(writer, request)
		logger.Info("request", "method", request.Method, "path", request.URL.Path, "duration", time.Since(started))
	})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("X-Content-Type-Options", "nosniff")
		writer.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		writer.Header().Set("X-Frame-Options", "DENY")
		writer.Header().Set("Content-Security-Policy", "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self'; frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com https://player.bilibili.com")
		next.ServeHTTP(writer, request)
	})
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
