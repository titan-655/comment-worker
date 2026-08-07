-- Comment Worker D1 Schema
-- Tables: sites, comments
-- یک Worker می‌تواند برای چندین سایت (وبلاگ) سرویس بدهد؛ هر سایت یک secret دارد.

CREATE TABLE IF NOT EXISTS sites (
    id TEXT PRIMARY KEY,                    -- شناسه سایت (slug) — مثلا 'my-blog'
    name TEXT NOT NULL,                     -- نام نمایشی سایت
    secret TEXT NOT NULL,                   -- کلید مدیریت سایت (برای داشبورد/API)
    allowed_origins TEXT DEFAULT '*',       -- دامنه‌های مجاز (جدا با کاما، '*' یعنی همه)
    moderation TEXT DEFAULT 'open',         -- 'open' | 'moderated' | 'closed'
    rate_limit INTEGER DEFAULT 5,           -- حداکثر دیدگاه هر IP در هر ساعت
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    page_path TEXT NOT NULL,                -- آدرس صفحه (مثلا '/blog/post-1')
    parent_id INTEGER,                      -- دیدگاه والد (برای جواب دادن)
    author TEXT NOT NULL,                   -- نام نویسنده
    email TEXT,                             -- ایمیل (اختیاری، ذخیره می‌شود ولی نمایش داده نمی‌شود)
    body TEXT NOT NULL,                     -- متن دیدگاه
    ip TEXT,
    user_agent TEXT,
    status TEXT DEFAULT 'approved',         -- 'approved' | 'pending' | 'spam'
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comments_site_page
    ON comments(site_id, page_path, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_status
    ON comments(status);

-- تنظیمات سراسری
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('max_comment_length', '2000'),
    ('default_moderation', 'open');
