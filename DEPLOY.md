# Инструкция деплоя на Vercel + Supabase

---

## Переменные окружения

### Vercel (Settings → Environment Variables)

| Переменная | Значение | Где взять |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres` | Supabase → Settings → Database → Connection string → Transaction pooler |
| `MAIN_DB_SCHEMA` | `public` | фиксированное |
| `S3_ENDPOINT_URL` | URL твоего S3-хранилища (например `https://s3.amazonaws.com` или другой провайдер) | от выбранного S3-провайдера |
| `AWS_ACCESS_KEY_ID` | ключ доступа S3 | от выбранного S3-провайдера |
| `AWS_SECRET_ACCESS_KEY` | секретный ключ S3 | от выбранного S3-провайдера |
| `CDN_BASE_URL` | публичный URL для файлов, например `https://pub-xxx.r2.dev` | от выбранного S3/CDN провайдера |

> Если загрузка файлов (аватары, голосовые, изображения) не нужна — S3_ENDPOINT_URL, AWS_* и CDN_BASE_URL можно не добавлять.

### Supabase — переменные не нужны
Supabase сам управляет БД. DATABASE_URL берётся из Supabase и вставляется в Vercel.

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

### Шаг 3 — Получить строку подключения

1. В Supabase: **Settings → Database**
2. Прокрути до **Connection string**
3. Выбери вкладку **Transaction pooler** (порт 6543)
4. Скопируй строку — она начинается с `postgresql://postgres...`
5. Замени `[YOUR-PASSWORD]` на твой пароль из шага 1

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
   - `DATABASE_URL` — строка из шага 3
   - `MAIN_DB_SCHEMA` — значение: `public`
   - (опционально) S3 переменные если нужны файлы
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

**Файлы не загружаются** — не заданы S3 переменные, это не критично если файлы не нужны

**Сайт показывает 404 на /api/** — проверь что `vercel.json` есть в корне репозитория
