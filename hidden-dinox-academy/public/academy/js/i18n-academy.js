/* Тексты главной академии (RU / EN / UA). */
const T={
ru:{w1:"Добро пожаловать в",w2:"HIDDEN DINOX ACADEMY",wSub:"Здесь будет твоё обучение. Первые разделы уже в работе — откроем их, как только они будут готовы.",
 statusH:"Статус аккаунта",
 rAccess:"Доступ к академии",rAccessOk:"Активирован",rBroker:"Брокер Pocket Option",rBrokerOk:"Подключён",rDep:"Первый депозит",rDepOk:"Подтверждён",
 src:"Источник: ответ сервера · проверено {t}",justNow:"только что",
 loadErr:"Не удалось загрузить статус аккаунта. Пока статус не получен, доступ не отображается как активный.",retry:"Повторить",
 progH:"Прогресс обучения",progEmptyT:"Обучение ещё не началось",progEmpty:"Прогресс появится здесь, когда откроется первый модуль.",progM:"Завершено модулей",progN:"Следующий шаг",
 soonH:"Разделы академии",soon:"Скоро",c1:"ИИ-помощник",c1d:"Ответы на вопросы по обучению",c2:"Тесты",c2d:"Проверка знаний по модулям",c3:"Тренировка на графике",c3d:"Практика без реальных сделок",
 soonToast:"Раздел в разработке",profile:"Профиль",acctKind:"Аккаунт академии",signedAs:"Вы вошли как",signOut:"Выйти из аккаунта",
 },
en:{w1:"Welcome to",w2:"HIDDEN DINOX ACADEMY",wSub:"Your learning will live here. The first sections are in the works — we’ll open them as soon as they’re ready.",
 statusH:"Account status",
 rAccess:"Academy access",rAccessOk:"Activated",rBroker:"Pocket Option broker",rBrokerOk:"Connected",rDep:"First deposit",rDepOk:"Confirmed",
 src:"Source: server response · checked {t}",justNow:"just now",
 loadErr:"Couldn’t load your account status. Until it loads, access isn’t shown as active.",retry:"Retry",
 progH:"Learning progress",progEmptyT:"Learning hasn’t started yet",progEmpty:"Your progress will appear here once the first module opens.",progM:"Modules completed",progN:"Next step",
 soonH:"Academy sections",soon:"Soon",c1:"AI assistant",c1d:"Answers to your learning questions",c2:"Tests",c2d:"Check your knowledge by module",c3:"Chart practice",c3d:"Practice without real trades",
 soonToast:"This section is in development",profile:"Profile",acctKind:"Academy account",signedAs:"Signed in as",signOut:"Sign out",
 },
ua:{w1:"Ласкаво просимо до",w2:"HIDDEN DINOX ACADEMY",wSub:"Тут буде твоє навчання. Перші розділи вже в роботі — відкриємо їх, щойно вони будуть готові.",
 statusH:"Статус акаунта",
 rAccess:"Доступ до академії",rAccessOk:"Активовано",rBroker:"Брокер Pocket Option",rBrokerOk:"Підключено",rDep:"Перший депозит",rDepOk:"Підтверджено",
 src:"Джерело: відповідь сервера · перевірено {t}",justNow:"щойно",
 loadErr:"Не вдалося завантажити статус акаунта. Поки статус не отримано, доступ не показується як активний.",retry:"Повторити",
 progH:"Прогрес навчання",progEmptyT:"Навчання ще не почалося",progEmpty:"Прогрес з’явиться тут, коли відкриється перший модуль.",progM:"Завершено модулів",progN:"Наступний крок",
 soonH:"Розділи академії",soon:"Незабаром",c1:"ШІ-помічник",c1d:"Відповіді на питання з навчання",c2:"Тести",c2d:"Перевірка знань за модулями",c3:"Тренування на графіку",c3d:"Практика без реальних угод",
 soonToast:"Розділ у розробці",profile:"Профіль",acctKind:"Акаунт академії",signedAs:"Ви увійшли як",signOut:"Вийти з акаунта",
 }};

/* Обучение и афиши (CMS) */
Object.assign(T.ru,{learnH:"Обучение",learnOpen:"Открыть курс",learnCont:"Продолжить",learnLessons:"уроков",learnDone:"пройдено",annH:"Афиши и объявления",annGo:"Подробнее",progLessonsT:"Пройдено уроков",progCourse:"Курс"});
Object.assign(T.en,{learnH:"Learning",learnOpen:"Open course",learnCont:"Continue",learnLessons:"lessons",learnDone:"done",annH:"Events & announcements",annGo:"Learn more",progLessonsT:"Lessons completed",progCourse:"Course"});
Object.assign(T.ua,{learnH:"Навчання",learnOpen:"Відкрити курс",learnCont:"Продовжити",learnLessons:"уроків",learnDone:"пройдено",annH:"Афіші та оголошення",annGo:"Детальніше",progLessonsT:"Пройдено уроків",progCourse:"Курс"});

Object.assign(T.ru,{learnEmpty:"Курсы появятся здесь после публикации.",learnErr:"Не удалось загрузить курсы. Проверьте соединение.",retry:"Повторить"});
Object.assign(T.en,{learnEmpty:"Courses will appear here once published.",learnErr:"Couldn’t load courses. Check your connection.",retry:"Try again"});
Object.assign(T.ua,{learnEmpty:"Курси з’являться тут після публікації.",learnErr:"Не вдалося завантажити курси. Перевірте з’єднання.",retry:"Повторити"});

/* Читалка книги */
Object.assign(T.ru,{readerBack:"Академия",readerLoading:"Открываем книгу…",readerError:"Не удалось открыть книгу. Проверьте соединение.",readerNoAccess:"Книга доступна после активации академии.",readerPrev:"Предыдущая страница",readerNext:"Следующая страница",readerPage:"Номер страницы",readerZoomIn:"Увеличить",readerZoomOut:"Уменьшить",readerFit:"По ширине",readerFull:"Полный экран"});
Object.assign(T.en,{readerBack:"Academy",readerLoading:"Opening the book…",readerError:"Couldn’t open the book. Check your connection.",readerNoAccess:"The book becomes available once your academy access is active.",readerPrev:"Previous page",readerNext:"Next page",readerPage:"Page number",readerZoomIn:"Zoom in",readerZoomOut:"Zoom out",readerFit:"Fit width",readerFull:"Full screen"});
Object.assign(T.ua,{readerBack:"Академія",readerLoading:"Відкриваємо книгу…",readerError:"Не вдалося відкрити книгу. Перевірте з’єднання.",readerNoAccess:"Книга доступна після активації академії.",readerPrev:"Попередня сторінка",readerNext:"Наступна сторінка",readerPage:"Номер сторінки",readerZoomIn:"Збільшити",readerZoomOut:"Зменшити",readerFit:"По ширині",readerFull:"Повний екран"});

/* Баннеры главной */
Object.assign(T.ru,{bannerOpen:"Открыть",bannerSoon:"Скоро",bannerSoonDate:"Скоро · {date}"});
Object.assign(T.en,{bannerOpen:"Open",bannerSoon:"Soon",bannerSoonDate:"Soon · {date}"});
Object.assign(T.ua,{bannerOpen:"Відкрити",bannerSoon:"Скоро",bannerSoonDate:"Скоро · {date}"});

/* Кабинет партнёра */
Object.assign(T.ru,{ptLoading:"Загружаем кабинет…",ptModeOff:"Денежная часть программы пока не активна: приглашения и их статусы учитываются, но вознаграждения не начисляются и вывод недоступен.",ptModeTest:"Тестовый режим: суммы не являются реальными начислениями и не выплачиваются.",ptLinkH:"Ваша реферальная ссылка",ptCopy:"Копировать",ptCopied:"Ссылка скопирована",ptStatsH:"Статистика",ptInvited:"Приглашено",ptTrader:"Trader ID подтверждён",ptFtd:"Подтверждённый депозит",ptAccess:"Доступ к академии",ptRewarded:"Вознаграждено",ptRulesH:"Условия",ptRules:"{reward} за каждого приглашённого, который зарегистрировался по вашей ссылке, подтвердил Trader ID, внёс подтверждённый первый депозит и получил доступ к академии|Одно вознаграждение за одного участника|Регистрация без подтверждённого депозита вознаграждения не даёт|Минимальная сумма вывода — {min}|Подозрительные приглашения проверяются вручную",ptInvitesH:"Приглашённые",ptJoined:"Дата",ptStatus:"Статус",ptNoInvites:"Пока никого. Поделитесь ссылкой.",ptBalanceH:"Баланс",ptAvailable:"Доступно",ptReserved:"В резерве",ptPaid:"Выплачено",ptAmount:"Сумма",ptWithdraw:"Заявка на вывод",ptWithdrawNote:"Минимум {min}. Сумма резервируется до решения по заявке.",ptWithdrawalsH:"Заявки на вывод",ptDate:"Дата",ptCancel:"Отменить",ptHistoryH:"История операций",ptOperation:"Операция",
ptS_registered:"Зарегистрирован",ptS_trader_confirmed:"Trader ID подтверждён",ptS_ftd_confirmed:"Депозит подтверждён",ptS_access_granted:"Доступ выдан",ptS_qualified:"Подходит",ptS_rewarded:"Вознаграждён",ptS_flagged:"На проверке",
ptW_pending:"Ожидает",ptW_processing:"В обработке",ptW_paid:"Выплачено",ptW_rejected:"Отклонено",ptW_cancelled:"Отменено",ptL_reward:"Вознаграждение",ptL_reserve:"Резерв под заявку",ptL_release:"Возврат резерва",ptL_payout:"Выплата",ptL_adjustment:"Корректировка",
ptE_INSUFFICIENT_BALANCE:"Недостаточно доступных средств.",ptE_INVALID_AMOUNT:"Сумма меньше минимальной или некорректна.",ptE_TRADER_REQUIRED:"Для вывода нужен подтверждённый Trader ID.",ptE_REWARDS_DISABLED:"Вывод сейчас недоступен.",ptE_TOO_MANY:"Слишком много попыток, подождите минуту.",ptE_generic:"Не удалось выполнить действие. Попробуйте позже."});
Object.assign(T.en,{ptLoading:"Loading your dashboard…",ptModeOff:"The cash part of the program is not active yet: invites and their statuses are tracked, but no rewards are credited and withdrawals are unavailable.",ptModeTest:"Test mode: amounts are not real credits and are not paid out.",ptLinkH:"Your referral link",ptCopy:"Copy",ptCopied:"Link copied",ptStatsH:"Statistics",ptInvited:"Invited",ptTrader:"Trader ID confirmed",ptFtd:"Confirmed deposit",ptAccess:"Academy access",ptRewarded:"Rewarded",ptRulesH:"Terms",ptRules:"{reward} for each invitee who signed up via your link, confirmed a Trader ID, made a confirmed first deposit and got academy access|One reward per invitee|Sign-up without a confirmed deposit earns nothing|Minimum withdrawal — {min}|Suspicious invites are reviewed manually",ptInvitesH:"Invitees",ptJoined:"Date",ptStatus:"Status",ptNoInvites:"No one yet. Share your link.",ptBalanceH:"Balance",ptAvailable:"Available",ptReserved:"Reserved",ptPaid:"Paid out",ptAmount:"Amount",ptWithdraw:"Request withdrawal",ptWithdrawNote:"Minimum {min}. The amount is reserved until the request is decided.",ptWithdrawalsH:"Withdrawal requests",ptDate:"Date",ptCancel:"Cancel",ptHistoryH:"Transaction history",ptOperation:"Operation",
ptS_registered:"Signed up",ptS_trader_confirmed:"Trader ID confirmed",ptS_ftd_confirmed:"Deposit confirmed",ptS_access_granted:"Access granted",ptS_qualified:"Qualified",ptS_rewarded:"Rewarded",ptS_flagged:"Under review",
ptW_pending:"Pending",ptW_processing:"Processing",ptW_paid:"Paid",ptW_rejected:"Rejected",ptW_cancelled:"Cancelled",ptL_reward:"Reward",ptL_reserve:"Reserved for request",ptL_release:"Reserve returned",ptL_payout:"Payout",ptL_adjustment:"Adjustment",
ptE_INSUFFICIENT_BALANCE:"Not enough available funds.",ptE_INVALID_AMOUNT:"The amount is below the minimum or invalid.",ptE_TRADER_REQUIRED:"A confirmed Trader ID is required to withdraw.",ptE_REWARDS_DISABLED:"Withdrawals are currently unavailable.",ptE_TOO_MANY:"Too many attempts, wait a minute.",ptE_generic:"Couldn’t complete the action. Please try later."});
Object.assign(T.ua,{ptLoading:"Завантажуємо кабінет…",ptModeOff:"Грошова частина програми поки не активна: запрошення та їхні статуси враховуються, але винагороди не нараховуються, а виведення недоступне.",ptModeTest:"Тестовий режим: суми не є реальними нарахуваннями і не виплачуються.",ptLinkH:"Ваше реферальне посилання",ptCopy:"Копіювати",ptCopied:"Посилання скопійовано",ptStatsH:"Статистика",ptInvited:"Запрошено",ptTrader:"Trader ID підтверджено",ptFtd:"Підтверджений депозит",ptAccess:"Доступ до академії",ptRewarded:"Винагороджено",ptRulesH:"Умови",ptRules:"{reward} за кожного запрошеного, який зареєструвався за вашим посиланням, підтвердив Trader ID, зробив підтверджений перший депозит і отримав доступ до академії|Одна винагорода за одного учасника|Реєстрація без підтвердженого депозиту винагороди не дає|Мінімальна сума виведення — {min}|Підозрілі запрошення перевіряються вручну",ptInvitesH:"Запрошені",ptJoined:"Дата",ptStatus:"Статус",ptNoInvites:"Поки нікого. Поділіться посиланням.",ptBalanceH:"Баланс",ptAvailable:"Доступно",ptReserved:"У резерві",ptPaid:"Виплачено",ptAmount:"Сума",ptWithdraw:"Заявка на виведення",ptWithdrawNote:"Мінімум {min}. Сума резервується до рішення за заявкою.",ptWithdrawalsH:"Заявки на виведення",ptDate:"Дата",ptCancel:"Скасувати",ptHistoryH:"Історія операцій",ptOperation:"Операція",
ptS_registered:"Зареєстрований",ptS_trader_confirmed:"Trader ID підтверджено",ptS_ftd_confirmed:"Депозит підтверджено",ptS_access_granted:"Доступ надано",ptS_qualified:"Підходить",ptS_rewarded:"Винагороджений",ptS_flagged:"На перевірці",
ptW_pending:"Очікує",ptW_processing:"В обробці",ptW_paid:"Виплачено",ptW_rejected:"Відхилено",ptW_cancelled:"Скасовано",ptL_reward:"Винагорода",ptL_reserve:"Резерв під заявку",ptL_release:"Повернення резерву",ptL_payout:"Виплата",ptL_adjustment:"Коригування",
ptE_INSUFFICIENT_BALANCE:"Недостатньо доступних коштів.",ptE_INVALID_AMOUNT:"Сума менша за мінімальну або некоректна.",ptE_TRADER_REQUIRED:"Для виведення потрібен підтверджений Trader ID.",ptE_REWARDS_DISABLED:"Виведення зараз недоступне.",ptE_TOO_MANY:"Забагато спроб, зачекайте хвилину.",ptE_generic:"Не вдалося виконати дію. Спробуйте пізніше."});
