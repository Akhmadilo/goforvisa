## Jarima bo'limi + Telegram bot integratsiyasi

### Maqsad
Ishchilar avval ofisdagi FACE ID dan o'tadi, keyin `@visaplatform_bot` ga kiradi va `🟢 Keldim` ni bosadi. Bot avval "FACE ID dan o'tdingizmi?" deb so'raydi, "✅ Ha" bosilgandagina kelish vaqti yoziladi va jarima haftalik jadval asosida hisoblanadi.

### 1. Database (migration)

**`employee_schedules`** — har ishchi uchun haftalik ish vaqti
- `employee_id` (FK), `weekday` (0–6), `start_time` (masalan `10:00`), `is_working` (dam olish kuni → false)

**`employee_telegram`** — Telegram bog'lash
- `employee_id` (FK, unique), `telegram_id` (bigint, unique), `telegram_username`, `linked_at`
- Admin tasdiqlamaguncha `employee_id` NULL bo'lishi mumkin (pending)

**`attendance`** — har kungi kelish
- `employee_id`, `date`, `check_in_at`, `face_id_confirmed` (bool), `source` (`telegram`/`manual`)
- unique (employee_id, date)

**`fines`** — hisoblangan jarimalar
- `employee_id`, `date`, `minutes_late`, `amount_uzs`, `reason` (`late`/`absent`/`manual`/`no_face_id`), `note`
- unique (employee_id, date, reason)

**`fine_rules`** — jarima qoidalari (UI dan tahrirlanadi), default seed:
- 10:00–10:30 → 30 000
- 10:30–12:00 → 50 000
- 12:00+ → 100 000

Hamma jadvalga RLS + GRANT (authenticated read, service_role all). `widget_permissions.fines_section` orqali kim ko'rishini cheklash.

### 2. Telegram bot oqimi (`/api/public/telegram/webhook`)

1. `/start` → bot salomlashadi, `employee_telegram` ga `telegram_id` + `username` yoziladi (pending). Admin keyin Jarima sahifasida ishchi bilan bog'laydi.
2. Asosiy menyu — bitta tugma: `🟢 Keldim`
3. `🟢 Keldim` bosilganda → bot inline so'raydi:
   > "FACE ID dan o'tdingizmi?"
   > [ ✅ Ha, o'tdim ]  [ ❌ Yo'q ]
4. **❌ Yo'q** → "Iltimos avval FACE ID dan o'ting, keyin qayta bosing." (hech narsa yozilmaydi)
5. **✅ Ha** → `attendance` ga `check_in_at = now()`, `face_id_confirmed = true` yoziladi (o'sha kunga 1 marta)
6. Darhol haftalik jadvaldan o'sha kungi `start_time` olinadi → kechikish daqiqasi hisoblanadi → `fine_rules` dan summa topiladi → `fines` ga yoziladi
7. Bot javobi: "✅ Qabul qilindi: 10:14 — Kechikish: 14 daq — Jarima: 30 000 so'm" (yoki "✅ O'z vaqtida, jarima yo'q")

Webhook himoyasi: `X-Telegram-Bot-Api-Secret-Token` (token dan derive qilingan SHA-256).

### 3. Jarima sahifasi (`/jarima`) — 3 tab

**Bugun** — bugungi ro'yxat: kim keldi/qancha kech/jarimasi, kim kelmadi (pending)
**Tarix** — sana/ishchi/oy filtr, jami jarima, Excel export
**Sozlamalar** (admin only):
- Pending Telegram linklar — admin har bir username ni ishchi bilan bog'laydi
- Haftalik ish jadvali (har ishchi × 7 kun start_time)
- Jarima qoidalari (vaqt oraliqlari va summa CRUD)

### 4. Secret
`TELEGRAM_BOT_TOKEN` — `secrets--add_secret` orqali siz kiritasiz (qiymat kodga yozilmaydi).

### 5. Webhook ro'yxatdan o'tkazish
Token kiritilgach, `setWebhook` chaqirib URL: 
`https://project--da47c250-b9f9-4500-9f76-b2b676e74aae-dev.lovable.app/api/public/telegram/webhook`

Tasdiqlasangiz boshlayman.