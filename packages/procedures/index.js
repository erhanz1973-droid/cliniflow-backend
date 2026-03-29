/**
 * @cliniflow/procedures — canonical procedure catalog (types, i18n, validation helpers).
 * Install: root `npm install` (workspace). Import: `require("@cliniflow/procedures")`.
 * Legacy path `lib/procedures.js` re-exports this package for older requires.
 */

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
  {
    type: "XRAY",
    category: "EVENTS",
    labels: {
      en: "X-ray",
      tr: "Röntgen",
      ru: "Рентген",
      ka: "რენტგენი",
    },
  },
  {
    type: "PANORAMIC_XRAY",
    category: "EVENTS",
    labels: {
      en: "Panoramic X-ray",
      tr: "Panoramik röntgen",
      ru: "Панорамный снимок",
      ka: "პანორამული რენტგენი",
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

/** Supported `lang` query values; any other value falls back to `en`. */
const SUPPORTED_CATALOG_LANGS = Object.freeze(["en", "tr", "ru", "ka"]);
const LABEL_LANGS = new Set(SUPPORTED_CATALOG_LANGS);

/** Bump when catalog shape or procedure set changes (clients may cache by version). */
const CATALOG_PAYLOAD_VERSION = 1;

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

/** Category section titles for admin settings / API consumers (en, tr, ru, ka). */
const CATEGORY_LABELS_I18N = {
  EVENTS: {
    en: "Events",
    tr: "Olaylar",
    ru: "События",
    ka: "მოვლენები",
  },
  PROSTHETIC: {
    en: "Prosthetic",
    tr: "Protetik",
    ru: "Ортопедия",
    ka: "პროთეტიკა",
  },
  RESTORATIVE: {
    en: "Restorative",
    tr: "Restoratif",
    ru: "Терапия",
    ka: "რესტავრაცია",
  },
  ENDODONTIC: {
    en: "Endodontic",
    tr: "Endodonti",
    ru: "Эндодонтия",
    ka: "ენდოდონტია",
  },
  SURGICAL: {
    en: "Surgical",
    tr: "Cerrahi",
    ru: "Хирургия",
    ka: "ქირურგია",
  },
  IMPLANT: {
    en: "Implant",
    tr: "İmplant",
    ru: "Имплантация",
    ka: "იმპლანტაცია",
  },
};

function normalizeCatalogLang(lang) {
  const l = String(lang == null ? "" : lang)
    .trim()
    .toLowerCase()
    .slice(0, 2);
  return LABEL_LANGS.has(l) ? l : "en";
}

function getCategoryLabel(category, lang) {
  const row = CATEGORY_LABELS_I18N[category];
  const l = normalizeCatalogLang(lang);
  if (!row) return String(category || "");
  return row[l] || row.en || String(category || "");
}

/**
 * Canonical row: prefer procedure_type / type + name; id and label are legacy aliases.
 */
function buildCanonicalProcedureItem(p, lang) {
  const l = normalizeCatalogLang(lang);
  const name = getProcedureLabel(p, l);
  return {
    procedure_type: p.type,
    type: p.type,
    name,
    category: p.category,
    id: p.type,
    label: name,
  };
}

/**
 * Weak ETag for catalog responses. Includes resolved lang so ?lang= variants do not collide.
 * @param {string} resolvedLang normalized lang (en|tr|ru|ka)
 */
function proceduresCatalogETag(resolvedLang) {
  const lang = String(resolvedLang || "en")
    .toLowerCase()
    .slice(0, 2);
  return `W/"procedures-${CATALOG_PAYLOAD_VERSION}-${lang}"`;
}

/**
 * Sets ETag; if If-None-Match matches, sends 304 and returns true.
 */
function trySendProceduresCatalog304(req, res, payload) {
  const etag = proceduresCatalogETag(payload.lang);
  res.set("ETag", etag);
  const inm = req.headers["if-none-match"];
  if (!inm) return false;
  const tokens = inm.split(",").map((s) => s.trim()).filter(Boolean);
  if (tokens.includes("*") || tokens.includes(etag)) {
    res.status(304).end();
    return true;
  }
  return false;
}

/**
 * ETag for GET /api/doctor/procedures-list (subset JSON; must not reuse full-catalog ETag).
 */
function proceduresDoctorListETag(resolvedLang) {
  const lang = String(resolvedLang || "en")
    .toLowerCase()
    .slice(0, 2);
  return `W/"procedures-list-${CATALOG_PAYLOAD_VERSION}-${lang}"`;
}

function trySendProceduresDoctorList304(req, res, payload) {
  const etag = proceduresDoctorListETag(payload.lang);
  res.set("ETag", etag);
  const inm = req.headers["if-none-match"];
  if (!inm) return false;
  const tokens = inm.split(",").map((s) => s.trim()).filter(Boolean);
  if (tokens.includes("*") || tokens.includes(etag)) {
    res.status(304).end();
    return true;
  }
  return false;
}

/**
 * @param {string|null|undefined} langInput raw `lang` query (any string or absent)
 */
function buildProceduresCatalogPayload(langInput) {
  const rawRequested =
    langInput === undefined || langInput === null
      ? null
      : String(langInput).trim();
  const l = normalizeCatalogLang(langInput);
  const list = PROCEDURE_TYPES_RAW.map((p) => buildCanonicalProcedureItem(p, l));
  const categoryLabels = {};
  for (const c of CATEGORIES) {
    categoryLabels[c] = getCategoryLabel(c, l);
  }
  return {
    ok: true,
    version: CATALOG_PAYLOAD_VERSION,
    requestedLang: rawRequested === "" ? null : rawRequested,
    lang: l,
    deprecations: {
      procedure_id:
        "Deprecated for new integrations: use procedure_type (catalog type code) only. Legacy procedure_id may still appear on some treatment rows during transition.",
      fields: {
        id: "Alias of type / procedure_type; prefer procedure_type.",
        label: "Alias of name; prefer name.",
      },
    },
    procedures: list,
    data: list,
    types: list,
    categoryLabels,
    statuses: [...STATUSES],
    categories: [...CATEGORIES],
    extractionTypes: [...EXTRACTION_TYPES],
  };
}

/** @type {Record<string, (typeof PROCEDURE_TYPES_RAW)[number]>} */
const TYPE_MAP = Object.fromEntries(
  PROCEDURE_TYPES_RAW.map((p) => [String(p.type).toUpperCase(), p])
);

const DEFAULT_PROCEDURE_CATEGORY = "RESTORATIVE";

function normalizeStatus(s) {
  const raw = String(s || "PLANNED").trim().toUpperCase();
  if (raw === "DONE" || raw === "COMPLETE" || raw === "FINISHED" || raw === "CLOSED") return "COMPLETED";
  if (raw === "IN_PROGRESS") return "ACTIVE";
  if (raw === "PLANNED" || raw === "ACTIVE" || raw === "COMPLETED" || raw === "CANCELLED") return raw;
  return "PLANNED";
}

function normalizeDate(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim();
  const n = Number(v);
  if (!Number.isNaN(n) && Number.isFinite(n)) return n;
  return null;
}

function normalizeType(type) {
  return String(type || "").trim().toUpperCase();
}

function categoryForType(type) {
  const t = TYPE_MAP[String(type || "").trim().toUpperCase()];
  return t ? t.category : null;
}

function isToothLocked(proceduresList) {
  const list = Array.isArray(proceduresList) ? proceduresList : [];
  return list.some((p) => {
    const st = normalizeStatus(p?.status);
    const tp = normalizeType(p?.type);
    return st === "COMPLETED" && EXTRACTION_TYPES.has(tp);
  });
}

function validateToothUpsert(existingProcedures, incoming) {
  const procList = Array.isArray(existingProcedures) ? existingProcedures : [];
  const locked = isToothLocked(procList);

  const existing = procList.find((p) => String(p?.procedureId || p?.id || "") === String(incoming.procedureId));
  const isNew = !existing;
  if (locked && isNew) {
    return { ok: false, error: "tooth_locked", locked: true };
  }

  const effectiveCategory =
    incoming.category ||
    (existing ? categoryForType(existing.type) : null) ||
    DEFAULT_PROCEDURE_CATEGORY;

  if (incoming.status === "ACTIVE") {
    const hasOtherActiveSameCat = procList.some((p) => {
      const pid = String(p?.procedureId || p?.id || "");
      if (pid === String(incoming.procedureId)) return false;
      const pCat = categoryForType(p?.type) || DEFAULT_PROCEDURE_CATEGORY;
      return normalizeStatus(p?.status) === "ACTIVE" && pCat === effectiveCategory;
    });
    if (hasOtherActiveSameCat) {
      return { ok: false, error: "active_conflict", category: effectiveCategory };
    }
  }

  return { ok: true, locked, effectiveCategory };
}

module.exports = {
  PROCEDURE_TYPES,
  EXTRACTION_TYPES,
  CATEGORIES,
  STATUSES,
  SUPPORTED_CATALOG_LANGS,
  CATALOG_PAYLOAD_VERSION,
  getProcedureLabel,
  getCategoryLabel,
  normalizeCatalogLang,
  buildCanonicalProcedureItem,
  buildProceduresCatalogPayload,
  proceduresCatalogETag,
  trySendProceduresCatalog304,
  proceduresDoctorListETag,
  trySendProceduresDoctorList304,
  TYPE_MAP,
  DEFAULT_PROCEDURE_CATEGORY,
  normalizeStatus,
  normalizeType,
  normalizeDate,
  categoryForType,
  isToothLocked,
  validateToothUpsert,
};
