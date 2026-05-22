## Reja

Bir nechta yirik o'zgarishlar kiritamiz. Quyida bo'limlar bo'yicha taqsimlangan.

### 1. Xarajatlar — to'lov tizimi va ruxsatlar
- Admin (siz) yaratgan barcha to'lanmagan xarajatlarni bir martalik **to'liq to'langan** qilib belgilaymiz (har bir xarajatning to'liq summasi miqdorida `expense_payments` ga sizning nomingizdan yozuv qo'shiladi, status avtomatik `paid` bo'ladi).
- Xarajat qatorini bosganda ochiladigan **detail drawer** ichida to'lovlar ro'yxati alohida bo'lim sifatida ko'rinadi: har bir to'lovni **o'chirish** va **qayta to'lov qo'shish** tugmalari bilan (alohida `expenses_pay` ruxsati tekshiriladi).
- Yangi widget kalitlari:
  - `expenses_create` — yaratish (allaqachon bor)
  - `expenses_edit` — boshqa odam yaratgan / o'zi yaratgandan keyin tahrirlash (admin alohida beradi)
  - `expenses_delete` — o'chirish (admin alohida beradi)
  - `expenses_pay` — to'lov qo'shish/o'chirish
- RLS yangilanadi: yaratgan odam (`created_by = auth.uid()`) faqat `expenses_create` bo'lsa yaratadi; lekin tahrirlash/o'chirish faqat admin yoki `expenses_edit`/`expenses_delete` ruxsati bo'lganlarga. Hozir hamma `expenses_create` egasi tahrirlay oladi — buni cheklaymiz.

### 2. Ishchilar (yangi bo'lim) — `/employees`
- Yangi jadval `employees`:
  - `full_name`, `phone`, `position` (lavozim), `avatar_url`, `hired_at`, `terminated_at` (NULL bo'lsa hali ishlayapti), `note`
- Yangi Storage bucket `employee-photos` (public) — avatar yuklash uchun.
- Sahifada ishchilar ro'yxati chiroyli kartalar ko'rinishida: rasm, ism, lavozim, telefon, status badge ("Faol" / "Ishdan ketgan").
- Filtrlar: faol / ketganlar / barchasi, qidiruv.
- Admin / `employees_create` ruxsati bo'lganlar qo'sha oladi, tahrirlay oladi, "ishdan ketdi" deb belgilay oladi.
- Yangi widget kalitlari: `employees_section`, `employees_create`.
- Sidebar va `/admin` sahifasiga qo'shamiz.

### 3. Ruxsatlar va UI gating'ni qattiqlash
- Hozir foydalanuvchilar (admin emaslar) ko'rmasligi kerak bo'lgan ba'zi joylar ko'rinib turibdi — har bir sahifada `useWidgetPermissions().can(...)` tekshiruvi qo'yamiz:
  - "Xarajat qo'shish", "Tahrirlash", "O'chirish", "To'lov qo'shish" tugmalari — alohida ruxsatlar bilan
  - "Oylik qo'shish/tahrirlash/o'chirish" tugmalari — `salaries_create`
  - Sidebar elementlari faqat tegishli `*_section` ruxsati bor bo'lsa ko'rinadi
  - Admin sahifasiga kirish — faqat admin
- Index sahifasidagi widgetlar ham bitta-bittadan tekshiriladi.

### 4. Moliyaviy hisobotlar (yangi sahifa) — `/moliya`
- Yangi widget: `finance_section` (admin / ruxsat olganlar uchun).
- Sahifa tepasida **yil + oylar (multi-select)** filtri va **Accrual / Cash basis** tugmasi.
- Ma'lumot manbalari:
  - Daromad: mavjud `contracts` jadvali (revenue) — accrual = shartnoma sanasi; cash = to'lov sanasi (agar payments jadvali bo'lsa) yoki shartnoma sanasi (fallback).
  - Xarajat: `expenses` — accrual = `expense_date`; cash = `expense_payments.paid_at`.
- Ko'rsatkichlar:
  - SumCards: Jami daromad, Jami xarajat, Sof foyda, Marja %
  - Oylik chart: daromad vs xarajat vs sof foyda
  - Kategoriyalar bo'yicha xarajatlar pivot
  - Eng yirik 10 xarajat va eng yirik 10 mijoz

### 5. Bir martalik ma'lumot ko'chirish
- Sizning UUID'ingiz ostida yaratilgan, `status != 'paid'` bo'lgan barcha `expenses` uchun:
  - `expense_payments` ga `amount = total_amount - already_paid`, `paid_at = expense_date`, `payment_method = 'cash'`, `note = 'Auto-marked as paid'` yozuvi qo'shiladi
  - Trigger orqali status `paid` ga o'tadi

### Texnik tafsilotlar
- Migratsiyalar:
  1. `employees` jadvali + RLS + storage bucket + policy
  2. Yangi widget kalitlari uchun RLS o'zgarishlari (expenses edit/delete/pay alohida)
  3. Admin foydalanuvchining to'lanmagan xarajatlarini to'langan qilish (insert)
- Yangi fayllar:
  - `src/routes/employees.tsx`
  - `src/routes/moliya.tsx`
  - `src/components/employee-form-dialog.tsx`
- O'zgartirilgan:
  - `src/lib/widgets.ts` — yangi kalitlar
  - `src/routes/xarajatlar.tsx` — to'lovlar drawer ichida, ruxsatlar
  - `src/routes/salaries.tsx` — ruxsatlar
  - `src/routes/index.tsx` — widget gating
  - `src/components/app-sidebar.tsx` — yangi bo'limlar va ruxsatlar
  - `src/routes/admin.tsx` — yangi widget kalitlari

Tasdiqlasangiz, migratsiyadan boshlayman.