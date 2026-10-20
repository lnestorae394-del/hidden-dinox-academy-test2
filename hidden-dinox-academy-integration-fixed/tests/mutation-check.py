import subprocess,shutil,os,tempfile
os.chdir(tempfile.mkdtemp())
M=[
("access.js","const ACCESS_MIN_USD_CENTS = 4000;","const ACCESS_MIN_USD_CENTS = 3999;","порог $39.99 вместо $40.00"),
("access.js","const ACCESS_MIN_USD_CENTS = 4000;","const ACCESS_MIN_USD_CENTS = 4001;","порог $40.01 вместо $40.00"),
("postback.js","return checks.length > 0 && checks.every(Boolean);","return true;","отключена проверка источника"),
("postback.js",'if (ev.exists) return { status: "duplicate", key };',"if (false) return {};","нет идемпотентности"),
("postback.js",'cfg.staticCids.includes(click)','false',"статический cid разрешён"),
("access.js","const regOk = !!(clickId && reg && reg.verified === true && reg.click_id === clickId);","const regOk = !!(reg);","чужая регистрация засчитывается"),
("access.js",'fd.currency === "USD" &&',"true &&","любая валюта как USD"),
("api.js",'if (!provenMine) throw new ApiError("TRADER_TAKEN");',"if (false) throw 0;","ID можно занять у другого"),
("api.js",'          throw new ApiError("ID_LOCKED");',"          ;","нет блокировки смены ID"),
("api.js",'if (!m) throw new ApiError("UNAUTHENTICATED");','if (!m) return { uid: "anon" };',"запрос без токена пропускается"),
("api.js",'return fail(res, "UNAVAILABLE");','return send(res, 200, { academyAccess: true });',"ошибка базы открывает доступ"),
("postback.js",'if (!cfg.enabled) return { status: "disabled" };',"","выключатель обработки игнорируется"),
("postback.js","secret: rawSecret.length >= MIN_SECRET_LENGTH ? rawSecret : \"\",","secret: rawSecret,","короткий секрет принимается"),
("postback.js","nextTotals[cur] = { sum_cents: b.sum_cents + cents, count: b.count + 1 };","nextTotals[cur] = { sum_cents: cents, count: b.count + 1 };","итог перезаписывается последней суммой"),
("postback.js",'if (kind === "ftd" && !fd) {','if (kind === "ftd" || kind === "redeposit") {',"повторный депозит заменяет FTD"),
("postback.js",'if (kind === "ftd" && !fd) {','if (kind === "ftd") {',"второй FTD заменяет первый"),
("access.js","if (regOk && referral.academy) {","if (referral && referral.academy) {","итоги видны без подтверждённой регистрации"),
("postback.js", 'const cur = currency && CURRENCY_RE.test(currency) ? currency : null;', 'const cur = currency && CURRENCY_RE.test(currency) ? currency : "USD";', "неизвестная валюта считается USD"),
]
for f,a,b,name in M:
    shutil.rmtree('mut',ignore_errors=True); shutil.copytree(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),'mut',ignore=shutil.ignore_patterns('.git'))
    p='mut/academy/'+f; s=open(p).read(); assert s.count(a)==1,(name,s.count(a)); open(p,'w').write(s.replace(a,b))
    load=subprocess.run(['node','-e',"require('./academy/"+f+"')"],cwd='mut',capture_output=True,text=True)
    if load.returncode!=0:
        print(f"{name:40s} → мутация некорректна (код не загружается) — не засчитывается"); continue
    out=subprocess.run(['node','--test','tests/academy.test.js'],cwd='mut',capture_output=True,text=True).stdout
    n=sum(1 for l in out.splitlines() if l.startswith('not ok'))
    print(f"{name:40s} → упавших тестов: {n} {'✔ поймано' if n else '✘ НЕ ПОЙМАНО'}")
shutil.rmtree('mut',ignore_errors=True)
