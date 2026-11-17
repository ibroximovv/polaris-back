# O'qish jarayoni: kurs → modul → dars → test

Talablar manbasi: [requirements/polaris-frontend-backend-ishlar.pdf](requirements/polaris-frontend-backend-ishlar.pdf) (03 O'qish, 04 Test bloklari), mijoz bilan kelishilgan qo'shimchalar:
har modul oxirida yakuniy test bo'ladi, dars (mavzu) uchun ham test qo'shish mumkin; darslar va modullar qat'iy ketma-ket ochiladi;
test natijalari bo'yicha foydalanuvchi statistikasi chiqariladi.

## Tuzilma

```
Course (kurs)
└── CourseModule (modul, position bo'yicha)
    ├── Lesson (mavzu/dars, position bo'yicha)
    │   ├── LessonVideo (0 yoki 1: MinIO'da yoki tashqi link, duration soniyada)
    │   ├── content (yozma qo'llanma, markdown)
    │   ├── LessonMaterial[] (qo'llanma fayllar va rasmlar, position bo'yicha)
    │   └── LessonTest (ixtiyoriy dars testi, 0 yoki 1)
    └── LessonTest (modulning yakuniy testi, 0 yoki 1; darslardan keyin ochiladi)
        └── TestQuestion[] (points yoki avtomatik ulush) → TestOption[] (bir yoki bir nechta to'g'ri javob)
```

Test jadvali bitta (`lesson_tests`): `lesson_id` (dars testi) yoki `module_id` (modul testi) dan **aniq bittasi** to'ldiriladi
(bazada CHECK cheklovi bor). API'da `kind`: `LESSON` | `MODULE`.

Kursdagi qadamlar tartibi: modul `position` → uning darslari `position` bo'yicha (teng bo'lsa `created_at`) → modul testi → keyingi modul.

## Fayllar: `/uploads`, keyin bog'lash

Har qanday fayl (video, rasm, hujjat) **bitta joydan** — `/api/v1/uploads` orqali yuklanadi va `upload_id` oladi
(hozircha faqat admin). Keyin dars endpoint'lari faylni shu id bilan bog'laydi. Fayllar MinIO'da yopiq bucket'da
(`uploads/<yyyy>/<mm>/<tasodifiy nom>`) saqlanadi, javobda muddatli imzolangan `url` (`STORAGE_URL_EXPIRES_IN`) beriladi.
Video va rasm brauzerda ochiladi (video seek qilinadi), hujjatlar asl nomi bilan yuklab olinadi.

| Amal | Endpoint |
| ---- | -------- |
| Bir yoki bir nechta faylni API orqali yuklash | `POST /uploads` (multipart, `files[]`) → `Upload[]` |
| Katta fayl, 1-qadam: brauzer to'g'ridan-to'g'ri MinIO'ga | `POST /uploads/presigned { file_name, mime_type, size }` → `{ upload, form }`; `form.url` ga `form.fields` + `file` bilan multipart POST |
| Katta fayl, 2-qadam | `POST /uploads/:id/complete` (fayl MinIO'da borligini tekshiradi, `PENDING` → `READY`) |
| Ko'rish / bog'lanmagan faylni o'chirish | `GET /uploads/:id`, `DELETE /uploads/:id` (bog'langan bo'lsa `409`) |

- Ruxsat etilgan turlar va hajm: `MEDIA_ALLOWED_MIME_TYPES`, `MEDIA_MAX_FILE_SIZE_MB`.
- Bitta upload faqat bitta joyga bog'lanadi (`409`). Video yoki qo'llanma (yoki dars) o'chirilsa, uning upload'i va MinIO'dagi fayli ham o'chadi.
- Hech qayerga bog'lanmagan va `PENDING` qolgan upload'lar hozircha avtomatik tozalanmaydi.

## Dars videosi va qo'llanmalari

**Video (darsga bitta):** `PUT /lessons/:id/video { upload_id | url, title?, duration? }`. `upload_id` va `url` dan aniq bittasi
(bazada CHECK). Upload video bo'lishi shart (aks holda `415`). Yangi video eskisini almashtiradi va eskisining upload'ini o'chiradi.
Tahrirlash: `PATCH /lessons/:id/video { title?, duration? }`, o'chirish: `DELETE /lessons/:id/video`.

**Qo'llanmalar (fayllar, rasmlar; istalgancha):** `POST /lessons/:id/materials { items: [{ upload_id | url, title?, type? }] }`.
Ular berilgan tartibda oxiriga qo'shiladi. Tur berilmasa rasm upload'i `IMAGE`, qolgani `FILE` bo'ladi. Video upload qo'llanma bo'la olmaydi (`415`).
Tartib: `PUT /lessons/:id/materials/order { material_ids }`, tahrirlash/o'chirish: `PATCH` / `DELETE /lessons/materials/:materialId`.

- Server video davomiyligini o'zi aniqlamaydi: `duration` frontend'dan keladi (`<video>` metadata'si). **`duration` siz video kuzatilmaydi va talab qilinmaydi.**
- Talaba hammasini `GET /lessons/:id` dan oladi (`video`, `materials`, `test`); qo'llanmalar alohida: `GET /lessons/:id/materials`. Qulflangan darsda 403.

## Qachon ochiladi va yakunlanadi

- **Dars yakunlangan**: video ko'rilgan (agar kuzatiladigan video bo'lsa) **va** dars testi topshirilgan (agar bo'lsa).
- **Modul testi ochiq**: modulning barcha darslari yakunlangan bo'lsa (va undan oldingi hamma qadamlar). Aks holda 403.
- **Modul yakunlangan**: barcha darslari yakunlangan **va** yakuniy testi (agar bo'lsa) topshirilgan.
- **Keyingi modulning birinchi darsi** oldingi modul yakunlangandagina ochiladi (ya'ni modul testidan o'tmaguncha yopiq).
- Yakunlangan dars va topshirilgan test doim shunday qoladi. Holatlar: `locked` → `available` → `in_progress` → `completed` (darslar ham, modul testi ham).
- Admin istalgan dars va testni ochishi mumkin.
- Dars testi faqat video ko'rilgandan keyin topshiriladi (`400 Watch the lesson video before taking the test`).
- Talablar bajarilishi bilan dars avtomatik yakunlanadi. Video ham, test ham bo'lmagan dars `POST /progress/lessons/:id/complete` bilan yakunlanadi.
- Kurs progress'ida keyingi qadam: `current_lesson_id` (dars) yoki `current_test_id` (modul testi); ikkalasi `null` = kurs tugagan.

## Video progress: "aniq qancha ko'rdi"

Player ijro paytida har ~10-15 soniyada (va pauza/seek/yopishda) heartbeat yuboradi. Asosiy kanal socket.io, HTTP zaxira:

```
socket.emit('progress:watch', { lesson_id, from: 120, to: 135, position: 135 }, (ack) => ...)
POST /api/v1/progress/lessons/:lessonId/watch   { "from": 120, "to": 135, "position": 135 }
```

Server:
1. Segmentni `[0, duration]` oralig'iga qisadi; bitta segment ≤ 60 soniya.
2. Oldingi heartbeat'dan beri o'tgan real vaqtdan uzun segmentni kesadi (`elapsed × 2 + 5s`, ya'ni maksimal 2x tezlik). Oldinga o'tkazib yuborish ko'rish deb hisoblanmaydi.
3. Segmentni `watched_segments` ga qo'shib, ustma-ust tushganlarini birlashtiradi.

| Maydon | Ma'nosi |
| ------ | ------- |
| `watched_seconds` | videoning **takrorlanmas** ko'rilgan soniyalari (qayta ko'rish ikki marta sanalmaydi) |
| `watched_percent` | `watched_seconds / video_duration` |
| `total_watch_seconds` | qayta ko'rishlar bilan birga umumiy ko'rish vaqti |
| `last_position` | oxirgi to'xtagan joy (davom ettirish uchun) |
| `video_completed` | `watched_seconds ≥ 95%` bo'lganda `true` |

## Testlar

- Yaratish: `POST /tests` da `lesson_id` (dars testi) **yoki** `module_id` (modul testi) yuboriladi; ikkalasi yoki hech biri — `400`. Darsda ham, modulda ham ko'pi bilan bitta test (`409`).
- Talabaga savollar `is_correct` siz yuboriladi (`GET /tests/:id`), baholash faqat serverda.
- Savol to'g'ri, faqat tanlangan variantlar to'plami to'g'ri variantlar to'plamiga aynan teng bo'lsa. Javob berilmagan savol — noto'g'ri.
- **Ball (dinamik, default qoida):** `total_points` testning bali (default 100). Savolda `points` berilsa shu ball,
  berilmasa (`null`) qolgan ball (`total_points − qo'lda berilganlar`) avtomatik savollarga teng bo'linadi; qoldiq
  birinchi savollarga 1 tadan qo'shiladi. Masalan 100 ball, bitta savol 40, uchta avtomatik → 20 + 20 + 20; 3 ta avtomatik → 34 + 33 + 33.
  Qo'lda berilganlar yig'indisi `total_points` dan oshsa yoki avtomatik savolga 0 ball qolsa `400`. Hamma savolga ball qo'lda berilsa, maksimal ball ularning yig'indisi (`max_score`).
  Ballar savol qo'shish/o'zgartirish/o'chirishda o'zi qayta hisoblanadi. Hammasini bir yo'la o'rnatish: `PUT /tests/:id/points { total_points?, questions?: [{ question_id, points | null }] }`.
- `percent = ball / maksimal ball`, `passed = percent ≥ pass_score` (default 70). `max_attempts` = null bo'lsa cheksiz.
- Olingan ball: `earned_points = best_test_percent × total_points / 100`. Dars testi natijasi `lesson_progress` da, modul testi natijasi `module_progress` da (eng yaxshi foiz, o'tgan vaqti).
- Har urinish va har javob saqlanadi.

## Test statistikasi

`GET /progress/courses/:courseId/stats` (talaba o'zi uchun), `GET /progress/courses/:courseId/students/:userId/stats` (admin).
Barcha urinishlardan hisoblanadi:

| Daraja | Ko'rsatkichlar |
| ------ | -------------- |
| Har test (`modules[].tests[]`, dars testlari tartibda, oxirida modul testi) | `kind`, `attempts`, `best_percent`, `last_percent`, `average_percent`, `first_attempt_passed`, `passed`, `passed_at`, `earned_points` / `total_points`, `accuracy_percent` (to'g'ri javoblar / javob berilgan savollar), `last_attempt_at` |
| Har modul | `earned_points` / `total_points`, `average_best_percent` |
| Kurs bo'yicha | `tests_total`, `tests_attempted`, `tests_passed`, `total_attempts`, `average_best_percent`, `first_try_pass_rate` (birinchi urinishda o'tilgan testlar ulushi), `earned_points` / `total_points`, `score_percent`, `correct_answers` / `answered_questions`, `accuracy_percent` |

## Real-time (socket.io)

Namespace `/learning`, ulanish: `io('<server>/learning', { auth: { token: '<access token>' } })`. Token yo'q yoki
yaroqsiz bo'lsa `connect_error` ("Unauthorized"). Access token muddati tugasa, yangilab qayta ulaning.
Event nomlari va payload type'lari `@nestjs-template/types` dagi `LEARNING_WS_EVENTS` da.

| Yo'nalish | Event | Payload / javob |
| --------- | ----- | --------------- |
| client → server | `progress:watch` | heartbeat → ack `{ ok, data: LessonProgress }` yoki `{ ok: false, error: { status_code, message } }` |
| client → server | `progress:get` | `{ lesson_id }` → ack `LessonProgress` (qayta ulanganda davom ettirish uchun) |
| client → server | `admin:watch-course` / `admin:unwatch-course` | `{ course_id }`, faqat admin |
| server → client | `progress:lesson` | `LessonProgress`: har o'zgarishda (heartbeat, dars testi, yakunlash; boshqa tab/qurilmalarga ham) |
| server → client | `progress:video-completed` | `{ course_id, lesson_id }`: video 95% ga yetdi |
| server → client | `progress:lesson-completed` | `{ course_id, lesson_id, next_lesson_id, next_test_id }`: keyingi qadam dars yoki modul testi |
| server → client | `progress:module-test` | `{ course_id, module_id, test }`: modul testi baholandi |
| server → client | `progress:module-completed` | `{ course_id, module_id, next_lesson_id, next_test_id }`: modul yakunlandi, keyingi modul ochildi |
| server → admin | `admin:student-progress` | `{ course_id, user_id, lesson_id, module_id, progress, module_test }` |

Test topshirish (`POST /tests/:id/attempts`) va `POST /progress/lessons/:id/complete` HTTP'da qoladi, natijasi esa socket orqali ham tarqatiladi.
Bir nechta API instance ishlatilsa socket.io uchun Redis adapter kerak bo'ladi (hozir yo'q).

## Kim nimani ko'radi

| Kim | Endpoint |
| --- | -------- |
| Talaba | `GET /progress/courses/:courseId` — modul va kurs foizlari, modul testlari holati, har dars bo'yicha soniyalar va natijalar, `current_lesson_id` / `current_test_id` |
| Talaba | `GET /progress/courses/:courseId/stats` — test statistikasi |
| Talaba | `GET /progress/lessons/:lessonId`, `GET /tests/:id/attempts/me` |
| Admin | `GET /progress/courses/:courseId/students` — kursni boshlagan barcha talabalar (qidiruv, sahifalash) |
| Admin | `GET /progress/courses/:courseId/students/:userId` va `.../stats` — talabaning to'liq ko'rinishi va statistikasi |
| Admin | `GET /tests/:id/attempts/users/:userId` — talabaning test urinishlari |

## Hali qilinmagan (PDF'dagi boshqa bloklar)

- To'lov va kursga kirish huquqi (BE-15): hozir tizimga kirgan har bir foydalanuvchi nashr qilingan kursni o'qiy oladi.
- HLS'ga transkod qilish (BE-17, BE-18): video MinIO'dan asl fayl sifatida (mp4) imzolangan link orqali beriladi.
- Kurs yoki modul o'chirilganda uning darslaridagi upload'lar va MinIO fayllari o'chirilmaydi (dars, video yoki qo'llanma alohida o'chirilganda o'chiriladi).
