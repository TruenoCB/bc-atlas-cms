CREATE TABLE IF NOT EXISTS contents (
  id CHAR(36) PRIMARY KEY,
  content_type VARCHAR(32) NOT NULL DEFAULT 'article',
  slug VARCHAR(191) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  summary TEXT NOT NULL,
  body_markdown MEDIUMTEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'published',
  visibility VARCHAR(32) NOT NULL DEFAULT 'public',
  published_at DATETIME(6) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  INDEX idx_contents_published (status, published_at),
  INDEX idx_contents_visibility (visibility)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS tags (
  id CHAR(36) PRIMARY KEY,
  slug VARCHAR(128) NOT NULL UNIQUE,
  name VARCHAR(191) NOT NULL,
  created_at DATETIME(6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS tag_property_definitions (
  id CHAR(36) PRIMARY KEY,
  tag_id CHAR(36) NOT NULL,
  key_name VARCHAR(128) NOT NULL,
  value_type ENUM('string', 'number', 'boolean', 'json') NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(6) NOT NULL,
  UNIQUE KEY uq_tag_property (tag_id, key_name),
  CONSTRAINT fk_property_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS content_tags (
  id CHAR(36) PRIMARY KEY,
  content_id CHAR(36) NOT NULL,
  tag_id CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  UNIQUE KEY uq_content_tag (content_id, tag_id),
  INDEX idx_content_tags_tag (tag_id),
  CONSTRAINT fk_content_tag_content FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE,
  CONSTRAINT fk_content_tag_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS content_tag_property_values (
  id CHAR(36) PRIMARY KEY,
  content_tag_id CHAR(36) NOT NULL,
  definition_id CHAR(36) NOT NULL,
  string_value TEXT NULL,
  number_value DOUBLE NULL,
  boolean_value BOOLEAN NULL,
  json_value JSON NULL,
  created_at DATETIME(6) NOT NULL,
  UNIQUE KEY uq_content_tag_property (content_tag_id, definition_id),
  CONSTRAINT fk_value_content_tag FOREIGN KEY (content_tag_id) REFERENCES content_tags(id) ON DELETE CASCADE,
  CONSTRAINT fk_value_definition FOREIGN KEY (definition_id) REFERENCES tag_property_definitions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS media_objects (
  id CHAR(36) PRIMARY KEY,
  object_key VARCHAR(512) NOT NULL UNIQUE,
  bucket_name VARCHAR(191) NOT NULL,
  original_name VARCHAR(512) NOT NULL,
  content_type VARCHAR(191) NOT NULL,
  size_bytes BIGINT NOT NULL,
  created_at DATETIME(6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
