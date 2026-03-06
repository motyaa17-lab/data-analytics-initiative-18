# Инструкция деплоя на Vercel + Supabase

---

## Переменные окружения

### Vercel (Settings → Environment Variables)

| Переменная | Значение | Где взять |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres` | Supabase → Settings → Database → Connection string → Transaction pooler |
| `MAIN_DB_SCHEMA` | `public` | фиксированное |
| `SUPABASE_URL` | `https://xxxxxxxxxxxx.supabase.co` | Supabase → Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | `eyJ...` (длинный ключ) | Supabase → Settings → API → service_role (Secret) |
| `SUPABASE_BUCKET` | `uploads` | название бакета который создашь в шаге 2б |

> Файлы (аватары, изображения, голосовые) хранятся в Supabase Storage — отдельный S3 не нужен.

### Supabase — переменные не нужны в самом Supabase
Всё управляется через dashboard. Переменные берутся из Supabase и вставляются в Vercel.

---

## Пошаговая инструкция

### Шаг 1 — Создать проект в Supabase

1. Зайди на [supabase.com](https://supabase.com) → **New project**
2. Придумай название и пароль БД (сохрани пароль!)
3. Выбери регион ближе к пользователям
4. Подожди ~2 минуты пока проект создаётся

### Шаг 2 — Создать таблицы в Supabase

1. В Supabase открой **SQL Editor** (левое меню)
2. Нажми **New query**
3. Вставь всё содержимое файла `supabase_migration.sql`
4. Нажми **Run** (зелёная кнопка)
5. Убедись что внизу появилось "Success. No rows returned"

### Шаг 2б — Создать бакет в Supabase Storage

1. В Supabase: **Storage** (левое меню) → **New bucket**
2. Название: `uploads`
3. Поставь галочку **Public bucket** — это позволит отображать файлы напрямую
4. Нажми **Save**

### Шаг 3 — Получить ключи из Supabase

**DATABASE_URL:**
1. Supabase → **Settings → Database**
2. Прокрути до **Connection string** → вкладка **Transaction pooler** (порт 6543)
3. Скопируй строку, замени `[YOUR-PASSWORD]` на пароль из шага 1

**SUPABASE_URL и SUPABASE_SERVICE_KEY:**
1. Supabase → **Settings → API**
2. `Project URL` → скопируй → это `SUPABASE_URL`
3. `Project API keys` → `service_role` → нажми **Reveal** → скопируй → это `SUPABASE_SERVICE_KEY`

> service_role даёт полный доступ к Storage — храни в секрете, только на сервере (Vercel env)

### Шаг 4 — Загрузить код в GitHub

1. В редакторе: **Скачать → Подключить GitHub**
2. Авторизуйся и выбери аккаунт
3. Код уйдёт в новый репозиторий

### Шаг 5 — Подключить Vercel

1. Зайди на [vercel.com](https://vercel.com) → **Add New Project**
2. Выбери репозиторий из GitHub
3. Настройки сборки:
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Раскрой **Environment Variables** и добавь:
   - `DATABASE_URL` — строка подключения из шага 3
   - `MAIN_DB_SCHEMA` — значение: `public`
   - `SUPABASE_URL` — Project URL из шага 3
   - `SUPABASE_SERVICE_KEY` — service_role ключ из шага 3
   - `SUPABASE_BUCKET` — значение: `uploads`
5. Нажми **Deploy**

### Шаг 6 — Создать первого администратора

1. Открой задеплоенный сайт на Vercel
2. Зарегистрируйся через форму регистрации
3. В Supabase открой **SQL Editor** → **New query** и выполни:
```sql
UPDATE users SET is_admin = true WHERE email = 'твой@email.com';
```

### Шаг 7 — Проверить что всё работает

Открой сайт и проверь по порядку:

| Действие | Ожидаемый результат |
|---|---|
| Открыть сайт | Загружается без ошибок |
| Зарегистрироваться | Появляется подтверждение |
| Войти | Попадаешь в чат |
| Написать сообщение в #general | Сообщение появляется |
| Добавить друга | Запрос отправляется |
| Написать в личку | Сообщение доставляется |
| Открыть Admin Panel | Видна статистика (у админа) |

### Частые проблемы

**Ошибка 500 при входе** — неверная `DATABASE_URL`, проверь пароль и что выбран Transaction pooler (порт 6543, не 5432)

**Таблица не найдена** — `MAIN_DB_SCHEMA` должна быть `public`, или ты не запустил SQL из шага 2

**Файлы не загружаются** — проверь что бакет `uploads` создан и помечен как **Public** в Supabase Storage, и что `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` / `SUPABASE_BUCKET` заданы в Vercel

**Сайт показывает 404 на /api/** — проверь что `vercel.json` есть в корне репозитория