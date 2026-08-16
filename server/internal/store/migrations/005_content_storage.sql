CREATE TABLE IF NOT EXISTS content_search (
  content_id CHAR(36) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  summary TEXT NOT NULL,
  body_text MEDIUMTEXT NOT NULL,
  tags_text TEXT NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  FULLTEXT KEY ft_content_search (title, summary, body_text, tags_text),
  CONSTRAINT fk_content_search_content FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
