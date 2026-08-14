package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	bcAuth "github.com/bc-dev/bc-atlas-cms/server/internal/auth"
	"github.com/bc-dev/bc-atlas-cms/server/internal/domain"
	bcMedia "github.com/bc-dev/bc-atlas-cms/server/internal/media"
	"github.com/bc-dev/bc-atlas-cms/server/internal/store"
)

func TestMembershipVisibilityPublishingAndKnowledge(t *testing.T) {
	repository := store.NewMemoryRepository()
	adminHash, err := bcAuth.HashPassword("admin-password-for-tests")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repository.EnsureAdmin(context.Background(), domain.UserInput{
		Email: "owner@bc.test", DisplayName: "B.C", Role: domain.RoleAdmin, PasswordHash: adminHash,
	}); err != nil {
		t.Fatal(err)
	}
	editorHash, err := bcAuth.HashPassword("editor-password-for-tests")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repository.CreateUser(context.Background(), domain.UserInput{
		Email: "editor@bc.test", DisplayName: "Editor", Role: domain.RoleEditor, PasswordHash: editorHash,
	}); err != nil {
		t.Fatal(err)
	}
	handler := New(repository, nil, "", slog.New(slog.NewTextHandler(io.Discard, nil)))

	guestFootprints := performJSON(t, handler, http.MethodGet, "/api/footprints", nil, nil)
	if guestFootprints.Code != http.StatusOK {
		t.Fatalf("guest footprints status = %d", guestFootprints.Code)
	}
	var footprintPayload struct {
		Items []domain.Content `json:"items"`
	}
	decodeResponse(t, guestFootprints, &footprintPayload)
	var lockedParis bool
	for _, item := range footprintPayload.Items {
		if item.Slug == "field-note-paris" {
			lockedParis = item.Locked && item.BodyMarkdown == ""
		}
	}
	if !lockedParis {
		t.Fatal("expected member-only Paris field note to be present as a locked teaser")
	}

	guestComment := performJSON(t, handler, http.MethodPost, "/api/contents/building-calm-systems/comments", map[string]any{
		"authorDisplayName": "Guest Builder", "body": "The public recovery path is clear.",
	}, nil)
	if guestComment.Code != http.StatusCreated {
		t.Fatalf("guest comment status = %d, body = %s", guestComment.Code, guestComment.Body.String())
	}
	var createdGuestComment domain.Comment
	decodeResponse(t, guestComment, &createdGuestComment)
	if createdGuestComment.UserID != "" || createdGuestComment.AuthorDisplayName != "Guest Builder" {
		t.Fatalf("unexpected guest comment: %#v", createdGuestComment)
	}

	protected := performJSON(t, handler, http.MethodGet, "/api/contents/field-note-paris", nil, nil)
	if protected.Code != http.StatusUnauthorized {
		t.Fatalf("guest member article status = %d, want 401", protected.Code)
	}

	registration := performJSON(t, handler, http.MethodPost, "/api/auth/register", map[string]any{
		"displayName": "Reader One", "email": "reader@example.com", "password": "reader-password-123",
	}, nil)
	if registration.Code != http.StatusCreated {
		t.Fatalf("registration status = %d, body = %s", registration.Code, registration.Body.String())
	}
	memberCookie := sessionCookie(t, registration)

	memberArticle := performJSON(t, handler, http.MethodGet, "/api/contents/field-note-paris", nil, memberCookie)
	if memberArticle.Code != http.StatusOK {
		t.Fatalf("member article status = %d, body = %s", memberArticle.Code, memberArticle.Body.String())
	}
	var paris domain.Content
	decodeResponse(t, memberArticle, &paris)
	if paris.BodyMarkdown == "" {
		t.Fatal("member article body was not returned after authentication")
	}
	commentPost := performJSON(t, handler, http.MethodPost, "/api/contents/field-note-paris/comments", map[string]any{
		"body": "The recovery path is the useful part.",
	}, memberCookie)
	if commentPost.Code != http.StatusCreated {
		t.Fatalf("comment status = %d, body = %s", commentPost.Code, commentPost.Body.String())
	}
	commentList := performJSON(t, handler, http.MethodGet, "/api/contents/field-note-paris/comments", nil, memberCookie)
	var comments struct {
		Items []domain.Comment `json:"items"`
	}
	decodeResponse(t, commentList, &comments)
	if len(comments.Items) != 1 || comments.Items[0].AuthorDisplayName != "Reader One" {
		t.Fatalf("unexpected comments: %#v", comments.Items)
	}

	memberPublish := performJSON(t, handler, http.MethodPost, "/api/contents", footprintInput("member-cannot-publish"), memberCookie)
	if memberPublish.Code != http.StatusForbidden {
		t.Fatalf("member publish status = %d, want 403", memberPublish.Code)
	}

	adminLogin := performJSON(t, handler, http.MethodPost, "/api/auth/login", map[string]any{
		"email": "owner@bc.test", "password": "admin-password-for-tests",
	}, nil)
	if adminLogin.Code != http.StatusOK {
		t.Fatalf("admin login status = %d, body = %s", adminLogin.Code, adminLogin.Body.String())
	}
	adminCookie := sessionCookie(t, adminLogin)
	knowledgeList := performJSON(t, handler, http.MethodGet, "/api/knowledge-bases", nil, nil)
	if knowledgeList.Code != http.StatusOK {
		t.Fatalf("knowledge bases status = %d, body = %s", knowledgeList.Code, knowledgeList.Body.String())
	}
	pageCreate := performJSON(t, handler, http.MethodPost, "/api/knowledge-bases/systems-field-manual/pages", map[string]any{
		"parentId": "kp-calm-root", "slug": "recovery-paths", "title": "Recovery paths", "summary": "Make recovery visible.",
		"bodyMarkdown": "# Recovery paths\n\nA child knowledge page.", "position": 20, "status": "published", "visibility": "public",
	}, adminCookie)
	if pageCreate.Code != http.StatusCreated {
		t.Fatalf("knowledge page status = %d, body = %s", pageCreate.Code, pageCreate.Body.String())
	}
	pageRead := performJSON(t, handler, http.MethodGet, "/api/knowledge-bases/systems-field-manual/pages/recovery-paths", nil, nil)
	if pageRead.Code != http.StatusOK {
		t.Fatalf("knowledge page read status = %d, body = %s", pageRead.Code, pageRead.Body.String())
	}
	adminPublish := performJSON(t, handler, http.MethodPost, "/api/contents", footprintInput("admin-published-footprint"), adminCookie)
	if adminPublish.Code != http.StatusCreated {
		t.Fatalf("admin publish status = %d, body = %s", adminPublish.Code, adminPublish.Body.String())
	}
	var created domain.Content
	decodeResponse(t, adminPublish, &created)
	if created.AuthorID == "" {
		t.Fatal("published content is missing its authenticated author id")
	}

	editorLogin := performJSON(t, handler, http.MethodPost, "/api/auth/login", map[string]any{
		"email": "editor@bc.test", "password": "editor-password-for-tests",
	}, nil)
	if editorLogin.Code != http.StatusOK {
		t.Fatalf("editor login status = %d, body = %s", editorLogin.Code, editorLogin.Body.String())
	}
	editorCookie := sessionCookie(t, editorLogin)
	draftInput := map[string]any{
		"type": "article", "slug": "editor-private-draft", "title": "Editor draft", "summary": "Not published yet.",
		"bodyMarkdown": "# Draft\n\nStill being edited.", "status": "draft", "visibility": "public",
		"tags": []map[string]any{{"slug": "systems", "name": "Systems", "properties": map[string]any{}}},
	}
	draftCreate := performJSON(t, handler, http.MethodPost, "/api/contents", draftInput, editorCookie)
	if draftCreate.Code != http.StatusCreated {
		t.Fatalf("draft create status = %d, body = %s", draftCreate.Code, draftCreate.Body.String())
	}
	guestDraft := performJSON(t, handler, http.MethodGet, "/api/contents/editor-private-draft", nil, nil)
	if guestDraft.Code != http.StatusNotFound {
		t.Fatalf("guest draft status = %d, want 404", guestDraft.Code)
	}
	editorDraft := performJSON(t, handler, http.MethodGet, "/api/contents/editor-private-draft", nil, editorCookie)
	if editorDraft.Code != http.StatusOK {
		t.Fatalf("author draft status = %d, body = %s", editorDraft.Code, editorDraft.Body.String())
	}
	adminAll := performJSON(t, handler, http.MethodGet, "/api/contents?status=all", nil, adminCookie)
	var adminAllPayload struct {
		Items []domain.Content `json:"items"`
	}
	decodeResponse(t, adminAll, &adminAllPayload)
	var foundDraft bool
	for _, item := range adminAllPayload.Items {
		foundDraft = foundDraft || item.Slug == "editor-private-draft"
	}
	if !foundDraft {
		t.Fatal("administrator status=all view did not include the editor draft")
	}
	guestAll := performJSON(t, handler, http.MethodGet, "/api/contents?status=all", nil, nil)
	var guestAllPayload struct {
		Items []domain.Content `json:"items"`
	}
	decodeResponse(t, guestAll, &guestAllPayload)
	for _, item := range guestAllPayload.Items {
		if item.Slug == "editor-private-draft" {
			t.Fatal("guest status=all request leaked a draft")
		}
	}
	forbiddenEdit := performJSON(t, handler, http.MethodPut, "/api/contents/admin-published-footprint", footprintInput("admin-published-footprint"), editorCookie)
	if forbiddenEdit.Code != http.StatusForbidden {
		t.Fatalf("editor modifying another author status = %d, want 403", forbiddenEdit.Code)
	}
	draftInput["status"] = "published"
	draftPublish := performJSON(t, handler, http.MethodPut, "/api/contents/editor-private-draft", draftInput, editorCookie)
	if draftPublish.Code != http.StatusOK {
		t.Fatalf("editor publishing own draft status = %d, body = %s", draftPublish.Code, draftPublish.Body.String())
	}

	thoughtInput := map[string]any{
		"type": "thought", "slug": "test-short-thought", "title": "A short thought", "summary": "Small enough to keep.",
		"bodyMarkdown": "Visible systems invite useful questions.", "status": "published", "visibility": "public",
		"tags": []map[string]any{{"slug": "systems", "name": "Systems", "properties": map[string]any{}}},
	}
	thoughtPublish := performJSON(t, handler, http.MethodPost, "/api/contents", thoughtInput, adminCookie)
	if thoughtPublish.Code != http.StatusCreated {
		t.Fatalf("thought publish status = %d, body = %s", thoughtPublish.Code, thoughtPublish.Body.String())
	}
	thoughtList := performJSON(t, handler, http.MethodGet, "/api/contents?type=thought", nil, nil)
	var thoughtPayload struct {
		Items []domain.Content `json:"items"`
	}
	decodeResponse(t, thoughtList, &thoughtPayload)
	if len(thoughtPayload.Items) < 2 {
		t.Fatalf("thought list did not include seeded and published thoughts: %#v", thoughtPayload.Items)
	}
	searchList := performJSON(t, handler, http.MethodGet, "/api/contents?type=article&q=retrieval", nil, nil)
	var searchPayload struct {
		Items []domain.Content `json:"items"`
	}
	decodeResponse(t, searchList, &searchPayload)
	if len(searchPayload.Items) != 1 || searchPayload.Items[0].Slug != "notes-on-retrieval-pipelines" {
		t.Fatalf("unexpected keyword search results: %#v", searchPayload.Items)
	}
	thoughtInput["title"] = "A revised short thought"
	thoughtUpdate := performJSON(t, handler, http.MethodPut, "/api/contents/test-short-thought", thoughtInput, adminCookie)
	if thoughtUpdate.Code != http.StatusOK {
		t.Fatalf("thought update status = %d, body = %s", thoughtUpdate.Code, thoughtUpdate.Body.String())
	}
	thoughtDelete := performJSON(t, handler, http.MethodDelete, "/api/contents/test-short-thought", nil, adminCookie)
	if thoughtDelete.Code != http.StatusNoContent {
		t.Fatalf("thought delete status = %d, body = %s", thoughtDelete.Code, thoughtDelete.Body.String())
	}
}

func TestMediaUploadPersistsAndSupportsRangeRequests(t *testing.T) {
	repository := store.NewMemoryRepository()
	adminHash, err := bcAuth.HashPassword("admin-password-for-tests")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repository.EnsureAdmin(context.Background(), domain.UserInput{
		Email: "owner@bc.test", DisplayName: "B.C", Role: domain.RoleAdmin, PasswordHash: adminHash,
	}); err != nil {
		t.Fatal(err)
	}
	mediaStore := &testMediaStore{objects: make(map[string]testMediaObject)}
	handler := New(repository, mediaStore, "", slog.New(slog.NewTextHandler(io.Discard, nil)))
	login := performJSON(t, handler, http.MethodPost, "/api/auth/login", map[string]any{
		"email": "owner@bc.test", "password": "admin-password-for-tests",
	}, nil)
	cookie := sessionCookie(t, login)

	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	part, err := form.CreateFormFile("file", "cover.png")
	if err != nil {
		t.Fatal(err)
	}
	png := []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n', 0x00, 0x00, 0x00, 0x0d}
	if _, err := part.Write(png); err != nil {
		t.Fatal(err)
	}
	if err := form.Close(); err != nil {
		t.Fatal(err)
	}
	uploadRequest := httptest.NewRequest(http.MethodPost, "/api/media", &body)
	uploadRequest.Header.Set("Content-Type", form.FormDataContentType())
	uploadRequest.AddCookie(cookie)
	uploadResponse := httptest.NewRecorder()
	handler.ServeHTTP(uploadResponse, uploadRequest)
	if uploadResponse.Code != http.StatusCreated {
		t.Fatalf("upload status = %d, body = %s", uploadResponse.Code, uploadResponse.Body.String())
	}
	var uploaded bcMedia.Object
	decodeResponse(t, uploadResponse, &uploaded)
	if uploaded.ContentType != "image/png" || uploaded.URL != "/media/2026/08/test-object.png" {
		t.Fatalf("unexpected uploaded object: %#v", uploaded)
	}

	readRequest := httptest.NewRequest(http.MethodGet, uploaded.URL, nil)
	readRequest.Header.Set("Range", "bytes=0-3")
	readResponse := httptest.NewRecorder()
	handler.ServeHTTP(readResponse, readRequest)
	if readResponse.Code != http.StatusPartialContent {
		t.Fatalf("range status = %d, body = %s", readResponse.Code, readResponse.Body.String())
	}
	if got := readResponse.Body.Bytes(); !bytes.Equal(got, png[:4]) {
		t.Fatalf("range body = %v, want %v", got, png[:4])
	}
}

type testMediaObject struct {
	data   []byte
	object bcMedia.Object
}

type testMediaStore struct {
	objects map[string]testMediaObject
}

func (store *testMediaStore) Health(context.Context) error { return nil }

func (store *testMediaStore) Put(_ context.Context, header *multipart.FileHeader, source io.Reader) (bcMedia.Object, error) {
	data, err := io.ReadAll(source)
	if err != nil {
		return bcMedia.Object{}, err
	}
	object := bcMedia.Object{
		ID: "test-media-id", Key: "2026/08/test-object.png", Bucket: "test", Name: header.Filename,
		ContentType: header.Header.Get("Content-Type"), Size: int64(len(data)), URL: "/media/2026/08/test-object.png",
		ModifiedAt: time.Date(2026, 8, 9, 0, 0, 0, 0, time.UTC),
	}
	store.objects[object.Key] = testMediaObject{data: data, object: object}
	return object, nil
}

func (store *testMediaStore) Open(_ context.Context, key string) (bcMedia.ReadSeekCloser, bcMedia.Object, error) {
	stored, ok := store.objects[key]
	if !ok {
		return nil, bcMedia.Object{}, errors.New("not found")
	}
	return &testReadSeekCloser{Reader: bytes.NewReader(stored.data)}, stored.object, nil
}

func (store *testMediaStore) Delete(_ context.Context, key string) error {
	delete(store.objects, key)
	return nil
}

type testReadSeekCloser struct {
	*bytes.Reader
}

func (*testReadSeekCloser) Close() error { return nil }

func footprintInput(slug string) map[string]any {
	return map[string]any{
		"type": "article", "slug": slug, "title": "Test footprint", "summary": "A test field note.",
		"bodyMarkdown": "# Test", "visibility": "public",
		"tags": []map[string]any{{
			"slug": "footprint", "name": "Footprint",
			"properties": map[string]any{"latitude": 38.7223, "longitude": -9.1393, "location_name": "Lisbon"},
		}},
	}
}

func performJSON(t *testing.T, handler http.Handler, method, path string, body any, cookie *http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	var encoded []byte
	if body != nil {
		var err error
		encoded, err = json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
	}
	request := httptest.NewRequest(method, path, bytes.NewReader(encoded))
	request.Header.Set("Content-Type", "application/json")
	if cookie != nil {
		request.AddCookie(cookie)
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}

func decodeResponse(t *testing.T, recorder *httptest.ResponseRecorder, target any) {
	t.Helper()
	if err := json.Unmarshal(recorder.Body.Bytes(), target); err != nil {
		t.Fatalf("decode response: %v; body = %s", err, recorder.Body.String())
	}
}

func sessionCookie(t *testing.T, recorder *httptest.ResponseRecorder) *http.Cookie {
	t.Helper()
	for _, cookie := range recorder.Result().Cookies() {
		if cookie.Name == bcAuth.SessionCookieName {
			return cookie
		}
	}
	t.Fatal("session cookie was not set")
	return nil
}
