import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "uz" | "en" | "ru";

const dict = {
  uz: {
    "nav.dashboard": "Boshqaruv paneli",
    "nav.salaries": "Ishchilar oyliklari",
    "nav.expenses": "Xarajatlar",
    "nav.employees": "Ishchilar",
    "nav.finance": "Moliyaviy hisobot",
    "nav.admin": "Admin panel",
    "nav.settings": "Sozlamalar",
    "common.language": "Til",
    "common.logout": "Chiqish",
    "common.save": "Saqlash",
    "common.cancel": "Bekor qilish",
    "common.delete": "O'chirish",
    "common.edit": "Tahrirlash",
    "common.add": "Qo'shish",
    "common.search": "Qidirish",
    "common.loading": "Yuklanmoqda...",
    "common.total": "Jami",
    "common.year": "Yil",
    "common.month": "Oy",
    "common.actions": "Amallar",
    "common.status": "Holat",
    "common.date": "Sana",
    "common.amount": "Summa",
    "common.notes": "Izoh",
    "common.creator": "Yaratuvchi",
    "expenses.title": "Xarajatlar",
    "expenses.paid": "To'langan",
    "expenses.unpaid": "To'lanmagan",
    "expenses.partial": "Qisman",
    "salaries.title": "Ishchilar oyliklari",
    "employees.title": "Ishchilar",
    "finance.title": "Moliyaviy hisobot",
    "settings.title": "Sozlamalar",
    "settings.appearance": "Ko'rinish va til",
    "settings.languageHint": "Interfeys tilini tanlang",
  },
  en: {
    "nav.dashboard": "Dashboard",
    "nav.salaries": "Salaries",
    "nav.expenses": "Expenses",
    "nav.employees": "Employees",
    "nav.finance": "Financial report",
    "nav.admin": "Admin panel",
    "nav.settings": "Settings",
    "common.language": "Language",
    "common.logout": "Log out",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.add": "Add",
    "common.search": "Search",
    "common.loading": "Loading...",
    "common.total": "Total",
    "common.year": "Year",
    "common.month": "Month",
    "common.actions": "Actions",
    "common.status": "Status",
    "common.date": "Date",
    "common.amount": "Amount",
    "common.notes": "Notes",
    "common.creator": "Created by",
    "expenses.title": "Expenses",
    "expenses.paid": "Paid",
    "expenses.unpaid": "Unpaid",
    "expenses.partial": "Partial",
    "salaries.title": "Salaries",
    "employees.title": "Employees",
    "finance.title": "Financial report",
    "settings.title": "Settings",
    "settings.appearance": "Appearance & language",
    "settings.languageHint": "Choose the interface language",
  },
  ru: {
    "nav.dashboard": "Панель",
    "nav.salaries": "Зарплаты",
    "nav.expenses": "Расходы",
    "nav.employees": "Сотрудники",
    "nav.finance": "Финансовый отчёт",
    "nav.admin": "Админ-панель",
    "nav.settings": "Настройки",
    "common.language": "Язык",
    "common.logout": "Выйти",
    "common.save": "Сохранить",
    "common.cancel": "Отмена",
    "common.delete": "Удалить",
    "common.edit": "Изменить",
    "common.add": "Добавить",
    "common.search": "Поиск",
    "common.loading": "Загрузка...",
    "common.total": "Итого",
    "common.year": "Год",
    "common.month": "Месяц",
    "common.actions": "Действия",
    "common.status": "Статус",
    "common.date": "Дата",
    "common.amount": "Сумма",
    "common.notes": "Заметка",
    "common.creator": "Создал",
    "expenses.title": "Расходы",
    "expenses.paid": "Оплачено",
    "expenses.unpaid": "Не оплачено",
    "expenses.partial": "Частично",
    "salaries.title": "Зарплаты",
    "employees.title": "Сотрудники",
    "finance.title": "Финансовый отчёт",
    "settings.title": "Настройки",
    "settings.appearance": "Внешний вид и язык",
    "settings.languageHint": "Выберите язык интерфейса",
  },
} as const;

export type I18nKey = keyof (typeof dict)["uz"];

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: I18nKey) => string };
const I18nContext = createContext<Ctx>({ lang: "uz", setLang: () => {}, t: (k) => k });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("uz");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = (localStorage.getItem("lang") as Lang | null) ?? "uz";
    setLangState(saved);
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") localStorage.setItem("lang", l);
  };

  const t = (k: I18nKey) => (dict[lang] as Record<string, string>)[k] ?? k;
  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useT() {
  return useContext(I18nContext);
}

export const LANGUAGES: { code: Lang; label: string; flag: string }[] = [
  { code: "uz", label: "O'zbekcha", flag: "🇺🇿" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "ru", label: "Русский", flag: "🇷🇺" },
];
