package domain

import "time"

const (
	RoleMember = "member"
	RoleEditor = "editor"
	RoleAdmin  = "admin"
)

type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	DisplayName  string    `json:"displayName"`
	Role         string    `json:"role"`
	PasswordHash []byte    `json:"-"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

func (user User) CanPublish() bool {
	return user.Role == RoleEditor || user.Role == RoleAdmin
}

type UserInput struct {
	Email        string
	DisplayName  string
	Role         string
	PasswordHash []byte
}

type Session struct {
	ID        string
	UserID    string
	TokenHash string
	ExpiresAt time.Time
	CreatedAt time.Time
}
