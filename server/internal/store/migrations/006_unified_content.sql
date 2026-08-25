CREATE TABLE IF NOT EXISTS content_types (
  slug VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  description VARCHAR(512) NOT NULL DEFAULT '',
  renderer VARCHAR(64) NOT NULL DEFAULT 'markdown',
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS knowledge_base_details (
  content_id CHAR(36) PRIMARY KEY,
  route_slug VARCHAR(191) NOT NULL UNIQUE,
  cover_url VARCHAR(2048) NOT NULL DEFAULT '',
  position INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  INDEX idx_knowledge_base_catalog (position, route_slug),
  CONSTRAINT fk_knowledge_base_detail_content FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS knowledge_structure (
  content_id CHAR(36) PRIMARY KEY,
  knowledge_base_content_id CHAR(36) NOT NULL,
  parent_content_id CHAR(36) NULL,
  route_slug VARCHAR(191) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  UNIQUE KEY uq_knowledge_page_route (knowledge_base_content_id, route_slug),
  INDEX idx_knowledge_structure_tree (knowledge_base_content_id, parent_content_id, position),
  CONSTRAINT fk_knowledge_structure_content FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE,
  CONSTRAINT fk_knowledge_structure_base FOREIGN KEY (knowledge_base_content_id) REFERENCES contents(id) ON DELETE CASCADE,
  CONSTRAINT fk_knowledge_structure_parent FOREIGN KEY (parent_content_id) REFERENCES contents(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
