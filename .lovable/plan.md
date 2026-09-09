# Bot 1 kunda qancha Cloud krediti yeyayotganini o'lchash

## Hozirgi holat (tekshirilgan)

- Joriy billing davri (16 Avg – 16 Sen): Cloud (baza/backend) uchun **20.00 kredit** ishlatilgan — bu aynan har oygi bepul Cloud limiti bilan bir xil.
- Kunlik kesimda Cloud sarfi alohida ko'rsatilmaydi: 8-sentabr uchun so'rov 0.00 qaytardi, ya'ni hisob oylik yig'iladi.
- Botning avtomatik ishlari: `daily-cash-report` **har soatda** ishga tushadi (kuniga 24 marta) va har safar `telegram_groups`, `bot_settings` jadvallarini o'qiydi; kerakli soatda esa `contract_payments`, `contracts`, `employee_telegram`, `daily_cash_reports` ni ham o'qiydi. `work-report-reminder` ham cron orqali ishlaydi.
- Demak, asosiy doimiy yuk — soatlik cron, to'lov xabarlari emas.

## Maqsad

Bir sutkalik aniq o'lchov olib, "20 Cloud krediti oyiga yetadimi?" degan savolga raqam bilan javob berish.

## Reja

1. **Boshlang'ich nuqtani yozib olish** — bugungi (9-sentabr) Cloud kredit sarfini va baza so'rovlari statistikasini olish.
2. **24 soat kutish, hech narsa o'zgartirmasdan** — bot odatdagidek ishlaydi.
3. **Ertaga o'lchash** — Cloud sarfi va so'rovlar sonining farqini olib, bir kunlik xarajat chiqariladi, keyin ×30 qilib oylik prognoz tuziladi.
4. **Xulosa va tavsiya**:
   - Agar oylik prognoz 20 dan kam bo'lsa — hech narsa o'zgartirmaymiz.
   - Agar 20 dan oshsa — soatlik cronni kamaytirish (masalan, faqat kerakli soatlarda ishga tushirish) yoki keraksiz xabarlarni o'chirish taklif qilinadi.

## Kod o'zgarishi (agar 20 yetmasa)

- `daily_cash_report_hourly` cron jadvalini har soatdan aqlliroq jadvalga o'tkazish: tenantlar tanlagan soatlar ro'yxatiga qarab faqat o'sha soatlarda chaqirish.
- Har chaqiruvda `bot_settings` va `telegram_groups` ni bitta birlashtirilgan so'rovga yig'ish (24 ta o'rniga kamroq so'rov).
- `work-report-reminder` ni ham faqat kerakli soatda ishlashini tekshirish.

Bu bosqich faqat 1-kunlik o'lchov natijasiga qarab bajariladi.
