package httpapi

import (
	"bytes"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/bc-dev/bc-atlas-cms/server/internal/domain"
)

func (server *Server) uploadMedia(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer, http.MethodPost)
		return
	}
	user := server.currentUser(request)
	if user == nil {
		writeError(writer, http.StatusUnauthorized, "sign in to upload media")
		return
	}
	if !user.CanPublish() {
		writeError(writer, http.StatusForbidden, "editor access is required")
		return
	}
	if server.mediaStore == nil {
		writeError(writer, http.StatusServiceUnavailable, "S3 storage is not configured")
		return
	}
	request.Body = http.MaxBytesReader(writer, request.Body, 512<<20)
	multipartReader, err := request.MultipartReader()
	if err != nil {
		writeError(writer, http.StatusBadRequest, "invalid multipart upload")
		return
	}
	var file *multipart.Part
	for {
		part, nextErr := multipartReader.NextPart()
		if nextErr == io.EOF {
			break
		}
		if nextErr != nil {
			writeError(writer, http.StatusBadRequest, "invalid multipart upload")
			return
		}
		if part.FormName() == "file" && part.FileName() != "" {
			file = part
			break
		}
		_ = part.Close()
	}
	if file == nil {
		writeError(writer, http.StatusBadRequest, "file field is required")
		return
	}
	defer file.Close()
	header := &multipart.FileHeader{Filename: file.FileName(), Header: file.Header, Size: -1}
	prefix := make([]byte, 512)
	read, readErr := io.ReadFull(file, prefix)
	if readErr != nil && readErr != io.EOF && readErr != io.ErrUnexpectedEOF {
		server.internalError(writer, readErr)
		return
	}
	contentType := http.DetectContentType(prefix[:read])
	if contentType == "application/octet-stream" {
		if extensionType := mime.TypeByExtension(strings.ToLower(filepath.Ext(header.Filename))); extensionType != "" {
			contentType = extensionType
		}
	}
	header.Header.Set("Content-Type", contentType)
	object, err := server.mediaStore.Put(request.Context(), header, io.MultiReader(bytes.NewReader(prefix[:read]), file))
	if err != nil {
		server.internalError(writer, err)
		return
	}
	createdAt := time.Now().UTC()
	if err := server.repository.CreateMediaObject(request.Context(), domain.MediaObject{
		ID: object.ID, ObjectKey: object.Key, BucketName: object.Bucket, OriginalName: object.Name,
		ContentType: object.ContentType, SizeBytes: object.Size, CreatedAt: createdAt,
	}); err != nil {
		_ = server.mediaStore.Delete(request.Context(), object.Key)
		server.internalError(writer, err)
		return
	}
	writeJSON(writer, http.StatusCreated, object)
}

func (server *Server) serveMedia(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet && request.Method != http.MethodHead {
		methodNotAllowed(writer, http.MethodGet, http.MethodHead)
		return
	}
	if server.mediaStore == nil {
		writeError(writer, http.StatusNotFound, "media not found")
		return
	}
	key := strings.TrimPrefix(request.URL.Path, "/media/")
	clean := strings.TrimPrefix(path.Clean("/"+key), "/")
	if clean == "." || clean == "" || clean != key {
		writeError(writer, http.StatusNotFound, "media not found")
		return
	}
	source, object, err := server.mediaStore.Open(request.Context(), clean)
	if err != nil {
		writeError(writer, http.StatusNotFound, "media not found")
		return
	}
	defer source.Close()
	writer.Header().Set("Content-Type", object.ContentType)
	writer.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	if !inlineMediaType(object.ContentType) {
		writer.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": object.Name}))
	}
	http.ServeContent(writer, request, object.Name, object.ModifiedAt, source)
}

func inlineMediaType(contentType string) bool {
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		return false
	}
	return strings.HasPrefix(mediaType, "image/") && mediaType != "image/svg+xml" ||
		strings.HasPrefix(mediaType, "video/") || strings.HasPrefix(mediaType, "audio/")
}
