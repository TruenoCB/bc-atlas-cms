CREATE TABLE IF NOT EXISTS knowledge_bases (
  id CHAR(36) PRIMARY KEY,
  slug VARCHAR(191) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  visibility VARCHAR(32) NOT NULL DEFAULT 'public',
  position INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  INDEX idx_knowledge_bases_order (position, title),
  INDEX idx_knowledge_bases_visibility (visibility)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS knowledge_pages (
  id CHAR(36) PRIMARY KEY,
  knowledge_base_id CHAR(36) NOT NULL,
  parent_id CHAR(36) NULL,
  author_id CHAR(36) NULL,
  slug VARCHAR(191) NOT NULL,
  title VARCHAR(255) NOT NULL,
  summary TEXT NOT NULL,
  body_markdown MEDIUMTEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'published',
  visibility VARCHAR(32) NOT NULL DEFAULT 'public',
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  UNIQUE KEY uq_knowledge_page_slug (knowledge_base_id, slug),
  INDEX idx_knowledge_page_tree (knowledge_base_id, parent_id, position),
  INDEX idx_knowledge_page_status (knowledge_base_id, status, visibility),
  CONSTRAINT fk_knowledge_page_base FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  CONSTRAINT fk_knowledge_page_parent FOREIGN KEY (parent_id) REFERENCES knowledge_pages(id) ON DELETE RESTRICT,
  CONSTRAINT fk_knowledge_page_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
