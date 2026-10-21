#!/bin/sh
# Все проверки академии. Требуется Node.js 18+; для e2e — Python 3 и Playwright (pip install playwright && playwright install chromium).
set -e
cd "$(dirname "$0")/.."
echo "== 1. Серверная логика (node:test) ==";            node --test tests/academy.test.js
echo "== 2. Запуск server.js в разных конфигурациях ==";      node tests/wiring/run-wiring.js
echo "== 2б. Скрипты повторной обработки и аудита =="; node tests/wiring/scripts-cli.js
echo "== 3. Поиск секретов ==";                           node tests/secret-scan.js
if command -v python3 >/dev/null && python3 -c "import playwright" 2>/dev/null; then
  echo "== 4. Сквозной тест в браузере ==";              python3 tests/e2e/e2e_test.py
else
  echo "== 4. Сквозной тест пропущен: нет Python/Playwright =="
fi
