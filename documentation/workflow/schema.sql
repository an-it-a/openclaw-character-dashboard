PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT,
  description TEXT,
  kind TEXT,
  requester_agent_id TEXT,
  assigned_agent_id TEXT,
  parent_task_id TEXT,
  root_task_id TEXT,
  state TEXT NOT NULL CHECK (state IN (
    'draft',
    'queued',
    'dispatching',
    'assigned',
    'running',
    'waiting_tool',
    'waiting_human',
    'blocked',
    'completed',
    'failed',
    'cancelled',
    'timed_out'
  )),
  priority INTEGER NOT NULL DEFAULT 0,
  input_payload_json TEXT,
  output_summary TEXT,
  error_summary TEXT,
  wait_reason TEXT,
  session_key TEXT,
  spawn_run_id TEXT,
  created_at TEXT NOT NULL,
  queued_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(parent_task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  FOREIGN KEY(root_task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_state ON tasks(state);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_agent_state ON tasks(assigned_agent_id, state);
CREATE INDEX IF NOT EXISTS idx_tasks_root_task_id ON tasks(root_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_session_key ON tasks(session_key);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at DESC);

CREATE TABLE IF NOT EXISTS task_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  agent_id TEXT,
  session_key TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_events_task_id_created_at
  ON task_events(task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_task_events_event_type_created_at
  ON task_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_events_agent_id_created_at
  ON task_events(agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_presence (
  agent_id TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN (
    'idle',
    'dispatching',
    'working',
    'waiting_tool',
    'waiting_human',
    'blocked',
    'delivering',
    'offline',
    'error'
  )),
  current_task_id TEXT,
  current_session_key TEXT,
  status_text TEXT,
  wait_reason TEXT,
  last_event_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(current_task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_presence_state ON agent_presence(state);
CREATE INDEX IF NOT EXISTS idx_agent_presence_last_seen_at ON agent_presence(last_seen_at DESC);

CREATE TABLE IF NOT EXISTS task_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  agent_id TEXT,
  kind TEXT NOT NULL,
  path TEXT,
  label TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_artifacts_task_id_created_at
  ON task_artifacts(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_artifacts_kind_created_at
  ON task_artifacts(kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_artifacts_path
  ON task_artifacts(path);

CREATE TABLE IF NOT EXISTS agent_sessions (
  session_key TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  task_id TEXT,
  session_kind TEXT,
  started_at TEXT,
  ended_at TEXT,
  last_active_at TEXT,
  status TEXT,
  FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent_id_last_active
  ON agent_sessions(agent_id, last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_task_id
  ON agent_sessions(task_id);

CREATE VIEW IF NOT EXISTS dashboard_agent_state AS
SELECT
  ap.agent_id,
  ap.state,
  ap.current_task_id,
  t.title AS task_title,
  t.kind AS task_kind,
  t.priority,
  ap.current_session_key,
  ap.status_text,
  ap.wait_reason,
  ap.last_event_at,
  ap.last_seen_at,
  ap.updated_at
FROM agent_presence ap
LEFT JOIN tasks t ON t.id = ap.current_task_id;

CREATE VIEW IF NOT EXISTS active_tasks AS
SELECT
  id,
  title,
  description,
  kind,
  requester_agent_id,
  assigned_agent_id,
  parent_task_id,
  root_task_id,
  state,
  priority,
  wait_reason,
  session_key,
  created_at,
  queued_at,
  started_at,
  updated_at
FROM tasks
WHERE state IN (
  'draft',
  'queued',
  'dispatching',
  'assigned',
  'running',
  'waiting_tool',
  'waiting_human',
  'blocked'
)
ORDER BY priority DESC, updated_at DESC;
