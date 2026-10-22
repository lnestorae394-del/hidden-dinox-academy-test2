"use strict";
/* Хранилище файлов медиа-библиотеки. Firebase Storage (через Admin SDK) — в production;
   в памяти — только для тестов. В Firestore хранятся лишь метаданные (коллекция media). */
const TYPES = {
  "image/png":  { kind: "image", max: 8 << 20, sig: b => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 },
  "image/jpeg": { kind: "image", max: 8 << 20, sig: b => b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  "image/webp": { kind: "image", max: 8 << 20, sig: b => b.length > 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP" },
  "image/gif":  { kind: "image", max: 8 << 20, sig: b => b.length > 6 && b.toString("latin1", 0, 4) === "GIF8" },
  "application/pdf": { kind: "pdf", max: 20 << 20, sig: b => b.length > 5 && b.toString("latin1", 0, 5) === "%PDF-" }
};
// SVG, HTML и исполняемые форматы не принимаются: их можно использовать для XSS
function checkUpload(contentType, buf) {
  const t = TYPES[String(contentType || "").split(";")[0].trim().toLowerCase()];
  if (!t) return { error: "UNSUPPORTED_TYPE", message: "Допустимы PNG, JPEG, WEBP, GIF и PDF. Видео — ссылкой (YouTube, Vimeo и т. п.)" };
  if (!buf || !buf.length) return { error: "EMPTY", message: "Пустой файл" };
  if (buf.length > t.max) return { error: "TOO_LARGE", message: `Файл больше ${Math.round(t.max / 1048576)} МБ` };
  if (!t.sig(buf)) return { error: "BAD_SIGNATURE", message: "Содержимое файла не соответствует его типу" };
  return { kind: t.kind };
}

function firebaseStorage(admin, bucketName) {
  let bucket = null;
  try { bucket = admin.storage().bucket(bucketName); } catch (e) { bucket = null; }
  return {
    available: !!bucket,
    async save(path, buf, contentType) { await bucket.file(path).save(buf, { contentType, resumable: false, metadata: { cacheControl: "public, max-age=86400" } }); },
    async read(path) { const [b] = await bucket.file(path).download(); return b; },
    async remove(path) { await bucket.file(path).delete({ ignoreNotFound: true }); }
  };
}
function memoryStorage() {
  const m = new Map();
  return { available: true, files: m, async save(p, b) { m.set(p, Buffer.from(b)); }, async read(p) { if (!m.has(p)) throw new Error("not found"); return m.get(p); }, async remove(p) { m.delete(p); } };
}
module.exports = { checkUpload, firebaseStorage, memoryStorage, TYPES };
