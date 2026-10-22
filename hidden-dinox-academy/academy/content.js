"use strict";
/* Проверка и нормализация контента CMS (курсы, модули, уроки, блоки, афиши).
   HTML не хранится: текст — в упрощённой разметке (жирный, курсив, списки, ссылки),
   которая безопасно отображается клиентом (всё экранируется). */

const LEVELS = ["beginner", "intermediate", "advanced"];
const BLOCK_TYPES = ["heading", "text", "terms", "image", "chart", "video", "note", "example", "practice", "quiz", "summary", "file"];
const NOTE_VARIANTS = ["important", "warning", "editorial", "source", "risk"];
const LIM = { title: 160, short: 400, text: 20000, items: 60, blocks: 80, questions: 30, options: 8 };

class ValidationError extends Error { constructor(msg, field) { super(msg); this.code = "INVALID"; this.field = field; } }
const isObj = v => v && typeof v === "object" && !Array.isArray(v);
function str(v, field, max, { required = false } = {}) {
  if (v === undefined || v === null) v = "";
  if (typeof v !== "string") throw new ValidationError("ожидается текст", field);
  v = v.replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  if (required && !v) throw new ValidationError("обязательное поле", field);
  if (v.length > max) throw new ValidationError(`не длиннее ${max} символов`, field);
  return v;
}
const num = (v, field, min, max, def) => {
  if (v === undefined || v === null || v === "") return def;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new ValidationError(`число от ${min} до ${max}`, field);
  return n;
};
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const mediaId = (v, field) => { if (!v) return null; if (typeof v !== "string" || !ID_RE.test(v)) throw new ValidationError("некорректный файл", field); return v; };
function httpsUrl(v, field, { required = false } = {}) {
  v = str(v, field, 600, { required });
  if (!v) return "";
  let u; try { u = new URL(v); } catch (e) { throw new ValidationError("некорректная ссылка", field); }
  if (u.protocol !== "https:") throw new ValidationError("ссылка должна начинаться с https://", field);
  return u.toString();
}
const isoDate = (v, field) => {
  if (!v) return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t)) throw new ValidationError("некорректная дата", field);
  return new Date(t).toISOString();
};

/* Учебный график (SVG рисует клиент): свечи + разметка. Всегда помечается как учебный пример. */
function chartSpec(c, field) {
  if (!isObj(c)) throw new ValidationError("нет данных графика", field);
  const candles = Array.isArray(c.candles) ? c.candles : [];
  if (candles.length < 2 || candles.length > 120) throw new ValidationError("от 2 до 120 свечей", field + ".candles");
  // Свеча хранится ОБЪЕКТОМ { o, h, l, c }: Firestore не принимает массив внутри массива
  // («Property array contains an invalid nested entity»). На входе принимаются обе формы:
  // [open, high, low, close] (удобно в JSON курса) и { o, h, l, c } (так хранится в базе).
  const cs = candles.map((k, i) => {
    const arr = Array.isArray(k) ? k : (isObj(k) ? [k.o, k.h, k.l, k.c] : null);
    if (!arr || arr.length !== 4 || !arr.every(x => x !== null && x !== "" && Number.isFinite(Number(x)))) throw new ValidationError(`свеча ${i + 1}: нужно [open, high, low, close] или {o, h, l, c}`, field);
    const [o, h, l, cl] = arr.map(Number);
    if (h < Math.max(o, cl) || l > Math.min(o, cl)) throw new ValidationError(`свеча ${i + 1}: high/low не охватывают тело`, field);
    return { o, h, l, c: cl };
  });
  const n = cs.length;
  const anns = (Array.isArray(c.annotations) ? c.annotations : []).slice(0, 40).map((a, i) => {
    if (!isObj(a)) throw new ValidationError("некорректная разметка", field);
    const type = ["zone", "hline", "marker", "trend"].includes(a.type) ? a.type : null;
    if (!type) throw new ValidationError(`разметка ${i + 1}: тип zone/hline/marker/trend`, field);
    const out = { type, text: str(a.text, field, 60) };
    if (type === "zone") { out.from = num(a.from, field, 0, n - 1, 0) | 0; out.to = num(a.to, field, 0, n - 1, n - 1) | 0; out.tone = ["neutral", "good", "bad", "accent"].includes(a.tone) ? a.tone : "neutral"; }
    if (type === "hline") { out.price = num(a.price, field, -1e9, 1e9, 0); out.dashed = a.dashed !== false; }
    if (type === "marker") { out.at = num(a.at, field, 0, n - 1, 0) | 0; out.pos = a.pos === "below" ? "below" : "above"; out.tone = ["neutral", "good", "bad", "accent"].includes(a.tone) ? a.tone : "accent"; }
    if (type === "trend") { out.from = num(a.from, field, 0, n - 1, 0) | 0; out.to = num(a.to, field, 0, n - 1, n - 1) | 0; out.p1 = num(a.p1, field, -1e9, 1e9, 0); out.p2 = num(a.p2, field, -1e9, 1e9, 0); }
    return out;
  });
  return { candles: cs, annotations: anns, title: str(c.title, field, 120), caption: str(c.caption, field, 300), synthetic: true };
}

function block(b, i) {
  const f = `blocks[${i}]`;
  if (!isObj(b) || !BLOCK_TYPES.includes(b.type)) throw new ValidationError("неизвестный тип блока", f);
  const t = b.type, o = { type: t, id: typeof b.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(b.id) ? b.id : "b" + i };
  if (t === "heading") o.text = str(b.text, f + ".text", LIM.title, { required: true });
  if (t === "text" || t === "summary") { o.title = str(b.title, f + ".title", LIM.title); o.text = str(b.text, f + ".text", LIM.text, { required: true }); }
  if (t === "terms") {
    o.title = str(b.title, f + ".title", LIM.title);
    o.items = (Array.isArray(b.items) ? b.items : []).slice(0, LIM.items).map((x, j) => ({ term: str(x && x.term, `${f}.items[${j}].term`, 120, { required: true }), definition: str(x && x.definition, `${f}.items[${j}].definition`, 1500, { required: true }) }));
    if (!o.items.length) throw new ValidationError("добавьте хотя бы один термин", f);
  }
  if (t === "image" || t === "file") {
    o.media_id = mediaId(b.media_id, f + ".media_id");
    o.url = t === "image" ? httpsUrl(b.url, f + ".url") : "";
    if (!o.media_id && !o.url) throw new ValidationError(t === "image" ? "выберите файл или укажите https-ссылку" : "выберите PDF-файл", f);
    o.caption = str(b.caption, f + ".caption", LIM.short); o.alt = str(b.alt, f + ".alt", LIM.short);
    if (t === "file") o.title = str(b.title, f + ".title", LIM.title);
  }
  if (t === "chart") { o.chart = chartSpec(b.chart, f + ".chart"); o.chart_role = ["illustration", "correct", "incorrect", "practice"].includes(b.chart_role) ? b.chart_role : "illustration"; }
  if (t === "video") { o.url = httpsUrl(b.url, f + ".url", { required: true }); o.title = str(b.title, f + ".title", LIM.title); o.caption = str(b.caption, f + ".caption", LIM.short); }
  if (t === "note") { o.variant = NOTE_VARIANTS.includes(b.variant) ? b.variant : "important"; o.title = str(b.title, f + ".title", LIM.title); o.text = str(b.text, f + ".text", LIM.text, { required: true }); }
  if (t === "example") { o.title = str(b.title, f + ".title", LIM.title, { required: true }); o.text = str(b.text, f + ".text", LIM.text, { required: true }); o.chart = b.chart ? chartSpec(b.chart, f + ".chart") : null; }
  if (t === "practice") { o.title = str(b.title, f + ".title", LIM.title); o.task = str(b.task, f + ".task", LIM.text, { required: true }); o.criteria = str(b.criteria, f + ".criteria", 4000); o.homework = b.homework === true; o.chart = b.chart ? chartSpec(b.chart, f + ".chart") : null; }
  if (t === "quiz") {
    o.title = str(b.title, f + ".title", LIM.title);
    o.pass_percent = num(b.pass_percent, f + ".pass_percent", 0, 100, 70);
    o.questions = (Array.isArray(b.questions) ? b.questions : []).slice(0, LIM.questions).map((q, j) => {
      const qf = `${f}.questions[${j}]`;
      const options = (Array.isArray(q && q.options) ? q.options : []).slice(0, LIM.options).map((x, k) => str(x, `${qf}.options[${k}]`, 400, { required: true }));
      if (options.length < 2) throw new ValidationError("минимум 2 варианта ответа", qf);
      const correct = num(q.correct, qf + ".correct", 0, options.length - 1, null);
      if (correct === null || !Number.isInteger(correct)) throw new ValidationError("укажите правильный ответ", qf);
      return { q: str(q.q, qf + ".q", 1000, { required: true }), options, correct, explanation: str(q.explanation, qf + ".explanation", 2000), kind: ["choice", "term", "situation", "error", "chart"].includes(q.kind) ? q.kind : "choice", chart: q.chart ? chartSpec(q.chart, qf + ".chart") : null };
    });
    if (!o.questions.length) throw new ValidationError("добавьте хотя бы один вопрос", f);
  }
  return o;
}

function course(input) {
  if (!isObj(input)) throw new ValidationError("нет данных курса", "course");
  return {
    title: str(input.title, "title", LIM.title, { required: true }),
    slug: (str(input.slug, "slug", 80) || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, ""),
    description: str(input.description, "description", 4000),
    goal: str(input.goal, "goal", 2000),
    level: LEVELS.includes(input.level) ? input.level : "beginner",
    cover_media_id: mediaId(input.cover_media_id, "cover_media_id"),
    disclaimer: str(input.disclaimer, "disclaimer", 2000),
    source: isObj(input.source) ? { title: str(input.source.title, "source.title", 200), version: str(input.source.version, "source.version", 40), note: str(input.source.note, "source.note", 1000) } : null
  };
}
function moduleDoc(input) {
  if (!isObj(input)) throw new ValidationError("нет данных модуля", "module");
  return {
    title: str(input.title, "title", LIM.title, { required: true }), goal: str(input.goal, "goal", 2000),
    prerequisites: str(input.prerequisites, "prerequisites", 2000), concepts: str(input.concepts, "concepts", 3000),
    mastery_criteria: str(input.mastery_criteria, "mastery_criteria", 3000)
  };
}
function lesson(input) {
  if (!isObj(input)) throw new ValidationError("нет данных урока", "lesson");
  const blocks = Array.isArray(input.blocks) ? input.blocks : [];
  if (blocks.length > LIM.blocks) throw new ValidationError(`не больше ${LIM.blocks} блоков`, "blocks");
  const pc = isObj(input.pass_criteria) ? input.pass_criteria : {};
  return {
    title: str(input.title, "title", LIM.title, { required: true }), outcome: str(input.outcome, "outcome", 2000),
    source_pages: str(input.source_pages, "source_pages", 120),
    status: input.status === "ready" ? "ready" : "draft",
    pass_criteria: { require_quiz: pc.require_quiz === true, min_percent: num(pc.min_percent, "pass_criteria.min_percent", 0, 100, 70) },
    blocks: blocks.map(block)
  };
}
function announcement(input) {
  if (!isObj(input)) throw new ValidationError("нет данных афиши", "announcement");
  const show_from = isoDate(input.show_from, "show_from"), show_until = isoDate(input.show_until, "show_until");
  if (show_from && show_until && Date.parse(show_until) <= Date.parse(show_from)) throw new ValidationError("окончание показа раньше начала", "show_until");
  return {
    title: str(input.title, "title", LIM.title, { required: true }), body: str(input.body, "body", 4000),
    image_media_id: mediaId(input.image_media_id, "image_media_id"), event_at: isoDate(input.event_at, "event_at"),
    cta_label: str(input.cta_label, "cta_label", 40), cta_url: httpsUrl(input.cta_url, "cta_url"),
    status: ["draft", "published", "archived"].includes(input.status) ? input.status : "draft",
    show_from, show_until, priority: num(input.priority, "priority", 0, 100, 0) | 0,
    audience: ["all", "access", "no_access"].includes(input.audience) ? input.audience : "all"
  };
}

/* Удаление правильных ответов и пояснений из урока для ученика */
function publicLesson(l) {
  const out = forClient(l);
  return { ...out, blocks: (out.blocks || []).map(b => b.type !== "quiz" ? b : { ...b, questions: b.questions.map(({ correct, explanation, ...q }) => q) }) };
}
/* Какие файлы использует контент */
function mediaRefs(doc) {
  const ids = new Set();
  if (doc.cover_media_id) ids.add(doc.cover_media_id);
  if (doc.image_media_id) ids.add(doc.image_media_id);
  for (const b of doc.blocks || []) if (b.media_id) ids.add(b.media_id);
  return ids;
}

/* Формат свечей. В Firestore свеча хранится объектом { o, h, l, c } (массив внутри массива
   Firestore не принимает). Наружу — в админ-панель и ученику — API отдаёт исходную структуру
   [open, high, low, close], как в JSON курса и в редакторе графиков. Преобразование без потерь. */
// Признак формата, видимый в диагностике: свечи хранятся объектами (исправление ошибки Firestore)
const CONTENT_FORMAT = "candles-objects-v1";
const candleToArray = k => (Array.isArray(k) ? k.slice() : [k.o, k.h, k.l, k.c]);
function chartForClient(ch) { return ch && Array.isArray(ch.candles) ? { ...ch, candles: ch.candles.map(candleToArray) } : ch; }
function forClient(lesson) {
  if (!lesson || !Array.isArray(lesson.blocks)) return lesson;
  return { ...lesson, blocks: lesson.blocks.map(b => (b && b.chart ? { ...b, chart: chartForClient(b.chart) } : b)) };
}

module.exports = { ValidationError, BLOCK_TYPES, NOTE_VARIANTS, LEVELS, course, moduleDoc, lesson, block, announcement, chartSpec, publicLesson, mediaRefs, forClient, CONTENT_FORMAT };
