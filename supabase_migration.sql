-- ============================================================
-- Frikords — полная схема БД для Supabase
-- Запускать в: Supabase → SQL Editor → New query
-- ============================================================

-- 1. ПОЛЬЗОВАТЕЛИ
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(64)  NOT NULL,
    email           VARCHAR(256) NOT NULL,
    password_hash   VARCHAR(256) NOT NULL,
    favorite_game   VARCHAR(128) NULL,
    created_at      TIMESTAMP    DEFAULT now(),
    is_admin        BOOLEAN      NOT NULL DEFAULT false,
    is_banned       BOOLEAN      NOT NULL DEFAULT false,
    last_seen       TIMESTAMP    NULL,
    avatar_url      TEXT         NULL,
    badge           VARCHAR(64)  NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx    ON users (email);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx ON users (username);

-- 2. СЕССИИ
CREATE TABLE IF NOT EXISTS sessions (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      VARCHAR(128) NOT NULL,
    created_at TIMESTAMP DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_idx ON sessions (token);

-- 3. КОМНАТЫ
CREATE TABLE IF NOT EXISTS rooms (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(64)  NOT NULL,
    description VARCHAR(256) NULL,
    owner_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_public   BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMP    DEFAULT now()
);

-- 4. УЧАСТНИКИ КОМНАТ
CREATE TABLE IF NOT EXISTS room_members (
    room_id   INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (room_id, user_id)
);

-- 5. СООБЩЕНИЯ
CREATE TABLE IF NOT EXISTS messages (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel    VARCHAR(64) NOT NULL DEFAULT 'general',
    content    TEXT        NOT NULL,
    created_at TIMESTAMP   DEFAULT now(),
    room_id    INTEGER     NULL REFERENCES rooms(id) ON DELETE CASCADE,
    is_removed BOOLEAN     NOT NULL DEFAULT false,
    edited     BOOLEAN     NOT NULL DEFAULT false,
    image_url  TEXT        NULL,
    voice_url  TEXT        NULL
);

CREATE INDEX IF NOT EXISTS messages_channel_idx ON messages (channel, room_id);
CREATE INDEX IF NOT EXISTS messages_room_idx    ON messages (room_id);

-- 6. ИНВАЙТЫ
CREATE TABLE IF NOT EXISTS invites (
    id         SERIAL PRIMARY KEY,
    code       VARCHAR(32) NOT NULL,
    room_id    INTEGER     NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    created_by INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    uses       INTEGER     NOT NULL DEFAULT 0,
    max_uses   INTEGER     NULL,
    expires_at TIMESTAMP   NULL,
    created_at TIMESTAMP   DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS invites_code_idx ON invites (code);

-- 7. ЛОГИ ОШИБОК
CREATE TABLE IF NOT EXISTS error_logs (
    id         SERIAL PRIMARY KEY,
    level      VARCHAR(16) NOT NULL DEFAULT 'error',
    source     VARCHAR(64) NULL,
    message    TEXT        NOT NULL,
    details    TEXT        NULL,
    ip         VARCHAR(64) NULL,
    user_id    INTEGER     NULL,
    created_at TIMESTAMP   DEFAULT now()
);

-- 8. RATE LIMITS
CREATE TABLE IF NOT EXISTS rate_limits (
    key          VARCHAR(128) PRIMARY KEY,
    count        INTEGER      NOT NULL DEFAULT 1,
    window_start TIMESTAMP    NOT NULL DEFAULT now()
);

-- 9. ДРУЗЬЯ
CREATE TABLE IF NOT EXISTS friend_requests (
    id           SERIAL PRIMARY KEY,
    from_user_id INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id   INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at   TIMESTAMP   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS friend_requests_pair_idx ON friend_requests (from_user_id, to_user_id);

-- 10. ЛИЧНЫЕ СООБЩЕНИЯ
CREATE TABLE IF NOT EXISTS direct_messages (
    id          SERIAL PRIMARY KEY,
    sender_id   INTEGER   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INTEGER   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content     TEXT      NOT NULL,
    created_at  TIMESTAMP DEFAULT now(),
    is_removed  BOOLEAN   NOT NULL DEFAULT false,
    voice_url   TEXT      NULL
);

CREATE INDEX IF NOT EXISTS dm_pair_idx ON direct_messages (sender_id, receiver_id);

-- 11. РЕАКЦИИ НА СООБЩЕНИЯ
CREATE TABLE IF NOT EXISTS message_reactions (
    id         SERIAL PRIMARY KEY,
    message_id INTEGER     NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id    INTEGER     NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    emoji      VARCHAR(16) NOT NULL,
    created_at TIMESTAMP   DEFAULT now(),
    is_active  BOOLEAN     NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS reactions_msg_idx ON message_reactions (message_id);

-- 12. СИГНАЛЫ ЗВОНКОВ
CREATE TABLE IF NOT EXISTS call_signals (
    id           SERIAL PRIMARY KEY,
    from_user_id INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id   INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type         VARCHAR(20) NOT NULL,
    payload      TEXT        NULL,
    created_at   TIMESTAMP   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS call_signals_to_idx ON call_signals (to_user_id, created_at);

-- 13. ИНДИКАТОРЫ НАБОРА ТЕКСТА
CREATE TABLE IF NOT EXISTS typing_indicators (
    user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username   VARCHAR(50)  NOT NULL,
    channel    VARCHAR(100) NULL,
    dm_with    INTEGER      NULL,
    updated_at TIMESTAMP    DEFAULT now()
);

-- ============================================================
-- ВАЖНО: после создания таблиц зарегистрируй первого
-- администратора через /api/register, затем выполни:
-- UPDATE users SET is_admin = true WHERE email = 'твой@email.com';
-- ============================================================
