-- Create document snapshots table for version history
CREATE TABLE IF NOT EXISTS document_snapshots (
  id SERIAL PRIMARY KEY,
  room_name VARCHAR(255) NOT NULL,
  snapshot_name VARCHAR(255) NOT NULL,
  state_data BYTEA NOT NULL,
  created_by VARCHAR(255) DEFAULT 'system',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_document_snapshots_room_name ON document_snapshots(room_name);
CREATE INDEX IF NOT EXISTS idx_document_snapshots_created_at ON document_snapshots(created_at);

-- Add comment to table
COMMENT ON TABLE document_snapshots IS 'Stores named snapshots of document states for version history and rollback';
