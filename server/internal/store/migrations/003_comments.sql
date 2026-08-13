CREATE TABLE IF NOT EXISTS comments (
  id CHAR(36) PRIMARY KEY,
  content_id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  author_display_name VARCHAR(120) NOT NULL,
  body TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'published',
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  INDEX idx_comments_content_created (content_id, created_at),
  INDEX idx_comments_status (status),
  CONSTRAINT fk_comment_content FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE,
  CONSTRAINT fk_comment_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
