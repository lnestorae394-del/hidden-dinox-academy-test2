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
 ("postback.js", "next[cur] = { sum_cents: b.sum_cents + cents, count: b.count + 1 };", "next[cur] = { sum_cents: cents, count: b.count + 1 };", "итог перезаписывается последней суммой"),
 ("postback.js", 'if (kind === "ftd" && !fd) {', 'if (kind === "ftd" || kind === "redeposit") {', "повторный депозит заменяет FTD"),
 ("postback.js", 'if (kind === "ftd" && !fd) {', 'if (kind === "ftd") {', "второй FTD заменяет первый"),
 ("postback.js", 'const cur = currency && CURRENCY_RE.test(currency) ? currency : null;', 'const cur = currency && CURRENCY_RE.test(currency) ? currency : "USD";', "неизвестная валюта считается USD"),
 ("api.js", 'if (!confirmedForMe) throw new ApiError("TRADER_NOT_CONFIRMED");', "", "случайный Trader ID принимается"),
 ("api.js", "const confirmedForMe = !!(reg && reg.verified === true && user.click_id && reg.click_id === user.click_id);", "const confirmedForMe = !!(reg && reg.verified === true);", "чужой подтверждённый ID принимается"),
 ("api.js", '          throw new ApiError("ID_LOCKED");', "          ;", "нет блокировки смены ID"),
 ("api.js", 'if (!m) throw new ApiError("UNAUTHENTICATED");', 'if (!m) return { uid: "anon" };', "запрос без токена пропускается"),
 ("api.js", 'return fail(res, "UNAVAILABLE");', "return send(res, 200, { academyAccess: true });", "ошибка базы открывает доступ"),
 ("access.js", "const regOk = !!(clickId && reg && reg.verified === true && reg.click_id === clickId);", "const regOk = !!(reg);", "чужая регистрация засчитывается"),
 ("access.js", 'fd.currency === "USD" &&', "true &&", "любая валюта как USD в доступе"),
 ("access.js", "if (regOk && referral.academy) {", "if (referral && referral.academy) {", "итоги видны без подтверждённой регистрации"),
 ("firebase-init.js", "if (account.project_id !== expected) {", "if (false) {", "ключ чужого проекта Firebase принимается"),
]
caught = 0
for f, a, b, name in M:
    shutil.rmtree("mut", ignore_errors=True)
    shutil.copytree(ROOT, "mut", ignore=shutil.ignore_patterns(".git", "node_modules"))
    p = "mut/academy/" + f; s = open(p).read()
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
