"""Сквозные проверки интерфейса академии в браузере (Chromium через Playwright).
Запуск: node tests/e2e/test-server.js & python3 tests/e2e/e2e_test.py
Firebase Auth подменяется тестовыми модулями; /api и postback — настоящие обработчики academy/."""
import json, os, re, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = 8790; B = f"http://127.0.0.1:{PORT}"
srv = subprocess.Popen(["node", os.path.join(HERE, "test-server.js")], stdout=subprocess.PIPE, text=True, env={**os.environ, "PORT": str(PORT)})
import atexit; atexit.register(lambda: srv.poll() is None and srv.terminate())
assert srv.stdout.readline().strip() == "ready"
FAKE = {n: open(os.path.join(HERE, "fake-firebase", n)).read() for n in ["firebase-app.js", "firebase-auth.js"]}
def get(path): return json.loads(urllib.request.urlopen(B + path).read())
def postback(**q): return get("/test/postback?" + "&".join(f"{k}={v}" for k, v in {**q, "secret": "e2e-secret-0123456789abcdef-test"}.items()))

results = []; errors = []
def check(name, cond, extra=""):
    results.append(("✔ " if cond else "✘ ") + name + (f" — {extra}" if extra and not cond else ""))

def new_page(b, w=375):
    ctx = b.new_context(viewport={"width": w, "height": 812})
    ctx.route(re.compile(r"https://www\.gstatic\.com/firebasejs/.*/(firebase-(app|auth)\.js)"),
              lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE[r.request.url.rsplit("/", 1)[1]]))
    ctx.route(re.compile(r"https://(fonts\.googleapis\.com|fonts\.gstatic\.com|telegram\.org)/.*"), lambda r: r.fulfill(status=200, body=""))
    ctx.add_init_script("window.__opened=[];window.open=(u)=>{window.__opened.push(u);return null};")
    p = ctx.new_page(); p.on("pageerror", lambda e: errors.append(str(e)))
    return ctx, p

def page_name(p): return p.url.split("/academy/")[-1] or "index.html"
def wait_page(p, name, t=6000):
    try: p.wait_for_url(re.compile(".*/academy/" + re.escape(name) + r"(\?.*)?$"), timeout=t); return True
    except Exception: return False

with sync_playwright() as pw:
    b = pw.chromium.launch()
    # ---------- Новый пользователь: регистрация → брокер ----------
    ctx, p = new_page(b)
    p.goto(B + "/academy/"); p.wait_for_selector("#loginForm")
    check("страница входа открывается по адресу /academy/", p.is_visible("#loginBtn"))
    p.click("[data-go=register]"); p.fill("#email", "anna@test.com"); p.fill("#password", "password1"); p.fill("#password2", "password1")
    p.click("#regBtn")
    check("после регистрации — страница брокера", wait_page(p, "broker.html"))
    p.wait_for_selector("#idForm")
    check("Firebase инициализирован один раз", p.evaluate("window.__fbInitCount") == 1)
    check("на localhost — эмулятор Auth и демо-проект", p.evaluate("window.__emulatorUrl") == "http://127.0.0.1:9099" and p.evaluate("window.HD_FIREBASE_CONFIG.projectId") == "demo-hd-academy")
    # Партнёрская ссылка с устойчивым click_id
    p.click("#pocketBtn"); p.wait_for_timeout(400)
    p.click("#pocketBtn"); p.wait_for_timeout(400)
    opened = p.evaluate("window.__opened")
    base = "https://u3.shortink.io/register?utm_campaign=836358&utm_source=affiliate&utm_medium=sr&a=h9nxhW8rfWngjm&al=1805745&ac=academy&cid=987453&code=BTM134&click_id="
    check("кнопка POCKET открывает партнёрскую ссылку без изменений + click_id", len(opened) == 2 and opened[0].startswith(base) and re.fullmatch(r"hd_[0-9a-f]{32}", opened[0][len(base):]) is not None, str(opened[:1]))
    check("click_id одинаковый при повторных нажатиях", len(set(opened)) == 1)
    click_id = opened[0][len(base):]
    # Trader ID: формат, затем случайный ID без postback
    p.fill("#traderId", "12ab"); p.click("#idBtn"); p.wait_for_timeout(200)
    check("неверный формат Trader ID — ошибка у поля", p.is_visible("#e_traderId") and p.inner_text("#e_traderId") != "")
    p.fill("#traderId", "55500011"); p.click("#idBtn"); p.wait_for_timeout(700)
    check("ID без подтверждённой регистрации отклонён, понятная ошибка", "не подтверждён для вашего аккаунта" in p.inner_text("#e_traderId") and "broker.html" in p.url, p.inner_text("#e_traderId"))
    # Pocket Partners присылает регистрацию → ID принимается
    r0 = postback(click_id=click_id, trader_id="55500011")
    check("Registration postback принят", r0["status"] == "registration_confirmed" and r0["http"] == 200, str(r0))
    p.click("#idBtn")
    check("после подтверждения ID принят — страница проверки баланса", wait_page(p, "deposit.html"))
    p.wait_for_selector(".statuscard")
    check("состояние «ожидание», сумма не подтверждена", "Ожидаем подтверждение депозита" in p.inner_text(".statuscard") and "$ —" in p.inner_text(".amount"))
    check("на странице депозита показан минимум $50", "$50" in p.inner_text(".req"))
    # «Изменить ID» без цикла; новый ID тоже должен быть подтверждён
    p.click("#changeId")
    check("«Изменить» открывает ввод ID и не возвращает обратно", wait_page(p, "broker.html") and (p.wait_for_timeout(1500) or True) and "broker.html" in p.url)
    p.wait_for_selector("#idForm")
    check("поле заполнено текущим ID", p.input_value("#traderId") == "55500011")
    p.fill("#traderId", "55500012"); p.click("#idBtn"); p.wait_for_timeout(700)
    check("смена на неподтверждённый ID отклонена", "не подтверждён" in p.inner_text("#e_traderId"))
    postback(click_id=click_id, trader_id="55500012")
    p.click("#idBtn")
    check("смена на подтверждённый ID — снова проверка баланса", wait_page(p, "deposit.html"))
    p.wait_for_selector("#depTid"); p.wait_for_timeout(500)
    check("показан новый Trader ID", p.inner_text("#depTid") == "55500012")
    # Подтверждения от «партнёра» (настоящий обработчик postback)
    r2 = postback(click_id=click_id, trader_id="55500012", amount="39.99", currency="USD")
    check("First Deposit $39.99 принят", r2["status"] == "ftd_recorded", str(r2))
    p.wait_for_selector(".statuscard.s-low", timeout=8000)
    txt = p.inner_text("#main")
    check("$39.99: доступ закрыт, понятное сообщение", "Депозит не подтверждён в нужном размере" in txt and "$39.99" in txt and "academy.html" not in p.url)
    check("порог $40 нигде не показан", not re.search(r"\$\s?40\b", txt))
    check("пункт «Первый депозит подтверждён» без галочки", p.locator(".checks li", has_text="Первый депозит подтверждён").get_attribute("class") == "wait")
    check("смена ID скрыта после подтверждённого депозита", not p.is_visible("#changeId"))
    p.click(".langs button[data-lang=en]"); p.wait_for_timeout(300)
    check("перевод EN для недостаточного депозита", "Deposit not confirmed at the required amount" in p.inner_text("#main"))
    p.click(".langs button[data-lang=ru]")
    r3 = postback(click_id=click_id, trader_id="55500012", amount="100", currency="USD", type="redeposit")
    p.reload(); p.wait_for_selector(".statuscard"); p.wait_for_timeout(1500)
    check("повторный депозит $100 не открывает доступ", r3["status"] == "redeposit_recorded" and "deposit.html" in p.url, str(r3))
    # прямое открытие академии и попытка сменить ID через URL
    p.goto(B + "/academy/academy.html")
    check("прямое открытие academy.html без доступа → страница проверки", wait_page(p, "deposit.html"))
    p.goto(B + "/academy/broker.html?change=1")
    check("broker.html?change=1 при заблокированном ID → обратно на проверку", wait_page(p, "deposit.html"))
    ctx.close()

    # ---------- Второй пользователь: $40.00 → академия ----------
    ctx, p = new_page(b)
    p.goto(B + "/academy/"); p.wait_for_selector("#loginForm")
    p.click("[data-go=register]"); p.fill("#email", "boris@test.com"); p.fill("#password", "password1"); p.fill("#password2", "password1"); p.click("#regBtn")
    wait_page(p, "broker.html"); p.wait_for_selector("#idForm")
    p.click("#pocketBtn"); p.wait_for_timeout(300); cid2 = p.evaluate("window.__opened")[0][len(base):]
    p.fill("#traderId", "55500012"); p.click("#idBtn"); p.wait_for_timeout(800)
    check("чужой подтверждённый Trader ID нельзя привязать", "не подтверждён для вашего аккаунта" in p.inner_text("#e_traderId"), p.inner_text("#e_traderId"))
    postback(click_id=cid2, trader_id="55500020")
    p.fill("#traderId", "55500020"); p.click("#idBtn"); wait_page(p, "deposit.html"); p.wait_for_selector(".statuscard")
    postback(click_id=cid2, trader_id="55500020", amount="40.00", currency="USD")
    check("$40.00: автоматический переход в академию", wait_page(p, "academy.html", 12000))
    p.wait_for_selector(".row.key .dot.ok", timeout=6000)
    check("в академии «Активирован» из ответа сервера", "Активирован" in p.inner_text("#statusBody"))
    check("Trader ID в академии замаскирован", "••••0020" in p.inner_text("#statusBody") and "55500020" not in p.inner_text("#statusBody"))
    p.reload(); p.wait_for_selector(".row.key .dot.ok", timeout=6000)
    check("после обновления страницы сессия восстановлена, этап — академия", "academy.html" in p.url)
    sw = p.evaluate("document.documentElement.scrollWidth")
    check("академия без горизонтальной прокрутки на 375 px", sw == 375, str(sw))
    # Ошибка сервера: доступ не показывается
    get("/test/outage?on=1"); p.reload(); p.wait_for_selector(".errbox", timeout=6000)
    check("сбой базы: показана ошибка, «Активирован» не показан", "Активирован" not in p.inner_text("#statusBody"))
    get("/test/outage?on=0")
    # Выход и повторный вход
    p.reload(); p.wait_for_selector(".row.key"); p.click(".p-profile [data-signout]")
    check("выход → страница входа", wait_page(p, "index.html"))
    p.goto(B + "/academy/academy.html")
    check("после выхода academy.html недоступна → вход", wait_page(p, "index.html"))
    p.wait_for_selector("#loginForm"); p.fill("#email", "boris@test.com"); p.fill("#password", "wrongpass"); p.click("#loginBtn"); p.wait_for_timeout(500)
    check("неверный пароль — понятная ошибка", "Неверный email или пароль" in p.inner_text("#noticeText"))
    p.fill("#password", "password1"); p.click("#loginBtn")
    check("повторный вход → сразу академия", wait_page(p, "academy.html"))
    ctx.close()

    # ---------- Повторная регистрация того же email, сброс пароля, сбой сети ----------
    ctx, p = new_page(b)
    p.goto(B + "/academy/"); p.wait_for_selector("#loginForm")
    p.evaluate("localStorage.setItem('fakeFbAccounts', JSON.stringify({'anna@test.com':'password1'}))")
    p.click("[data-go=register]"); p.fill("#email", "anna@test.com"); p.fill("#password", "password1"); p.fill("#password2", "password1"); p.click("#regBtn"); p.wait_for_timeout(500)
    check("повторная регистрация email — предложение войти", "уже есть" in p.inner_text("#noticeText"))
    p.click("[data-go=login]"); p.click("[data-go=reset]"); p.fill("#email", "nobody@test.com"); p.click("#resetBtn"); p.wait_for_timeout(400)
    check("сброс пароля не раскрывает, есть ли аккаунт", "Если аккаунт с этим email существует" in p.inner_text("#noticeText"))
    p.goto(B + "/academy/"); p.wait_for_selector("#loginForm"); p.evaluate("window.__fakeNetDown=true")
    p.click("[data-go=register]"); p.fill("#email", "c@test.com"); p.fill("#password", "password1"); p.fill("#password2", "password1"); p.click("#regBtn"); p.wait_for_timeout(500)
    check("ошибка сети при регистрации — сообщение, кнопка снова активна", "Нет связи" in p.inner_text("#noticeText") and p.is_enabled("#regBtn"))
    ctx.close()

    # ---------- На не-локальном адресе — настоящий проект, без эмулятора ----------
    ctx, p = new_page(b)
    ctx.route(re.compile(r"https://academy\.example/.*"), lambda r: r.fulfill(response=r.fetch(url=r.request.url.replace("https://academy.example", B))))
    p.goto("https://academy.example/academy/"); p.wait_for_selector("#loginForm")
    check("на production-адресе — проект ai-boost-10540, эмулятор не подключается",
          p.evaluate("window.HD_FIREBASE_CONFIG.projectId") == "ai-boost-10540" and p.evaluate("window.__emulatorUrl") is None)
    ctx.close()

    # ---------- Адаптивность 320 px ----------
    for h in [568, 640, 700, 812]:
        ctx, p = new_page(b, 320); p.set_viewport_size({"width": 320, "height": h})
        p.goto(B + "/academy/"); p.wait_for_selector("#main .screen"); p.wait_for_timeout(900)
        check(f"вход: нет горизонтальной прокрутки на 320×{h}", p.evaluate("document.documentElement.scrollWidth") == 320)
        if h == 700: p.screenshot(path="/tmp/e2e_login_320.png")
        ctx.close()
    b.close()

srv.terminate()
print("\n".join(results))
print("ошибки JavaScript на страницах:", errors or "нет")
fails = sum(1 for r in results if r.startswith("✘"))
print(f"итого: {len(results) - fails} из {len(results)}")
sys.exit(1 if fails or errors else 0)
