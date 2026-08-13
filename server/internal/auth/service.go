package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net/mail"
	"strings"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

const SessionCookieName = "bc_session"

func NormalizeEmail(value string) (string, error) {
	normalized := strings.ToLower(strings.TrimSpace(value))
	address, err := mail.ParseAddress(normalized)
	if err != nil || address.Address != normalized || len(normalized) > 320 {
		return "", errors.New("enter a valid email address")
	}
	return normalized, nil
}

func ValidateDisplayName(value string) error {
	length := utf8.RuneCountInString(strings.TrimSpace(value))
	if length < 2 || length > 60 {
		return errors.New("display name must be between 2 and 60 characters")
	}
	return nil
}

func ValidatePassword(password string) error {
	length := utf8.RuneCountInString(password)
	if length < 12 {
		return errors.New("password must be at least 12 characters")
	}
	if len(password) > 72 {
		return errors.New("password must be at most 72 bytes")
	}
	return nil
}

func HashPassword(password string) ([]byte, error) {
	if err := ValidatePassword(password); err != nil {
		return nil, err
	}
	return bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
}

func CheckPassword(hash []byte, password string) bool {
	return bcrypt.CompareHashAndPassword(hash, []byte(password)) == nil
}

func NewSessionToken() (raw string, hash string, err error) {
	bytes := make([]byte, 32)
	if _, err = rand.Read(bytes); err != nil {
		return "", "", err
	}
	raw = base64.RawURLEncoding.EncodeToString(bytes)
	return raw, HashSessionToken(raw), nil
}

func HashSessionToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
