"""Баннеры главной, встроенная читалка книги, реферальная цепочка и админ-раздел партнёров — в браузере (Playwright).
Сервер — настоящие обработчики академии (книга, рефералы, CMS) на тестовой Firestore. Запуск: python3 tests/e2e/features_e2e.py"""
import os, re, json, subprocess, urllib.request, urllib.error
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
PORT = os.environ.get("PORT", "8791"); B = f"http://127.0.0.1:{PORT}"
FAKE = {n: open(os.path.join(HERE, "fake-firebase", n)).read() for n in ["firebase-app.js", "firebase-auth.js"]}
results, js_errors = [], []
get = lambda p: json.loads(urllib.request.urlopen(B + p).read())
def status_of(path, headers=None):
    try: return urllib.request.urlopen(urllib.request.Request(B + path, headers=headers or {})).status
    except urllib.error.HTTPError as e: return e.code
def postback(**q): return get("/test/postback?" + "&".join(f"{k}={v}" for k, v in {**q, "secret": "e2e-secret-0123456789abcdef-test"}.items()))
def check(n, c, x=""): results.append(bool(c)); print(("✔ " if c else "✘ ") + n + ("" if c else f" — {str(x)[:300]}"))
def new_page(b, w=375, h=860, lang=None):
    ctx = b.new_context(viewport={"width": w, "height": h})
    ctx.route(re.compile(r"https://www\.gstatic\.com/firebasejs/.*/(firebase-(app|auth)\.js)"), lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE[r.request.url.rsplit("/", 1)[1]]))
    ctx.route(re.compile(r"https://(fonts\.googleapis\.com|fonts\.gstatic\.com|telegram\.org)/.*"), lambda r: r.fulfill(status=200, body=""))
    ctx.add_init_script("window.__opened=[];window.open=(u)=>{window.__opened.push(u);return null};" + (f"localStorage.setItem('hd_lang','{lang}');" if lang else ""))
    p = ctx.new_page(); p.on("pageerror", lambda e: js_errors.append(str(e))); return ctx, p
def register(p, email, start="/academy/"):
    p.goto(B + start); p.wait_for_selector("#loginForm"); p.click("[data-go=register]")
    p.fill("#email", email); p.fill("#password", "password1"); p.fill("#password2", "password1"); p.click("#regBtn"); p.wait_for_url(re.compile(r".*broker\.html"), timeout=10000)
def access(p, trader):
    p.wait_for_selector("#idForm"); p.click("#pocketBtn"); p.wait_for_function("window.__opened.length>0"); click = p.evaluate("window.__opened")[0].split("click_id=")[1]
    postback(type="registration", click_id=click, trader_id=trader); p.fill("#traderId", trader); p.click("#idBtn"); p.wait_for_url(re.compile(r".*deposit\.html"))
    postback(type="ftd", click_id=click, trader_id=trader, amount="60", currency="USD"); p.wait_for_url(re.compile(r".*academy\.html"), timeout=15000)
srv = subprocess.Popen(["node", os.path.join(HERE, "test-server.js")], stdout=subprocess.PIPE, text=True, env={**os.environ, "PORT": PORT, "REFERRAL_MODE": "test"}); srv.stdout.readline()
try:
  with sync_playwright() as pw:
    b = pw.chromium.launch()
    # ---------- Баннеры главной: компьютер ----------
    ctx, p = new_page(b, 1280); register(p, "reader@test.com"); access(p, "77700011")
    p.wait_for_selector("#bannerSec:not([hidden]) a.hd-banner")
    boxes = p.eval_on_selector_all("a.hd-banner", "els=>els.map(e=>{const r=e.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)]})")
    texts = p.eval_on_selector_all("a.hd-banner", "els=>els.map(e=>[e.querySelector('.hb-title').textContent,e.querySelector('.hb-cta').textContent,e.getAttribute('href')])")
    check("компьютер: два баннера одинакового размера", len(boxes) == 2 and boxes[0] == boxes[1], boxes)
    check("баннер книги: «THE HIDDEN REACTION SYSTEM», «Читать книгу» → читалка", texts[0] == ["THE HIDDEN REACTION SYSTEM", "Читать книгу", "reader.html"], texts)
    check("баннер партнёров: «INVITE & EARN», «Мой кабинет» → кабинет", texts[1] == ["INVITE & EARN", "Мой кабинет", "partner.html"], texts)
    check("у кнопок есть круглая стрелка; описаний под баннерами нет", p.locator("a.hd-banner .hb-arrow").count() == 2 and p.locator("#bannerSec p").count() == 0)
    p.wait_for_function("[...document.querySelectorAll('a.hd-banner img')].every(i=>i.complete&&i.naturalWidth>0)", timeout=10000)
    check("изображения баннеров загружены", all(p.eval_on_selector_all("a.hd-banner img", "els=>els.map(e=>e.complete&&e.naturalWidth>0)")))
    p.screenshot(path="/tmp/feat_home_desktop.png")
    # ---------- Читалка ----------
    p.click("a.hd-banner >> nth=0"); p.wait_for_url(re.compile(r".*reader\.html")); p.wait_for_selector("#page:not([hidden])", timeout=20000)
    check("читалка: оригинальный PDF открыт, страниц 49", p.inner_text("#of") == "/ 49", p.inner_text("#of"))
    filled = p.evaluate("(()=>{const c=document.getElementById('page');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4000)if(d[i]+d[i+1]+d[i+2]>60)n++;return n})()")
    check("страница действительно отрисована (не пустой холст)", filled > 20, filled)
    p.click("#next"); p.wait_for_function("document.body.dataset.page==='2'"); check("«Вперёд» → страница 2", p.input_value("#num") == "2")
    p.fill("#num", "18"); p.press("#num", "Enter"); p.wait_for_function("document.body.dataset.page==='18'"); check("переход к странице 18", p.input_value("#num") == "18")
    w0 = p.evaluate("document.getElementById('page').getBoundingClientRect().width"); p.click("#zin"); p.wait_for_timeout(600)
    w1 = p.evaluate("document.getElementById('page').getBoundingClientRect().width"); check("масштаб «+» увеличивает страницу", w1 > w0 * 1.15, [w0, w1])
    p.click("#zfit"); p.wait_for_timeout(600); check("«По ширине» возвращает исходный масштаб", abs(p.evaluate("document.getElementById('page').getBoundingClientRect().width") - w0) < 2)
    p.wait_for_timeout(1000); p.reload(); p.wait_for_function("document.body.dataset.page==='18'", timeout=20000)
    check("после перезагрузки открылась последняя страница (18) — прогресс на сервере", p.input_value("#num") == "18")
    p.click("#back"); p.wait_for_url(re.compile(r".*academy\.html")); check("возврат в академию", "academy.html" in p.url)
    ctx.close()
    # ---------- Читалка на телефоне и на английском ----------
    ctx, p = new_page(b, 375, lang="en"); register(p, "mob@test.com"); access(p, "77700012")
    p.wait_for_selector("a.hd-banner"); boxes = p.eval_on_selector_all("a.hd-banner", "els=>els.map(e=>{const r=e.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)]})")
    check("телефон: баннеры одинакового размера, лента листается", boxes[0] == boxes[1] and p.evaluate("(()=>{const r=document.getElementById('bannerRow');return r.scrollWidth>r.clientWidth})()"), boxes)
    check("EN: кнопки баннеров переведены", p.eval_on_selector_all("a.hd-banner .hb-cta", "e=>e.map(x=>x.textContent)") == ["Read the book", "My dashboard"])
    p.screenshot(path="/tmp/feat_home_mobile.png")
    p.goto(B + "/academy/reader.html"); p.wait_for_selector("#page:not([hidden])", timeout=20000)
    check("телефон: нет горизонтальной прокрутки страницы", p.evaluate("document.documentElement.scrollWidth <= window.innerWidth"))
    check("EN: интерфейс читалки на английском", p.inner_text("#zfit") == "Fit width" and "Academy" in p.inner_text("#back"))
    check("после открытия блок загрузки скрыт (не висит над страницей)", not p.is_visible("#msg"))
    over = p.evaluate("[...document.querySelectorAll('.rd-bar button, .rd-bar input')].filter(e=>{const r=e.getBoundingClientRect();return r.right>window.innerWidth+0.5||r.left<-0.5}).map(e=>e.id)")
    check("телефон: все кнопки нижней панели помещаются по ширине", over == [], over)
    check("телефон: страница книги не шире экрана при масштабе «по ширине»", p.evaluate("document.getElementById('page').getBoundingClientRect().right <= window.innerWidth"))
    p.screenshot(path="/tmp/feat_reader_mobile.png")
    ctx.close()
    # ---------- Защита PDF ----------
    check("PDF не доступен по прямому пути", status_of("/private/books/the-hidden-reaction-system-v1.0-ru.pdf") == 404 and status_of("/academy/../private/books/the-hidden-reaction-system-v1.0-ru.pdf") in (403, 404))
    check("PDF без входа → 401", status_of("/api/learn/books/hidden-reaction-system/file") == 401)
    ctx, p = new_page(b); register(p, "nodep@test.com")
    tok = "testtoken-nodep_test_com"
    check("PDF без доступа к академии → 403", status_of("/api/learn/books/hidden-reaction-system/file", {"Authorization": "Bearer " + tok}) == 403)
    ctx.close()
    # ---------- Реферальная цепочка ----------
    ctx, p = new_page(b); register(p, "partner@test.com"); access(p, "77700013")
    p.goto(B + "/academy/partner.html"); p.wait_for_selector("#lnk")
    link = p.input_value("#lnk"); code = link.split("ref=")[1]
    check("кабинет: персональная ссылка с кодом", re.fullmatch(r"[A-Z2-9]{8}", code) is not None, link)
    check("кабинет: тестовый режим явно обозначен", "Тестовый режим" in p.inner_text("#pt"))
    ctx2, q = new_page(b); register(q, "friend@test.com", start="/academy/?ref=" + code); q.wait_for_timeout(800); ctx2.close()
    p.reload(); p.wait_for_selector("#lnk")
    check("приглашённый виден у партнёра: 1, статус «Зарегистрирован», без email", "Зарегистрирован" in p.inner_text("#pt") and "friend" not in p.inner_text("#pt"), p.inner_text("#pt")[:300])
    check("вывод недоступен при нулевом балансе", p.is_disabled("#wbtn"))
    p.screenshot(path="/tmp/feat_partner.png", full_page=True)
    ctx.close()
    # ---------- Админка: партнёры и баннер из CMS ----------
    ctx, p = new_page(b, 1280); register(p, "boss@test.com"); get("/test/role?uid=boss_test_com&role=super_admin")
    p.goto(B + "/admin/#/partners"); p.wait_for_selector("#pq"); p.fill("#pq", code); p.click("#pf .primary"); p.wait_for_selector("#pr a")
    check("админка: поиск партнёра по реферальному коду", "partner" in p.inner_text("#pr"))
    p.click("#pr a"); p.wait_for_selector("#pev"); check("карточка партнёра: приглашённый виден с email для администратора", "friend" in p.inner_text("#main"))
    p.goto(B + "/admin/#/announcements"); p.wait_for_selector("#na"); p.click("#na")
    p.select_option("#modalBody [name=kind]", "banner"); p.fill("#modalBody [name=title]", "Новый курс скоро")
    p.fill("#modalBody [name=title_i18n_ru]", "НОВЫЙ КУРС"); p.fill("#modalBody [name=cta_i18n_ru]", "Узнать"); p.select_option("#modalBody [name=action_type]", "soon")
    p.select_option("#modalBody [name=image_builtin]", "mascot"); p.select_option("#modalBody [name=status]", "published"); p.check("#modalBody [name=confirm]")
    check("админка: живой предпросмотр баннера", "НОВЫЙ КУРС" in p.inner_text("#annpv") and "Скоро" in p.inner_text("#annpv"))
    p.click("#modalBody .mf .primary"); p.wait_for_selector("#al table", timeout=8000)
    ctx.close()
    ctx, p = new_page(b, 1280)
    p.goto(B + "/academy/"); p.wait_for_selector("#loginForm"); p.fill("#email", "reader@test.com"); p.fill("#password", "password1")
    ctx.close()
    ctx, p = new_page(b, 1280); register(p, "viewer@test.com"); access(p, "77700014"); p.wait_for_selector(".hd-banner")
    cards = p.eval_on_selector_all(".hd-banner", "els=>els.map(e=>[e.tagName,e.querySelector('.hb-title').textContent,e.querySelector('.hb-cta').textContent])")
    check("главная: после публикации своего баннера стандартные скрыты, «Скоро» без ссылки", cards == [["DIV", "НОВЫЙ КУРС", "Скоро"]], cards)
    ctx.close(); b.close()
finally:
    srv.terminate()
print("ошибки JavaScript на страницах:", "нет" if not js_errors else js_errors[:5]); print(f"итого: {sum(results)} из {len(results)}"); raise SystemExit(0 if all(results) and not js_errors else 1)
