# HIDDEN DINOX ACADEMY — интеграция с AI BOOST

**Статус:** рабочая копия. В production не публиковалось. Обработка postback академии **выключена по умолчанию** (`ACADEMY_POSTBACK_ENABLED` не задан) — подтверждения регистрации и депозитов не записываются, доступ в академию никому не открывается. Старые маршруты и данные не удалялись и не мигрировались.

## 1. Что изменено

| Файл | Изменение |
|---|---|
| `server.js` | см. `server.js.patch`. Подключение академии перед общей статикой; закрыт `public/bot`; `/dev-deposit` запрещён без `DEV_KEY`; в `/postback` вызов обработчика академии (ошибки не влияют на ответ); регистрация в `referrals` пишется с `merge: true`; **тестовый режим** `HD_TEST_MODE` (только эмуляторы, отключает боты, git push, `approveTrader`). Без `HD_TEST_MODE` поведение старых функций прежнее |
| `academy/access.js` | расчёт доступа: первый депозит ≥ **$40.00 USD** (внутренний порог); итоги депозитов (на доступ не влияют) |
| `academy/api.js` | `GET /api/me`, `POST /api/click`, `POST /api/trader-id` — с проверкой Firebase ID token |
| `academy/postback.js` | проверенная обработка postback: явное включение, секрет ≥ 24 символов, идемпотентность, FTD один раз, учёт всех депозитов по валютам |
| `academy/index.js` | подключение к Express, статика `/academy/`, блокировка `public/bot` |
| `academy/test-mode.js` | проверка условий тестового режима (fail-closed) |
| `public/academy/**` | интерфейс; на `localhost` — эмулятор Auth и демо-проект, на остальных адресах — проект `ai-boost-10540` |
| `firebase.json`, `.firebaserc`, `.env.test.example` | тестовое окружение на эмуляторах (демо-проект `demo-hd-academy`) |
| `firestore.rules.academy-proposal` | предложение правил (в production не применено) |
| `tests/**` | автоматические тесты |
| `package.json` | только `scripts`; зависимости не менялись |

**Переносить на сервер нужно всю папку `academy/` целиком** — `server.js` подключает из неё несколько файлов.

## 2. API академии

Все маршруты требуют `Authorization: Bearer <Firebase ID token>`. UID берётся только из проверенного токена.

| Метод и путь | Вход | Ответ 200 | Ошибки |
|---|---|---|---|
| `GET /api/me` | — | `{ email, stage, traderId, traderIdMasked, traderIdLocked, brokerRegistrationConfirmed, depositState, firstDeposit, deposits, academyAccess }` | 401 `UNAUTHENTICATED`, 503 `UNAVAILABLE` / `CONFIG_MISSING` |
| `POST /api/click` | — | `{ clickId }` (один на пользователя) | 401, 429 `TOO_MANY`, 503 |
| `POST /api/trader-id` | `{ traderId }` (5–14 цифр) | как `/api/me` | 400 `INVALID`, 409 `TRADER_TAKEN` / `ID_LOCKED`, 401, 429, 503 |

- `depositState`: `none` | `low` | `ok`; `firstDeposit`: `{ amount, currency: "USD" }` или `null`.
- `deposits`: `{ count, totals: { USD: 100, EUR: 10 }, unknownCurrencyCount }` — только владельцу подтверждённой регистрации, иначе `null`. Валюты не складываются. В интерфейсе не выводится.

## 3. Данные Firestore (пишет только сервер)

| Коллекция | Содержимое |
|---|---|
| `users/{uid}` | `email`, `click_id`, `trader_id`, `trader_bound_at`, `created_at` |
| `clicks/{click_id}` | `uid`, `created_at` |
| `trader_bindings/{traderId}` | `uid`, `bound_at` — один Trader ID на один аккаунт |
| `postback_events/{ключ}` | журнал **проверенных** событий (идемпотентность). Непроверенные события в базу не пишутся |
| `deposit_events/{ключ}` | история депозитов: `kind` (`ftd` / `redeposit` / `deposit_after_ftd`), `amount_cents`, `currency`, `counted_in_totals` |
| `referrals/{traderId}` | старые поля не меняются; добавляется `academy.registration`, `academy.first_deposit`, `academy.deposit_totals.{ВАЛЮТА}.{sum_cents,count}`, `academy.deposit_count` |

Все записи одного события — в одной транзакции. Ключ события — уникальный ID от платформы (если появится макрос) или отпечаток параметров события.

## 4. Правило доступа

Одновременно: вход через Firebase; Trader ID привязан к UID; регистрация подтверждена проверенным postback с `click_id` этого пользователя; **первый** депозит в USD ≥ $40.00. Повторные депозиты не меняют первый и не помогают пройти порог. В интерфейсе везде «$50», сумма $40 не показывается.

## 5. Переменные окружения (production)

| Переменная | Значение | Назначение |
|---|---|---|
| `FIREBASE_KEY` | уже есть | ключ сервисного аккаунта `ai-boost-10540` |
| `ACADEMY_POSTBACK_ENABLED` | **не задавать**, пока не выполнен раздел 10 | `1` — включить обработку postback академии |
| `POSTBACK_SECRET` | случайная строка ≥ 24 символов | короче — считается ненастроенным |
| `POSTBACK_SECRET_PARAM` | по умолчанию `hd_key` | имя параметра секрета в URL postback |
| `POSTBACK_DEFAULT_CURRENCY` | только `USD` и только при подтверждении | если макроса валюты нет и платформа подтверждает USD |
| `POSTBACK_EVENT_ID_PARAM` | имя параметра | если у платформы есть уникальный ID события |
| `POSTBACK_ALLOWED_IPS`, `TRUST_PROXY` | не рекомендуются сейчас | только при официально опубликованных IP и проверенном числе прокси Render |
| `PARTNER_STATIC_CIDS` | по умолчанию `987453` | значения, которые нельзя принимать как click_id |
| `DEV_KEY` | не задавать | без него `/dev-deposit` отключён |
| `HD_TEST_MODE` | **никогда в production** | тестовый режим |

## 6. Тестовое окружение (эмуляторы Firebase)

> Команды этого раздела **не запускались в среде разработки**: там нет Firebase CLI и доступа в интернет. Автотесты из раздела 9 запускались.

**Требования:** Node.js 18+ (тесты проверены на 22.22.2); Firebase CLI (`firebase-tools`); Java JDK для эмулятора Firestore — требуемую версию проверьте в документации Firebase для вашей версии CLI.

Демо-проект `demo-hd-academy` не существует в облаке Google: эмуляторы не обращаются к реальным данным и не требуют входа в аккаунт.

```bash
# 1. Зависимости проекта (в копии проекта, НЕ на production-сервере)
npm ci
npm install -g firebase-tools        # или используйте npx firebase-tools
firebase --version

# 2. Эмуляторы (терминал 1). Данные хранятся в памяти и исчезают при остановке.
firebase emulators:start --only auth,firestore --project demo-hd-academy
#   Интерфейс эмуляторов: http://127.0.0.1:4000

# 3. Сервер в тестовом режиме (терминал 2)
cp .env.test.example .env.test
set -a; . ./.env.test; set +a
unset FIREBASE_KEY                   # в тестовом режиме ключ запрещён — сервер иначе не запустится
node server.js
#   Ожидаемая строка: «🧪 HD_TEST_MODE: эмуляторы Firebase, боты/git/approveTrader отключены»

# 4. Проверка (терминал 3)
set -a; . ./.env.test; set +a
npm run test:emulator

# 5. Интерфейс вручную: http://127.0.0.1:3000/academy/

# 6. Остановка: Ctrl+C в терминалах 1 и 2. Данные эмуляторов удаляются вместе с ними.
#    Очистка без остановки (то же делает test:emulator перед проверкой):
curl -X DELETE "http://127.0.0.1:9099/emulator/v1/projects/demo-hd-academy/accounts"
curl -X DELETE "http://127.0.0.1:8080/emulator/v1/projects/demo-hd-academy/databases/(default)/documents"
```

Переменные тестового режима (все — в `.env.test.example`): `HD_TEST_MODE=1`; `GCLOUD_PROJECT` — только `demo-*`; `FIRESTORE_EMULATOR_HOST` и `FIREBASE_AUTH_EMULATOR_HOST` — только `127.0.0.1`/`localhost`; `ACADEMY_POSTBACK_ENABLED=1` и тестовый `POSTBACK_SECRET` — только локально.

Сервер в тестовом режиме **откажется запускаться**, если: проект не `demo-*`; эмуляторы не на `127.0.0.1`/`localhost`; задан `FIREBASE_KEY`. В тестовом режиме не загружаются Telegram-боты, не выполняется `git push` и не вызывается `approveTrader`.

**Альтернатива — отдельный тестовый Firebase-проект и сервис Render:** новый проект Firebase (не `ai-boost-10540`) и свой сервисный аккаунт; отдельный сервис Render из ветки без автодеплоя в production; `HD_TEST_MODE` там не используется (он только для эмуляторов). Важно: старый код запускает боты и `git push` — для такого сервиса их нужно отключить отдельным согласованным изменением или не указывать токены и права на push.

## 7. Правила Firestore

`firestore.rules.academy-proposal` запрещает клиенту чтение и запись `users`, `clicks`, `trader_bindings`, `postback_events`, `deposit_events`, `referrals`. Сервер (Admin SDK) правила не проверяют. Клиент академии к Firestore не обращается.

Перед применением в production:
1. Правила складываются по «ИЛИ». Любое широкое правило (`match /{document=**} { allow read, write: if true; }` или `if request.auth != null`) отменяет запреты — его нужно убрать или сузить.
2. Старые страницы AI BOOST могли работать с `referrals` или `users` из браузера — запрет их сломает. Нужны текущие правила и старые страницы.
3. Проверка правил входит в `npm run test:emulator` (запись в `users`, `deposit_events`, чтение `referrals`).

## 8. Вопросы для Pocket Partners

Известно: макросы `CLICK_ID`, `TRADER_ID`, `SUMDEP`, `CID` (ID кампании — **не** click_id).

1. Точный синтаксис подстановки макросов в URL postback (например `{CLICK_ID}` или `[CLICK_ID]`).
2. Под каким именем параметра партнёрская ссылка принимает наш click_id (сейчас дописывается `&click_id=…`) и попадает ли он затем в `CLICK_ID`.
3. Какие события можно настроить отдельно: регистрация, первый депозит, каждый повторный депозит. Приходит ли уведомление на **каждое** пополнение.
4. Как отличить первый депозит от повторного: отдельный шаблон, параметр типа или макрос.
5. Есть ли уникальный ID события или транзакции.
6. В какой валюте `SUMDEP`; есть ли макрос валюты; это сумма пополнения клиента, а не комиссия.
7. Включены ли в `SUMDEP` бонусы или комиссии; возможны ли отмены (chargeback) и как о них сообщается.
8. Можно ли дописать в шаблон постоянный параметр (`&hd_key=…`) и сохраняется ли он без изменений.
9. Есть ли подпись запроса или опубликованный список IP-адресов отправителя.
10. Повторяет ли платформа доставку при ошибке и с каким интервалом.
11. Есть ли кнопка тестового postback, которая не создаёт начислений.

## 9. Автотесты

```bash
npm test                          # логика, подключение к server.js, изоляция тестового режима, поиск секретов
sh tests/run-all.sh               # то же + сквозной тест в браузере (Python 3 + Playwright)
python3 tests/mutation-check.py   # проверка, что тесты ловят поломку каждой защиты
npm run test:emulator             # только при запущенных эмуляторах и сервере (раздел 6)
```

## 10. Старые маршруты AI BOOST — риски (не изменены, не защищены)

| Маршрут / файл | Риск |
|---|---|
| `GET /postback` (старая логика) | без проверки источника: любой может записать `referrals/{trader}.deposit` любой суммы; `type=redeposit` вызывает `approveTrader` — **одобрение партнёру по поддельному запросу**; `cid` используется как запасной click_id, `payout`/`profit` — как сумма; FTD перезаписывается |
| `GET /check?trader_id=` | без входа: проверка существования любого Trader ID |
| `GET /check-deposit?trader_id=` | без входа: раскрывает суммы депозитов любого Trader ID; порог 30; если старые страницы выдают доступ по этому ответу — обход через чужой ID |
| `GET /check-approve` | без входа, данные из `approved.json` (теряется при перезапуске Render — риск повторного одобрения) |
| `GET /dev-deposit` | исправлено: без `DEV_KEY` отключён. С заданным `DEV_KEY` ключ передаётся в URL |
| `public/bot/*` | раздача закрыта; если в файлах были токены — их нужно считать раскрытыми |

**Проверка токенов ботов (у себя, не в чате):**
```bash
grep -nE "[0-9]{8,10}:[A-Za-z0-9_-]{30,50}" public/bot/*.js
git log -p -- public/bot | grep -nE "[0-9]{8,10}:[A-Za-z0-9_-]{30,50}"   # токен мог остаться в истории
```
Если найдено: в @BotFather → `/revoke` (или `/token`) для каждого бота; новый токен — только в переменную окружения Render; в коде читать `process.env.…`.

## 11. Критерий для обсуждения production-запуска

Обсуждать запуск можно, когда выполнено всё:
1. Получены ответы на вопросы раздела 8, настроен и проверен механизм аутентификации postback (минимум секрет в URL).
2. `npm run test:emulator` проходит на эмуляторах у вас.
3. Тестовый postback из кабинета Pocket Partners (без начислений) обработан в тестовом окружении и дал ожидаемый статус.
4. Проверены и при необходимости перевыпущены токены ботов.
5. Согласованы и проверены на эмуляторе правила Firestore с учётом старых страниц.
6. Принято решение по старым маршрутам (раздел 10).
7. Есть резервная копия Firestore и план отката (`git revert` патча; `ACADEMY_POSTBACK_ENABLED` не задавать — академия остаётся закрытой).


## Render / Pocket Partners postback settings (patched)
Set these Render environment variables:
- `ACADEMY_POSTBACK_ENABLED=1`
- `POCKET_POSTBACK_SECRET=<random secret at least 24 characters>`
- Optional `POSTBACK_DEFAULT_CURRENCY=USD` ONLY if the partner dashboard confirms `amount` is USD.

The `/postback` route now uses the Academy handler only and does not fall through to the old legacy handler that accepted arbitrary IDs. It expects the query parameter `secret` by default, plus `click_id` and `trader_id`. `type=deposit` is treated as the first-deposit event; `type=redeposit` is treated as a repeat deposit. A click ID must already exist in the `clicks` collection, created by `/api/click`, or the event is rejected as `unknown_click`.

Do not use manually invented click IDs or test amounts against production. Test only with a real click generated by the Academy site and a partner postback test event. The Academy client referral link was updated to the supplied Pocket Partners link in this package.
