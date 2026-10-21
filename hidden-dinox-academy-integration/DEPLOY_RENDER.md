# HIDDEN DINOX ACADEMY — развёртывание на Render

Сервис: `https://hidden-dinox-academy-test2.onrender.com` · Firebase: `ai-boost-10540` · Запуск: `node server.js`

## 1. Что было сломано и что исправлено

| Симптом | Первопричина | Исправление |
|---|---|---|
| `Cannot find module './public/bot/bot'` | Архив академии содержал только `public/academy`; `server.js` безусловно подключал боты AI BOOST | Боты запускаются только при `ENABLE_LEGACY_BOTS=1`; если флаг задан, а файлов нет — остановка с понятным сообщением **до** запуска сервера |
| `503` на postback, нет записей в Firebase | Сервер падал при старте (см. выше) → Render отвечал 503; при неверном `FIREBASE_KEY` в лог писалось вводящее в заблуждение «serviceAccountKey.json not found» | Сервер стартует; ключ принимается как JSON или base64, исправляются `\n` в ключе, проверяется проект; в лог — точная причина ошибки без самого ключа |
| «postback отключён: ACADEMY_POSTBACK_ENABLED» | Двойной выключатель в прошлой версии | Убран. Приём включается одной переменной `POCKET_POSTBACK_SECRET` |
| Принимались посторонние Trader ID | ID можно было привязать до подтверждения регистрации | ID принимается **только** если сервер получил проверенный registration postback с `click_id`, выданным именно этому пользователю |
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

**Не задавать в этом сервисе:** `HD_TEST_MODE` (только для эмуляторов), `ENABLE_LEGACY_BOTS` (боты AI BOOST уже работают на старом сервере; второй процесс с теми же токенами конфликтует в Telegram), `ENABLE_GIT_AUTOSAVE`, `DEV_KEY`.

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
| 200 | `registration_confirmed`, `ftd_recorded`, `redeposit_recorded`, `ftd_exists_counted_as_deposit`, `registration_exists` | Обработано |
| 200 | `duplicate` | Это событие уже было обработано — повторно ничего не начисляется |
| 200 | `ftd_recorded_unknown_currency` | Первый депозит записан, но без валюты — в доступ не засчитан (см. `POSTBACK_DEFAULT_CURRENCY`) |
| 400 | `macro_not_substituted`, `invalid_trader`, `invalid_click`, `invalid_amount`, `unknown_type` | Неверные параметры |
| 401 / 403 | `secret_missing` / `secret_invalid` | Нет или неверный секрет — ничего не записано |
| 409 | `conflict_click` | Trader ID уже подтверждён с другим click_id |
| 422 | `unknown_click` | click_id не выдан академией (чужое событие) — ничего не записано |
| 503 | `not_configured`, `no_db`, `db_error` | Нет секрета / нет Firebase / ошибка Firebase — платформа может повторить позже |

## 6. Как работает защита Trader ID

1. Пользователь создаёт аккаунт академии (Firebase Authentication).
2. Кнопка POCKET получает от сервера постоянный `click_id` этого пользователя (`clicks/{click_id} → uid`) и открывает партнёрскую ссылку с ним.
3. Pocket Partners присылает registration postback → сервер проверяет секрет, формат и что `click_id` выдан академией → пишет `referrals/{traderId}.academy.registration` с `click_id` и `uid`.
4. Пользователь вводит Trader ID → сервер (по проверенному ID-токену Firebase) принимает его, **только если** регистрация для этого ID подтверждена с `click_id` этого пользователя. Иначе — `422` и понятное сообщение (ID случайный, чужой или зарегистрирован не по ссылке).
5. Депозиты записываются только для события с `click_id` академии; доступ — только при первом депозите от **$40.00 USD** на подтверждённый и привязанный ID (в интерфейсе — «$50»).
6. Повторные события не начисляются дважды; повторный депозит не меняет первый; история — в `deposit_events`, итоги по валютам — отдельно.

Всё, что приходит из браузера (`userId`, `approved`, `verified`, `depositAmount` и т. п.), игнорируется: статус вычисляет сервер.

## 7. Данные Firebase (существующие данные не удаляются и не перезаписываются)

`users/{uid}`, `clicks/{click_id}`, `trader_bindings/{traderId}`, `postback_events/{ключ}`, `deposit_events/{ключ}`. В существующей `referrals/{traderId}` старые поля AI BOOST (`trader_id`, `click_id`, `deposit`) сохраняются; академия дописывает только поле `academy` через `merge`. Миграция не требуется.

**Важно:** этот тестовый сервис пишет в production-проект `ai-boost-10540`.

## 8. Проверки

```bash
npm test                          # логика, запуск server.js в 13 конфигурациях, поиск секретов
sh tests/run-all.sh               # + сквозной тест в браузере (Python 3 + Playwright)
python3 tests/mutation-check.py   # проверка, что тесты ловят поломку каждой защиты
```
Проверка на эмуляторах Firebase — `ACADEMY_INTEGRATION.md`, раздел «Тестовое окружение».
