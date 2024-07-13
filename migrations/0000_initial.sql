DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS versions;
DROP TABLE IF EXISTS pages;

CREATE TABLE projects (
  name TEXT PRIMARY KEY,
  live_version_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE versions (
    id UUID PRIMARY KEY,
    project_name TEXT NOT NULL,
    parent_version_id UUID,
    pages JSON,
    metadata JSON,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


CREATE INDEX idx_versions_id ON versions (id);
CREATE INDEX idx_versions_project_name ON versions (project_name);
