const tgt = {
  uz: { "tgt.tab": "Targetlar", "tgt.title": "Oylik targetlar", "tgt.employee": "Xodim", "tgt.contracts": "Sotilgan shartnomalar", "tgt.docs": "Topshirilgan hujjatlar", "tgt.target": "Target", "tgt.save": "Saqlash", "tgt.saved": "Targetlar saqlandi", "tgt.send": "Telegramga yuborish", "tgt.sent": "Yuborildi", "tgt.notLinked": "Telegram ulanmagan", "tgt.hint": "Hisob shartnoma sanasi bo'yicha: sotuvchi — sotuv menejeri, hujjat — back office xodimi.", "tgt.adminOnly": "Targetlarni faqat admin o'zgartiradi." },
  en: { "tgt.tab": "Targets", "tgt.title": "Monthly targets", "tgt.employee": "Employee", "tgt.contracts": "Contracts sold", "tgt.docs": "Documents submitted", "tgt.target": "Target", "tgt.save": "Save", "tgt.saved": "Targets saved", "tgt.send": "Send to Telegram", "tgt.sent": "Sent", "tgt.notLinked": "Telegram not linked", "tgt.hint": "Counted by contract date: sold — sales manager, documents — back office employee.", "tgt.adminOnly": "Only an admin can change targets." },
  ru: { "tgt.tab": "Цели", "tgt.title": "Месячные цели", "tgt.employee": "Сотрудник", "tgt.contracts": "Проданные договоры", "tgt.docs": "Поданные документы", "tgt.target": "Цель", "tgt.save": "Сохранить", "tgt.saved": "Цели сохранены", "tgt.send": "Отправить в Telegram", "tgt.sent": "Отправлено", "tgt.notLinked": "Telegram не привязан", "tgt.hint": "Считается по дате договора: продажи — менеджер продаж, документы — сотрудник бэк-офиса.", "tgt.adminOnly": "Цели меняет только администратор." },
};

export const kpiRosterDict = {
  uz: { "kpiRoster.title": "KPI hisoblanadigan xodimlar", "kpiRoster.sales": "Sales", "kpiRoster.back_office": "Back office", "kpiRoster.call_centre": "Call centre", "kpiRoster.visa_bonus": "Viza bonusi", ...tgt.uz },
  en: { "kpiRoster.title": "KPI participants", "kpiRoster.sales": "Sales", "kpiRoster.back_office": "Back office", "kpiRoster.call_centre": "Call centre", "kpiRoster.visa_bonus": "Visa bonus", ...tgt.en },
  ru: { "kpiRoster.title": "Сотрудники с расчётом KPI", "kpiRoster.sales": "Продажи", "kpiRoster.back_office": "Бэк-офис", "kpiRoster.call_centre": "Колл-центр", "kpiRoster.visa_bonus": "Бонус за визу", ...tgt.ru },
};
