package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	bcAuth "github.com/bc-dev/bc-atlas-cms/server/internal/auth"
	"github.com/bc-dev/bc-atlas-cms/server/internal/domain"
	"github.com/bc-dev/bc-atlas-cms/server/internal/store"
)

const sessionLifetime = 30 * 24 * time.Hour

type credentialsInput struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"displayName"`
}

func (server *Server) register(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer, http.MethodPost)
		return
	}
	input, ok := readCredentials(writer, request)
	if !ok {
		return
	}
	email, err := bcAuth.NormalizeEmail(input.Email)
	if err != nil {
		writeError(writer, http.StatusUnprocessableEntity, err.Error())
		return
	}
	displayName := strings.TrimSpace(input.DisplayName)
	if err := bcAuth.ValidateDisplayName(displayName); err != nil {
		writeError(writer, http.StatusUnprocessableEntity, err.Error())
		return
	}
	hash, err := bcAuth.HashPassword(input.Password)
	if err != nil {
		writeError(writer, http.StatusUnprocessableEntity, err.Error())
		return
	}
	user, err := server.repository.CreateUser(request.Context(), domain.UserInput{
		Email: email, DisplayName: displayName, Role: domain.RoleMember, PasswordHash: hash,
	})
	if errors.Is(err, store.ErrConflict) {
		writeError(writer, http.StatusConflict, "an account already exists for this email")
		return
	}
	if err != nil {
		server.internalError(writer, err)
		return
	}
	server.issueSession(writer, request, user, http.StatusCreated)
}

func (server *Server) login(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer, http.MethodPost)
		return
	}
	input, ok := readCredentials(writer, request)
	if !ok {
		return
	}
	email, err := bcAuth.NormalizeEmail(input.Email)
	if err != nil {
		writeError(writer, http.StatusUnauthorized, "email or password is incorrect")
		return
	}
	user, err := server.repository.FindUserByEmail(request.Context(), email)
	if err != nil || !bcAuth.CheckPassword(user.PasswordHash, input.Password) {
		writeError(writer, http.StatusUnauthorized, "email or password is incorrect")
		return
	}
	server.issueSession(writer, request, user, http.StatusOK)
}

func (server *Server) logout(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer, http.MethodPost)
		return
	}
	if cookie, err := request.Cookie(bcAuth.SessionCookieName); err == nil {
		_ = server.repository.DeleteSession(request.Context(), bcAuth.HashSessionToken(cookie.Value))
	}
	server.setSessionCookie(writer, "", time.Unix(0, 0), -1)
	writer.WriteHeader(http.StatusNoContent)
}

func (server *Server) me(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer, http.MethodGet)
		return
	}
	writer.Header().Set("Cache-Control", "no-store")
	writeJSON(writer, http.StatusOK, map[string]any{"user": server.currentUser(request)})
}

func readCredentials(writer http.ResponseWriter, request *http.Request) (credentialsInput, bool) {
	request.Body = http.MaxBytesReader(writer, request.Body, 64<<10)
	var input credentialsInput
	if err := json.NewDecoder(request.Body).Decode(&input); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid JSON body")
		return credentialsInput{}, false
	}
	return input, true
}

func (server *Server) issueSession(writer http.ResponseWriter, request *http.Request, user domain.User, status int) {
	rawToken, tokenHash, err := bcAuth.NewSessionToken()
	if err != nil {
		server.internalError(writer, err)
		return
	}
	id, err := domain.NewID()
	if err != nil {
		server.internalError(writer, err)
		return
	}
	now := time.Now().UTC()
	expires := now.Add(sessionLifetime)
	if err := server.repository.CreateSession(request.Context(), domain.Session{
		ID: id, UserID: user.ID, TokenHash: tokenHash, ExpiresAt: expires, CreatedAt: now,
	}); err != nil {
		server.internalError(writer, err)
		return
	}
	server.setSessionCookie(writer, rawToken, expires, int(sessionLifetime.Seconds()))
	writer.Header().Set("Cache-Control", "no-store")
	writeJSON(writer, status, map[string]any{"user": user})
}

func (server *Server) setSessionCookie(writer http.ResponseWriter, value string, expires time.Time, maxAge int) {
	http.SetCookie(writer, &http.Cookie{
		Name: bcAuth.SessionCookieName, Value: value, Path: "/", HttpOnly: true,
		Secure: server.cookieSecure, SameSite: http.SameSiteLaxMode, Expires: expires, MaxAge: maxAge,
	})
}

func (server *Server) currentUser(request *http.Request) *domain.User {
	cookie, err := request.Cookie(bcAuth.SessionCookieName)
	if err != nil || cookie.Value == "" {
		return nil
	}
	user, err := server.repository.FindUserBySessionHash(request.Context(), bcAuth.HashSessionToken(cookie.Value), time.Now().UTC())
	if err != nil {
		if !errors.Is(err, store.ErrNotFound) {
			server.logger.Warn("session lookup failed", "error", err)
		}
		return nil
	}
	user.PasswordHash = nil
	return &user
}
