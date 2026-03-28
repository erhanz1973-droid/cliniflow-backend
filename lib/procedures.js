// lib/procedures.js
// Single source of truth for procedure type definitions.
// Used by:
//   GET /api/procedures          (index.cjs)
//   GET /api/doctor/procedures   (routes/doctor/treatments.js)
//   GET /api/doctor/procedures-list (index.cjs — doctor profile)
//
// Synchronized with admin-settings.html PROCEDURE_TYPES (2026-03-10).
// Do not add types here without also updating treatment_prices entries in Supabase.

const PROCEDURE_TYPES_RAW = [
  // EVENTS
  {
    type: "TREATMENT",
    category: "EVENTS",
    labels: {
      en: "Treatment event",
      tr: "Tedavi kaydı",
      ru: "Запись лечения",
      ka: "მკურნალობის ჩანაწერი",
    },
  },
  {
    type: "CONSULT",
    category: "EVENTS",
    labels: {
      en: "Consultation",
      tr: "Muayene",
      ru: "Консультация",
      ka: "კონსულტაცია",
    },
  },
  {
    type: "FOLLOWUP",
    category: "EVENTS",
    labels: {
      en: "Follow-up",
      tr: "Kontrol",
      ru: "Контрольный приём",
      ka: "განმეორებითი ვიზიტი",
    },
  },
  {
    type: "LAB",
    category: "EVENTS",
    labels: {
      en: "Lab / imaging",
      tr: "Laboratuvar / görüntüleme",
      ru: "Лаборатория / визуализация",
      ka: "ლაბორატორია / გამოსახულება",
    },
  },
  // PROSTHETIC
  {
    type: "CROWN",
    category: "PROSTHETIC",
    labels: { en: "Crown", tr: "Kuron", ru: "Коронка", ka: "კორონა" },
  },
  {
    type: "TEMP_CROWN",
    category: "PROSTHETIC",
    labels: {
      en: "Temporary crown",
      tr: "Geçici kuron",
      ru: "Временная коронка",
      ka: "დროებითი კორონა",
    },
  },
  {
    type: "BRIDGE_UNIT",
    category: "PROSTHETIC",
    labels: {
      en: "Bridge (tooth unit)",
      tr: "Köprü (diş ünitesi)",
      ru: "Мост (зубная единица)",
      ka: "ხიდი (კბილის ერთეული)",
    },
  },
  {
    type: "TEMP_BRIDGE_UNIT",
    category: "PROSTHETIC",
    labels: {
      en: "Temporary bridge (tooth unit)",
      tr: "Geçici köprü (diş ünitesi)",
      ru: "Временный мост (зубная единица)",
      ka: "დროებითი ხიდი (კბილის ერთეული)",
    },
  },
  {
    type: "CROWN_REPLACEMENT",
    category: "PROSTHETIC",
    labels: {
      en: "Crown replacement / renewal",
      tr: "Kuron değişimi / yenileme",
      ru: "Замена / обновление коронки",
      ka: "კორონის შეცვლა / განახლება",
    },
  },
  {
    type: "BRIDGE_REPLACEMENT_OR_REMOVAL",
    category: "PROSTHETIC",
    labels: {
      en: "Bridge replacement / removal",
      tr: "Köprü değişimi / çıkarılması",
      ru: "Замена / снятие моста",
      ka: "ხიდის შეცვლა / ამოღება",
    },
  },
  {
    type: "INLAY",
    category: "PROSTHETIC",
    labels: { en: "Inlay", tr: "İnley", ru: "Инлей", ka: "ინლეი" },
  },
  {
    type: "ONLAY",
    category: "PROSTHETIC",
    labels: { en: "Onlay", tr: "Onley", ru: "Онлей", ka: "ონლეი" },
  },
  {
    type: "OVERLAY",
    category: "PROSTHETIC",
    labels: {
      en: "Overlay",
      tr: "Örtü (overlay)",
      ru: "Оверлей",
      ka: "ოვერლეი",
    },
  },
  {
    type: "POST_AND_CORE",
    category: "PROSTHETIC",
    labels: {
      en: "Post and core",
      tr: "Post ve çekirdek",
      ru: "Пост и коронковая часть",
      ka: "პოსტი და ბირთვი",
    },
  },
  // RESTORATIVE
  {
    type: "FILLING",
    category: "RESTORATIVE",
    labels: { en: "Filling", tr: "Dolgu", ru: "Пломба", ka: "პლომბა" },
  },
  {
    type: "TEMP_FILLING",
    category: "RESTORATIVE",
    labels: {
      en: "Temporary filling",
      tr: "Geçici dolgu",
      ru: "Временная пломба",
      ka: "დროებითი პლომბა",
    },
  },
  {
    type: "FILLING_REPLACEMENT_OR_REMOVAL",
    category: "RESTORATIVE",
    labels: {
      en: "Filling replacement / removal",
      tr: "Dolgu değişimi / çıkarılması",
      ru: "Замена / удаление пломбы",
      ka: "პლომბის შეცვლა / ამოღება",
    },
  },
  // ENDODONTIC
  {
    type: "ROOT_CANAL_TREATMENT",
    category: "ENDODONTIC",
    labels: {
      en: "Root canal treatment",
      tr: "Kanal tedavisi",
      ru: "Эндодонтическое лечение (каналы)",
      ka: "არხების მკურნალობა",
    },
  },
  {
    type: "ROOT_CANAL_RETREATMENT",
    category: "ENDODONTIC",
    labels: {
      en: "Root canal retreatment",
      tr: "Kanal tedavisi tekrarı",
      ru: "Повторное лечение каналов",
      ka: "არხების მკურნალობის გამეორება",
    },
  },
  {
    type: "CANAL_OPENING",
    category: "ENDODONTIC",
    labels: {
      en: "Canal opening",
      tr: "Kanal açılması",
      ru: "Прохождение / открытие канала",
      ka: "არხის გახსნა",
    },
  },
  {
    type: "CANAL_FILLING",
    category: "ENDODONTIC",
    labels: {
      en: "Canal filling",
      tr: "Kanal dolgusu",
      ru: "Пломбирование канала",
      ka: "არხის პლომბირება",
    },
  },
  // SURGICAL
  {
    type: "EXTRACTION",
    category: "SURGICAL",
    labels: {
      en: "Extraction",
      tr: "Çekim",
      ru: "Удаление зуба",
      ka: "კბილის ამოღება",
    },
  },
  {
    type: "SURGICAL_EXTRACTION",
    category: "SURGICAL",
    labels: {
      en: "Surgical extraction",
      tr: "Cerrahi çekim",
      ru: "Хирургическое удаление",
      ka: "ქირურგიული ამოღება",
    },
  },
  {
    type: "APICAL_RESECTION",
    category: "SURGICAL",
    labels: {
      en: "Apical resection",
      tr: "Apikal rezeksiyon",
      ru: "Апикальная резекция",
      ka: "აპიკალური რეზექცია",
    },
  },
  // IMPLANT
  {
    type: "IMPLANT",
    category: "IMPLANT",
    labels: {
      en: "Implant",
      tr: "İmplant",
      ru: "Имплантат",
      ka: "იმპლანტატი",
    },
  },
  {
    type: "HEALING_ABUTMENT",
    category: "IMPLANT",
    labels: {
      en: "Healing abutment",
      tr: "İyileşme abutmanı",
      ru: "Формирователь десны",
      ka: "გამკურნებელი აბუტმენტი",
    },
  },
  {
    type: "IMPLANT_CROWN",
    category: "IMPLANT",
    labels: {
      en: "Implant crown",
      tr: "İmplant üstü kuron",
      ru: "Коронка на имплантате",
      ka: "კორონა იმპლანტატზე",
    },
  },
];

/** Backward compatibility: `label` = English display string (admin UI, legacy). */
const PROCEDURE_TYPES = PROCEDURE_TYPES_RAW.map((p) => ({
  ...p,
  label: p.labels.en,
}));

const EXTRACTION_TYPES = new Set(["EXTRACTION", "SURGICAL_EXTRACTION"]);

const CATEGORIES = ["EVENTS", "PROSTHETIC", "RESTORATIVE", "ENDODONTIC", "SURGICAL", "IMPLANT"];

const STATUSES = ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"];

const LABEL_LANGS = new Set(["en", "tr", "ru", "ka"]);

/**
 * Localized procedure title. Supported: en, tr, ru, ka — unknown codes fall back to English.
 */
function getProcedureLabel(procOrType, lang) {
  const p =
    typeof procOrType === "string"
      ? PROCEDURE_TYPES.find((x) => x.type === procOrType)
      : procOrType;
  if (!p) return String(procOrType || "");
  const l = String(lang || "en")
    .toLowerCase()
    .slice(0, 2);
  const fallback = p.labels?.en ?? p.label ?? "";
  if (LABEL_LANGS.has(l) && p.labels?.[l]) return p.labels[l];
  return fallback;
}

module.exports = {
  PROCEDURE_TYPES,
  EXTRACTION_TYPES,
  CATEGORIES,
  STATUSES,
  getProcedureLabel,
};
