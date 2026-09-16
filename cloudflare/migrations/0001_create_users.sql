CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    best_score INTEGER NOT NULL DEFAULT 0 CHECK (best_score >= 0),
    theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light'))
);