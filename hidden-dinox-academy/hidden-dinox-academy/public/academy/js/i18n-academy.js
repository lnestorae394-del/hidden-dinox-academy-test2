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
