# HIDDEN DINOX ACADEMY — развёртывание на Render

Сервис: `https://hidden-dinox-academy-test2.onrender.com` · Firebase: `ai-boost-10540` · Запуск: `node server.js`

## 1. Что было сломано и что исправлено

| Симптом | Первопричина | Исправление |
|---|---|---|
| `Cannot find module './public/bot/bot'` | Архив академии содержал только `public/academy`; `server.js` безусловно подключал боты AI BOOST | Боты запускаются только при `ENABLE_LEGACY_BOTS=1`; если флаг задан, а файлов нет — остановка с понятным сообщением **до** запуска сервера |
| `503` на postback, нет записей в Firebase | Сервер падал при старте (см. выше) → Render отвечал 503; при неверном `FIREBASE_KEY` в лог писалось вводящее в заблуждение «serviceAccountKey.json not found» | Сервер стартует; ключ принимается как JSON или base64, исправляются `\n` в ключе, проверяется проект; в лог — точная причина ошибки без самого ключа |
| «postback отключён: ACADEMY_POSTBACK_ENABLED» | Двойной выключатель в прошлой версии | Убран. Приём включается одной переменной `POCKET_POSTBACK_SECRET` |
| Принимались посторонние Trader ID | ID можно было привязать до подтверждения регистрации | ID принимается **только** если сервер получил проверенный registration postback с `click_id`, выданным именно этому пользователю |
| Депозит не сверялся с Trader ID пользователя; депозит без регистрации сам создавал «регистрацию» | Проверялось только, что `click_id` выдан академией | Депозит учитывается только по ID с подтверждённой регистрацией **того же** `click_id`/пользователя и только если у пользователя не привязан другой ID (п. 6) |
| `currency: null`, `usd_cents: null` в первом депозите | В URL нет валюты, `POSTBACK_DEFAULT_CURRENCY` не задана — депозит окончательно записывался без валюты; повтор отбрасывался как дубликат, исправить было нечем | Депозит без валюты больше не записывается как первый: он сохраняется «в ожидании» (202). Старые записи исправляет `scripts/reprocess-deposits.js` (п. 9) |
| `/postback` всегда отвечал `OK` | Старый обработчик не проверял источник и результат | Секрет проверяется до любых записей; HTTP-статус отражает результат (таблица в п. 5) |
| `SyntaxError: Unexpected token ')'` | Той версии файла у меня нет; вероятно, следствие ручного удаления строк с ботами | Все JS-файлы проходят проверку синтаксиса; `server.js` проверен запуском |
| `404 Not Found` | По коду `/postback` всегда существует. Вероятно: запрос попал на сервис до деплоя, указан другой адрес, или Render собирает не ту папку (Root Directory) | Теперь `/postback` всегда отвечает JSON с полем `status`. Если приходит HTML-страница 404 от Render — запрос не доходит до этого сервера (см. п. 4, шаг 2) |

## 2. Переменные окружения Render (Environment)

| Переменная | Обязательна | Значение |
|---|---|---|
| `FIREBASE_KEY` | **да** | JSON сервисного аккаунта проекта `ai-boost-10540` целиком (Firebase Console → Project settings → Service accounts → Generate new private key). Можно вставить JSON как есть или в base64 |
| `POCKET_POSTBACK_SECRET` | **да** | Случайная строка ≥ 24 символов. Сгенерировать: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`. Тот же секрет — в URL Pocket Partners |
| `POSTBACK_DEFAULT_CURRENCY` | по ситуации | `USD` — **только если в Pocket Partners подтверждено, что `{sum}` всегда в долларах**. Без неё первые депозиты записываются, но доступ не открывается (валюта неизвестна) |
| `FIREBASE_PROJECT_ID` | нет | по умолчанию `ai-boost-10540` (ключ другого проекта будет отклонён) |

**Не задавать в этом сервисе:** `HD_TEST_MODE` и `TEST_POSTBACK_SECRET` (только для эмуляторов, см. `TEST_DEPOSIT.md`; на Render тестовый маршрут всё равно не включится), `ENABLE_LEGACY_BOTS` (боты AI BOOST уже работают на старом сервере; второй процесс с теми же токенами конфликтует в Telegram), `ENABLE_GIT_AUTOSAVE`, `DEV_KEY`.

**Удалить, если остались от прошлых версий** (больше не читаются): `ACADEMY_POSTBACK_ENABLED`, `POSTBACK_SECRET`, `POSTBACK_SECRET_PARAM`.

## 3. URL для Pocket Partners

Замените `ВАШ_СЕКРЕТ` на значение `POCKET_POSTBACK_SECRET`.

**Registration**
```
https://hidden-dinox-academy-test2.onrender.com/postback?click_id={click_id}&trader_id={trader_id}&secret=ВАШ_СЕКРЕТ
```
**First Deposit**
```
https://hidden-dinox-academy-test2.onrender.com/postback?click_id={click_id}&trader_id={trader_id}&amount={sum}&secret=ВАШ_СЕКРЕТ
```
**Re-deposit**
```
https://hidden-dinox-academy-test2.onrender.com/postback?type=redeposit&click_id={click_id}&trader_id={trader_id}&amount={sum}&secret=ВАШ_СЕКРЕТ
```
Макросы `{click_id}`, `{trader_id}`, `{sum}` взяты из вашей настройки. Если платформа их не подставит, сервер ответит `400 macro_not_substituted` — это будет видно в логах Render. Партнёрская ссылка в кнопке POCKET передаёт наш `click_id` параметром `click_id` (все остальные параметры ссылки не меняются).

## 4. Развёртывание по шагам

1. **Резервная копия.** В GitHub скачайте текущий репозиторий `hidden-dinox-academy-test2` (Code → Download ZIP).
2. **Где лежит `server.js`.** Render → сервис → Settings → **Root Directory**.
   - пусто → файлы проекта должны лежать в **корне** репозитория;
   - `hidden-dinox-academy-integration` → файлы лежат в этой папке.
3. **Замена файлов.** Распакуйте архив. Внутри — папка `hidden-dinox-academy-integration`. Её содержимое положите туда, куда указывает Root Directory, **с заменой**. Обязательно целиком: `server.js`, `package.json`, `package-lock.json`, папки `academy/` и `public/academy/`. Папку `public/bot` и другие старые файлы, если они есть в репозитории, не удаляйте — они не мешают.
4. **Отправка в GitHub:** Add file → Upload files (или `git add . && git commit -m "academy: fix" && git push`).
5. **Render → Settings:** Build Command `npm install`, Start Command `node server.js`.
6. **Render → Environment:** выставьте переменные из п. 2, удалите устаревшие → Save.
7. **Render → Manual Deploy → Clear build cache & deploy.**
8. **Логи после запуска.** Ожидаемые строки:
   ```
   🔥 Firebase подключён: ai-boost-10540
   ✅ academy: приём postback включён, валюта по умолчанию USD   (или «НЕ задана»)
   ℹ️ Telegram-боты AI BOOST не запускаются (ENABLE_LEGACY_BOTS≠1)
   🚀 SERVER START
   ```
   Если вместо первой строки `❌ Firebase отключён: …` — в сообщении указана точная причина (JSON не разбирается, нет поля, другой проект).
9. **Быстрая проверка в браузере:**
   - `https://hidden-dinox-academy-test2.onrender.com/postback` → JSON `{"status":"secret_missing"}` с кодом **401** = маршрут работает, секрет задан. Код **503** `not_configured` = не задан `POCKET_POSTBACK_SECRET`.
   - `/postback?click_id=test12345678&trader_id=1&secret=ВАШ_СЕКРЕТ` → **422** `unknown_click` = секрет верный, тестовый click_id (не выданный академией) ничего не записал.
   - `https://hidden-dinox-academy-test2.onrender.com/academy/` → страница входа.
10. **Firebase Console:** Authentication → Sign-in method → Email/Password включён; Settings → Authorized domains → добавить `hidden-dinox-academy-test2.onrender.com`.
11. **Pocket Partners:** вставьте URL из п. 3. Тестовый postback платформы с её собственным click_id ожидаемо получит `422 unknown_click` — это подтверждает, что секрет и маршрут работают и чужие события не записываются.

## 5. Ответы `/postback`

| Код | `status` | Значение |
|---|---|---|
| 200 | `registration_confirmed`, `registration_exists` | Регистрация подтверждена / уже была |
| 200 | `ftd_recorded`, `redeposit_recorded`, `ftd_exists_counted_as_deposit` | Депозит **учтён** |
| 200 | `duplicate` | Событие уже обработано — повторно ничего не начисляется |
| 202 | `deposit_pending_registration` | Депозит сохранён, **не учтён**: регистрация этого ID ещё не пришла. Засчитается автоматически, когда придёт регистрация с тем же `click_id` |
| 202 | `deposit_pending_currency` | Депозит сохранён, **не учтён**: валюта неизвестна (п. 9) |
| 400 | `macro_not_substituted`, `invalid_trader`, `invalid_click`, `invalid_amount`, `unknown_type` | Неверные параметры |
| 401 / 403 | `secret_missing` / `secret_invalid` | Нет или неверный секрет — ничего не записано |
| 409 | `conflict_click` | Trader ID зарегистрирован по другой ссылке / другим пользователем — не учтено, чужие данные не изменены |
| 409 | `trader_mismatch` | У этого пользователя привязан другой Trader ID — депозит не учтён (сохранён для повторной проверки) |
| 422 | `unknown_click` | `click_id` не выдан академией — ничего не записано |
| 503 | `not_configured`, `no_db`, `db_error` | Нет секрета / нет Firebase / ошибка Firebase |

## 6. Как работает защита Trader ID

1. Пользователь создаёт аккаунт академии (Firebase Authentication).
2. Кнопка POCKET получает от сервера постоянный `click_id` пользователя (`clicks/{click_id} → uid`).
3. **Регистрация.** Pocket Partners присылает registration postback → сервер проверяет секрет, формат, что `click_id` выдан академией и что ID не зарегистрирован другим пользователем → пишет `referrals/{traderId}.academy.registration` с `click_id` и `uid`. Только это подтверждает Trader ID; ввод ID пользователем подтверждением не является.
4. **Привязка.** Пользователь вводит ID → сервер (по проверенному ID-токену) принимает его только если регистрация этого ID подтверждена с `click_id` и `uid` этого пользователя → связь `UID ↔ Trader ID` сохраняется в `users/{uid}.trader_id` и `trader_bindings/{traderId}`.
5. **Депозит учитывается** только если одновременно: секрет верный; событие новое; у этого `trader_id` подтверждённая регистрация **с тем же** `click_id`/`uid`; у пользователя не привязан **другой** ID; валюта известна; сумма корректна. Иначе — отказ (409) или «в ожидании» (202), без изменения чужих данных.
6. **Доступ** вычисляется сервером из Firestore только для авторизованного UID и его подтверждённого ID: первый депозит ≥ $40.00 USD (в интерфейсе — «$50»). ID, сумма и статусы из браузера игнорируются.
7. **Смена ID** — только на ID с собственной подтверждённой регистрацией по ссылке этого пользователя; после подтверждённого первого депозита — запрещена.

## 7. Данные Firebase (существующие данные не удаляются и не перезаписываются)

| Коллекция | Что меняется в этой версии |
|---|---|
| `referrals/{traderId}` | старые поля AI BOOST (`trader_id`, `click_id`, `deposit`) **не трогаются**. В поле `academy` добавлено `pending_deposits` (отложенные депозиты со статусом) |
| `deposit_events/{ключ}` | добавлено поле `status`: `counted`, `pending_registration`, `pending_currency`, `pending_trader_mismatch`, `rejected_…` |
| `users`, `clicks`, `trader_bindings`, `postback_events` | без изменений схемы |

Миграция не нужна: новые поля добавляются через `merge`. Записи прошлой версии с `currency: null` исправляются скриптом (п. 9). Перед деплоем и после него запустите аудит (только чтение): `npm run audit`.

**Важно:** этот тестовый сервис пишет в production-проект `ai-boost-10540`. Старая запись AI BOOST (`referrals.deposit`) выполняется только для **учтённых** событий (200); отложенные (202) и отклонённые (409) её не создают.

## 8. Проверки

```bash
npm test                          # логика, запуск server.js в 10 конфигурациях, скрипты, поиск секретов
sh tests/run-all.sh               # + сквозной тест в браузере (Python 3 + Playwright)
python3 tests/mutation-check.py   # проверка, что тесты ловят поломку каждой защиты
```
Полная проверка на эмуляторах Firebase — `ACADEMY_INTEGRATION.md`, раздел «Тестовое окружение».

## 9. Исправление записей без валюты (`currency: null`, `usd_cents: null`)

Выполняется локально (нужны `npm install` и `FIREBASE_KEY` в переменной окружения) или в Render Shell, если он доступен на вашем тарифе.

1. Узнайте у Pocket Partners, в какой валюте приходит `{sum}`. **Без подтверждения шаги 4–5 не выполняйте.**
2. Аудит (ничего не меняет): `npm run audit` → смотрите `needs_reprocessing`.
3. Если `{sum}` всегда в USD — задайте в Render `POSTBACK_DEFAULT_CURRENCY=USD` и сделайте деплой: новые депозиты будут учитываться сразу.
4. Просмотр без записи: `npm run reprocess -- --currency USD`
5. Запись: `npm run reprocess -- --currency USD --apply` (можно по одному ID: `--trader 12345678`).
6. Повторный запуск безопасен: уже обработанные события не учитываются второй раз.

Без `--currency` скрипт засчитывает только депозиты, ожидавшие регистрацию или законную смену ID, и не трогает записи без валюты.

## 10. Процедура проверки после деплоя

Безопасные проверки (ничего не записывают):

| Запрос | Ожидаемый ответ |
|---|---|
| `https://hidden-dinox-academy-test2.onrender.com/postback` | **401** `secret_missing` |
| `…/postback?click_id=test12345678&trader_id=1&secret=НЕВЕРНЫЙ_СЕКРЕТ_0123456789` | **403** `secret_invalid` |
| `…/postback?click_id=test12345678&trader_id=1&secret=ВАШ_СЕКРЕТ` | **422** `unknown_click` |
| `…/postback?click_id={click_id}&trader_id=1&secret=ВАШ_СЕКРЕТ` | **400** `macro_not_substituted` |
| Тестовый postback из кабинета Pocket Partners | **422** `unknown_click` (его click_id не выдан академией) |
| `https://hidden-dinox-academy-test2.onrender.com/academy/` | страница входа |

Полная проверка на реальной регистрации: тестовый аккаунт академии → «Зарегистрироваться на POCKET» → регистрация на Pocket Option → в логах Render `postback: registration registration_confirmed → 200` → ввод Trader ID в академии (случайный ID должен быть отклонён) → депозит → в логах `ftd_recorded → 200` (или `202 deposit_pending_currency`, если валюта не настроена) → страница академии. Синтетические события в production-базе не создавайте: полный синтетический сценарий — на эмуляторах.
