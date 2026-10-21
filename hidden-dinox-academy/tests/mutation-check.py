"""Проверка самих тестов: каждая защита ломается по одной, тесты обязаны это поймать.
Запуск: python3 tests/mutation-check.py (нужен только Node.js)."""
import subprocess, shutil, os, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(tempfile.mkdtemp())
M = [
 ("access.js", "const ACCESS_MIN_USD_CENTS = 4000;", "const ACCESS_MIN_USD_CENTS = 3999;", "порог $39.99 вместо $40.00"),
 ("access.js", "const ACCESS_MIN_USD_CENTS = 4000;", "const ACCESS_MIN_USD_CENTS = 4001;", "порог $40.01 вместо $40.00"),
 ("postback.js", 'if (!safeEqual(given, cfg.secret)) return outcome("secret_invalid");', "", "неверный secret принимается"),
 ("postback.js", 'if (given === undefined || given === "") return outcome("secret_missing");', 'if (given === undefined || given === "") {}', "запрос без secret принимается"),
 ("postback.js", 'secret: raw.length >= MIN_SECRET_LENGTH ? raw : "",', "secret: raw,", "короткий secret принимается"),
 ("postback.js", 'secret_invalid:                  [403,', 'secret_invalid:                  [200,', "отклонённый postback отвечает 200"),
 ("postback.js", 'for (const v of [click, trader, amountRaw]) if (typeof v === "string" && MACRO_RE.test(v)) return outcome("macro_not_substituted");', "", "неподставленный макрос не распознаётся"),
 ("postback.js", 'if (ev.exists) return { status: "duplicate", uid: ev.data().uid || null };', "if (false) return {};", "нет защиты от повторной доставки"),
 ("postback.js", "cfg.staticCids.includes(click)", "false", "статический cid разрешён"),
 ("deposits.js", "work.deposit_totals[dep.currency] = { sum_cents: b.sum_cents + dep.amount_cents, count: b.count + 1 };", "work.deposit_totals[dep.currency] = { sum_cents: dep.amount_cents, count: b.count + 1 };", "итог перезаписывается последней суммой"),
 ("deposits.js", 'const isFirst = dep.kind === "ftd" && !work.first_deposit;', 'const isFirst = dep.kind === "ftd" || dep.kind === "redeposit";', "повторный депозит заменяет FTD"),
 ("deposits.js", 'const isFirst = dep.kind === "ftd" && !work.first_deposit;', 'const isFirst = dep.kind === "ftd";', "второй FTD заменяет первый"),
 ("postback.js", 'const cur = currency && CURRENCY_RE.test(currency) ? currency : null;', 'const cur = currency && CURRENCY_RE.test(currency) ? currency : "USD";', "неизвестная валюта считается USD"),
 ("deposits.js", '  if (regOwner && depUid && regOwner !== depUid) return "conflict_click";', '', "депозит другого пользователя академии учитывается"),
 ("deposits.js", '  if (bound && depUid && bound !== depUid && regOwner !== depUid) return "trader_bound_to_other_user";', '', "депозит по ID, привязанному другим, учитывается"),
 ("postback.js", 'else { const rc = await tx.get(db.collection("clicks").doc(oreg.click_id)); regClickUid = rc.exists ? rc.data().uid : null; }', 'else { regClickUid = null; }', "владелец по click_id регистрации не определяется (postback)"),
 ("postback.js", 'if (reg && owner && clickUid && owner !== clickUid) status = "conflict_click";', 'if (false) status = "conflict_click";', "регистрация другим пользователем академии принимается"),
 ("api.js", '        owner = c.exists ? c.data().uid : null;', '        owner = null;', "владелец по click_id регистрации не определяется (привязка)"),
 ("api.js", '      regOwner = c.exists ? c.data().uid : null;', '      regOwner = null;', "владелец по click_id регистрации не определяется (доступ)"),
 ("admin.js", '    if (owner && owner !== toUid) return { ok: false', '    if (false) return { ok: false', "перенос ID вопреки владельцу регистрации"),
 ("admin.js", '    if (fd && fd.uid && fd.uid !== toUid) return { ok: false', '    if (false) return { ok: false', "перенос ID вопреки владельцу депозита"),
 ("admin.js", '    if (apply) {\n      const t = now();', '    if (true) {\n      const t = now();', "просмотр переноса записывает изменения"),
 ("deposits.js", '  if (user && user.trader_id && String(user.trader_id) !== String(trader)) return "trader_mismatch";', '', "депозит по другому ID пользователя учитывается"),
 ("deposits.js", '  if (!work.registration || work.registration.verified !== true) {\n    work.pending_deposits', '  if (false) {\n    work.pending_deposits', "депозит без регистрации учитывается"),
 ("deposits.js", '  if (!dep.currency || !CURRENCY_RE.test(dep.currency)) {', '  if (false) {', "депозит без валюты учитывается"),
 ("deposits.js", '    if (problem) { pend[k] = { ...d, status: "rejected"', '    if (false) { pend[k] = { ...d, status: "rejected"', "отложенный чужой депозит засчитывается"),
 ("deposits.js", 'filter(k => pend[k].status === "pending")', 'filter(k => true)', "повторная обработка дублирует депозиты"),
 ("deposits.js", '    if (ev.currency || ev.counted_in_totals || ev.status) continue;', '', "исправление прошлой версии дублирует депозиты"),
 ("reprocess.js", 'if (apply && changes.length) {', 'if (changes.length) {', "режим просмотра записывает изменения"),
 ("deposits.js", 'currencyOverride && CURRENCY_RE.test(currencyOverride) ? currencyOverride : null', '"USD"', "повторная обработка подставляет USD без указания"),
 ("api.js", 'if (!confirmedForMe) throw new ApiError("TRADER_NOT_CONFIRMED");', "", "случайный Trader ID принимается"),
 ("api.js", "const confirmedForMe = !!(reg && reg.verified === true && (!owner || owner === auth.uid));", "const confirmedForMe = !!(reg && reg.verified === true);", "ID чужой регистрации принимается"),
 ("api.js", '        if (owner !== auth.uid) throw new ApiError("TRADER_TAKEN");', '', "занятый ID можно перепривязать"),
 ("api.js", 'throw new ApiError("TRADER_NOT_YOURS");\n    res.set', ';\n    res.set', "/check-deposit отдаёт данные по чужому ID"),
 ("api.js", '    const auth = await authenticate(req);\n    const { user, binding, referral, regOwner } = await loadState(auth.uid);\n    const ev = evaluateAccess({ uid: auth.uid, user, binding, referral, regOwner });\n    const asked = req.query && typeof req.query.trader_id === "string" ? req.query.trader_id.trim() : "";\n    if (asked && asked !== ev.traderId) throw new ApiError("TRADER_NOT_YOURS");\n    res.set', '    const auth = { uid: (req.query && req.query.uid) || "anon" };\n    const { user, binding, referral, regOwner } = await loadState(auth.uid);\n    const ev = evaluateAccess({ uid: auth.uid, user, binding, referral, regOwner });\n    const asked = req.query && typeof req.query.trader_id === "string" ? req.query.trader_id.trim() : "";\n    if (asked && asked !== ev.traderId) throw new ApiError("TRADER_NOT_YOURS");\n    res.set', "/check-deposit без входа"),
 ("postback.js", 'return c !== null && c > 0 ? "ftd" : "registration";', 'return amountRaw ? "ftd" : "registration";', "регистрация с суммой 0 становится депозитом"),
 ("postback.js", 'if (cents === null || cents <= 0) return outcome("invalid_amount");', 'if (cents === null) return outcome("invalid_amount");', "депозит $0 принимается"),
 ("api.js", '          throw new ApiError("ID_LOCKED");', "          ;", "нет блокировки смены ID"),
 ("api.js", 'if (!m) throw new ApiError("UNAUTHENTICATED");', 'if (!m) return { uid: "anon" };', "запрос без токена пропускается"),
 ("api.js", 'return fail(res, "UNAVAILABLE");', "return send(res, 200, { academyAccess: true });", "ошибка базы открывает доступ"),
 ("access.js", "const regOk = !!(reg && reg.verified === true && (!owner || owner === uid));", "const regOk = !!(reg);", "непроверенная регистрация засчитывается"),
 ("access.js", "const regOk = !!(reg && reg.verified === true && (!owner || owner === uid));", "const regOk = !!(reg && reg.verified === true);", "регистрация на чужой uid засчитывается"),
 ("access.js", "fd.verified === true && (!fd.uid || fd.uid === uid));", "fd.verified === true);", "депозит на чужой uid засчитывается"),
 ("access.js", 'fd.currency === "USD" &&', "true &&", "любая валюта как USD в доступе"),
 ("access.js", "if (regOk && referral.academy) {", "if (referral && referral.academy) {", "итоги видны без подтверждённой регистрации"),
 ("test-deposit.js", '  if (!testMode) return { enabled: false, reason: "HD_TEST_MODE не включён (production)" };', '', "тестовый маршрут включается в production"),
 ("test-deposit.js", '  if (env.POCKET_POSTBACK_SECRET && secret === env.POCKET_POSTBACK_SECRET) return', '  if (false) return', "тестовый секрет может совпадать с боевым"),
 ("test-deposit.js", '      if (!binding || !binding.uid || (owner && owner !== binding.uid)) return { status: "trader_not_bound" };', '      if (!binding) return { status: "trader_not_bound" };', "тестовый депозит без проверки владельца"),
 ("test-deposit.js", '      if (!reg || reg.verified !== true) return { status: "trader_not_confirmed" };', '      if (!reg) return { status: "trader_not_confirmed" };', "тестовый депозит по неподтверждённой регистрации"),
 ("test-deposit.js", '    if (!safeEqual(given, secret)) return R(403', '    if (false) return R(403', "тестовый маршрут без проверки секрета"),
 ("firebase-init.js", "if (account.project_id !== expected) {", "if (false) {", "ключ чужого проекта Firebase принимается"),
]
caught = 0
for f, a, b, name in M:
    shutil.rmtree("mut", ignore_errors=True)
    shutil.copytree(ROOT, "mut", ignore=shutil.ignore_patterns(".git", "node_modules"))
    p = "mut/academy/" + f; s = open(p).read(); a = a.replace("\\n", "\n"); b = b.replace("\\n", "\n")
    assert s.count(a) == 1, (name, s.count(a))
    open(p, "w").write(s.replace(a, b))
    if subprocess.run(["node", "-e", f"require('./academy/{f}')"], cwd="mut", capture_output=True).returncode:
        print(f"{name:45s} → мутация некорректна (код не загружается) — не засчитывается"); continue
    out = subprocess.run(["node", "--test", "tests/academy.test.js"], cwd="mut", capture_output=True, text=True).stdout
    n = sum(1 for l in out.splitlines() if l.startswith("not ok"))
    caught += bool(n)
    print(f"{name:45s} → упавших тестов: {n} {'✔ поймано' if n else '✘ НЕ ПОЙМАНО'}")
shutil.rmtree("mut", ignore_errors=True)
print(f"итого поймано: {caught} из {len(M)}")
