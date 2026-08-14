package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/bc-dev/bc-atlas-cms/server/internal/domain"
	"github.com/bc-dev/bc-atlas-cms/server/internal/store"
)

func (server *Server) knowledgeBases(writer http.ResponseWriter, request *http.Request) {
	switch request.Method {
	case http.MethodGet:
		items, err := server.repository.ListKnowledgeBases(request.Context())
		if err != nil {
			server.internalError(writer, err)
			return
		}
		user := server.currentUser(request)
		visible := make([]domain.KnowledgeBase, 0, len(items))
		for _, item := range items {
			if item.Visibility == "public" || (item.Visibility == "members" && user != nil) || (item.Visibility == "private" && user != nil && user.CanPublish()) {
				visible = append(visible, item)
			}
		}
		writeJSON(writer, http.StatusOK, map[string]any{"items": visible})
	case http.MethodPost:
		user := server.currentUser(request)
		if user == nil || !user.CanPublish() {
			writeError(writer, http.StatusForbidden, "editor access is required")
			return
		}
		request.Body = http.MaxBytesReader(writer, request.Body, 128<<10)
		var input domain.KnowledgeBaseInput
		if err := json.NewDecoder(request.Body).Decode(&input); err != nil {
			writeError(writer, http.StatusBadRequest, "invalid JSON body")
			return
		}
		created, err := server.repository.CreateKnowledgeBase(request.Context(), input)
		if err != nil {
			writeError(writer, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeJSON(writer, http.StatusCreated, created)
	default:
		methodNotAllowed(writer, http.MethodGet, http.MethodPost)
	}
}

func (server *Server) knowledgeBaseRoutes(writer http.ResponseWriter, request *http.Request) {
	path := strings.Trim(strings.TrimPrefix(request.URL.Path, "/api/knowledge-bases/"), "/")
	parts := strings.Split(path, "/")
	if len(parts) < 2 || parts[0] == "" || parts[1] != "pages" {
		writeError(writer, http.StatusNotFound, "knowledge resource not found")
		return
	}
	baseSlug := parts[0]
	if len(parts) == 2 {
		server.knowledgePages(writer, request, baseSlug)
		return
	}
	if len(parts) == 3 && parts[2] != "" {
		server.knowledgePage(writer, request, baseSlug, parts[2])
		return
	}
	writeError(writer, http.StatusNotFound, "knowledge resource not found")
}

func (server *Server) knowledgePages(writer http.ResponseWriter, request *http.Request, baseSlug string) {
	switch request.Method {
	case http.MethodGet:
		user := server.currentUser(request)
		if !server.canReadKnowledgeBase(request, baseSlug, user) {
			writeError(writer, http.StatusNotFound, "knowledge base not found")
			return
		}
		items, err := server.repository.ListKnowledgePages(request.Context(), baseSlug)
		if err != nil {
			if errors.Is(err, store.ErrNotFound) {
				writeError(writer, http.StatusNotFound, "knowledge base not found")
				return
			}
			server.internalError(writer, err)
			return
		}
		visible := make([]domain.KnowledgePage, 0, len(items))
		for _, item := range items {
			if item.Status != "published" && !canManageKnowledgePage(item, user) {
				continue
			}
			if item.Visibility == "private" && !canManageKnowledgePage(item, user) {
				continue
			}
			if item.Visibility == "members" && user == nil {
				item.BodyMarkdown = ""
				item.Locked = true
			}
			visible = append(visible, item)
		}
		writeJSON(writer, http.StatusOK, map[string]any{"items": visible})
	case http.MethodPost:
		user := server.currentUser(request)
		if user == nil || !user.CanPublish() {
			writeError(writer, http.StatusForbidden, "editor access is required")
			return
		}
		input, ok := decodeKnowledgePageInput(writer, request)
		if !ok {
			return
		}
		input.AuthorID = user.ID
		created, err := server.repository.CreateKnowledgePage(request.Context(), baseSlug, input)
		if err != nil {
			writeError(writer, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeJSON(writer, http.StatusCreated, created)
	default:
		methodNotAllowed(writer, http.MethodGet, http.MethodPost)
	}
}

func (server *Server) canReadKnowledgeBase(request *http.Request, baseSlug string, user *domain.User) bool {
	items, err := server.repository.ListKnowledgeBases(request.Context())
	if err != nil {
		return false
	}
	for _, item := range items {
		if item.Slug != baseSlug {
			continue
		}
		return item.Visibility == "public" || (item.Visibility == "members" && user != nil) || (item.Visibility == "private" && user != nil && user.CanPublish())
	}
	return false
}

func (server *Server) knowledgePage(writer http.ResponseWriter, request *http.Request, baseSlug, pageSlug string) {
	if request.Method == http.MethodGet {
		item, err := server.repository.FindKnowledgePage(request.Context(), baseSlug, pageSlug)
		if err != nil {
			writeError(writer, http.StatusNotFound, "knowledge page not found")
			return
		}
		user := server.currentUser(request)
		if item.Status != "published" && !canManageKnowledgePage(item, user) {
			writeError(writer, http.StatusNotFound, "knowledge page not found")
			return
		}
		if item.Visibility == "members" && user == nil {
			writeError(writer, http.StatusUnauthorized, "sign in to read this knowledge page")
			return
		}
		if item.Visibility == "private" && !canManageKnowledgePage(item, user) {
			writeError(writer, http.StatusNotFound, "knowledge page not found")
			return
		}
		writeJSON(writer, http.StatusOK, item)
		return
	}
	user := server.currentUser(request)
	if user == nil || !user.CanPublish() {
		writeError(writer, http.StatusForbidden, "editor access is required")
		return
	}
	switch request.Method {
	case http.MethodPut:
		current, err := server.repository.FindKnowledgePage(request.Context(), baseSlug, pageSlug)
		if err != nil {
			writeError(writer, http.StatusNotFound, "knowledge page not found")
			return
		}
		if !canManageKnowledgePage(current, user) {
			writeError(writer, http.StatusForbidden, "only the author or an administrator can edit this page")
			return
		}
		input, ok := decodeKnowledgePageInput(writer, request)
		if !ok {
			return
		}
		input.AuthorID = user.ID
		updated, err := server.repository.UpdateKnowledgePage(request.Context(), baseSlug, pageSlug, input)
		if err != nil {
			writeError(writer, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeJSON(writer, http.StatusOK, updated)
	case http.MethodDelete:
		current, err := server.repository.FindKnowledgePage(request.Context(), baseSlug, pageSlug)
		if err != nil {
			writeError(writer, http.StatusNotFound, "knowledge page not found")
			return
		}
		if !canManageKnowledgePage(current, user) {
			writeError(writer, http.StatusForbidden, "only the author or an administrator can delete this page")
			return
		}
		if err := server.repository.DeleteKnowledgePage(request.Context(), baseSlug, pageSlug); err != nil {
			if errors.Is(err, store.ErrConflict) {
				writeError(writer, http.StatusConflict, "move or delete child pages first")
				return
			}
			writeError(writer, http.StatusNotFound, "knowledge page not found")
			return
		}
		writer.WriteHeader(http.StatusNoContent)
	default:
		methodNotAllowed(writer, http.MethodGet, http.MethodPut, http.MethodDelete)
	}
}

func canManageKnowledgePage(page domain.KnowledgePage, user *domain.User) bool {
	return user != nil && (user.Role == domain.RoleAdmin || (user.Role == domain.RoleEditor && page.AuthorID == user.ID))
}

func decodeKnowledgePageInput(writer http.ResponseWriter, request *http.Request) (domain.KnowledgePageInput, bool) {
	request.Body = http.MaxBytesReader(writer, request.Body, 4<<20)
	var input domain.KnowledgePageInput
	if err := json.NewDecoder(request.Body).Decode(&input); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid JSON body")
		return input, false
	}
	return input, true
}
