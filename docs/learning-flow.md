# O'qish jarayoni: kurs → modul → dars → test

Talablar manbasi: [requirements/polaris-frontend-backend-ishlar.pdf](requirements/polaris-frontend-backend-ishlar.pdf) (03 O'qish, 04 Test bloklari), mijoz bilan kelishilgan qo'shimchalar:
testlar har **dars** uchun (modul uchun emas), darslar qat'iy ketma-ket ochiladi.

## Tuzilma

```
Course (kurs)
└── CourseModule (modul, position bo'yicha)
    └── Lesson (mavzu/dars, position bo'yicha)
        ├── video_url + video_duration (soniya)
        ├── content (yozma qo'llanma, markdown)
        ├── LessonMaterial[] (PDF va boshqa fayllar, URL)
        └── LessonTest (0 yoki 1)
            └── TestQuestion[] → TestOption[] (bir yoki bir nechta to'g'ri javob)
```

Kursdagi darslar tartibi: modul `position` → dars `position` (teng bo'lsa `created_at`).

## Dars qachon ochiladi va yakunlanadi

- Dars **yakunlangan**: video ko'rilgan (agar video bo'lsa) **va** test topshirilgan (agar test bo'lsa).
- Dars **ochiq**: oldingi barcha darslar yakunlangan bo'lsa (birinchi dars doim ochiq). Yakunlangan dars doim ochiq qoladi.
- Holatlar: `locked` → `available` → `in_progress` → `completed`.
- Qulflangan darsni (`GET /lessons/:id`, test, watch) talaba ochsa — `403`. Admin istalgan darsni ko'ra oladi.
- Test faqat video ko'rilgandan keyin topshiriladi (`400 Watch the lesson video before taking the test`).
- Talablar bajarilishi bilan dars avtomatik yakunlanadi. Video ham, test ham bo'lmagan dars `POST /progress/lessons/:id/complete` bilan yakunlanadi.

## Video progress: "aniq qancha ko'rdi"

Player ijro paytida har ~10-15 soniyada (va pauza/seek/yopishda) heartbeat yuboradi:

```
POST /api/v1/progress/lessons/:lessonId/watch
{ "from": 120, "to": 135, "position": 135 }
```

Server:
1. Segmentni `[0, video_duration]` oralig'iga qisadi; bitta segment ≤ 60 soniya.
2. Oldingi heartbeat'dan beri o'tgan real vaqtdan uzun segmentni kesadi (`elapsed × 2 + 5s`, ya'ni maksimal 2x tezlik). Oldinga o'tkazib yuborish ko'rish deb hisoblanmaydi.
3. Segmentni `watched_segments` ga qo'shib, ustma-ust tushganlarini birlashtiradi.

Natijada saqlanadi:

| Maydon | Ma'nosi |
| ------ | ------- |
| `watched_seconds` | videoning **takrorlanmas** ko'rilgan soniyalari (qayta ko'rish ikki marta sanalmaydi) |
| `watched_percent` | `watched_seconds / video_duration` |
| `total_watch_seconds` | qayta ko'rishlar bilan birga umumiy ko'rish vaqti |
| `last_position` | oxirgi to'xtagan joy (davom ettirish uchun) |
| `video_completed` | `watched_seconds ≥ 95%` bo'lganda `true` |

`video_duration` berilmagan dars video talabisiz hisoblanadi.

## Testlar

- Talabaga savollar `is_correct` siz yuboriladi (`GET /tests/:id`), baholash faqat serverda.
- Savol to'g'ri, faqat tanlangan variantlar to'plami to'g'ri variantlar to'plamiga aynan teng bo'lsa. Javob berilmagan savol — noto'g'ri.
- `percent = ball / maksimal ball`, `passed = percent ≥ pass_score` (default 70). `max_attempts` = null bo'lsa cheksiz.
- Har urinish va har javob saqlanadi; progress'da eng yaxshi natija (`best_test_percent`) turadi.

## Kim nimani ko'radi

| Kim | Endpoint |
| --- | -------- |
| Talaba | `GET /progress/courses/:courseId` — o'z ko'rsatkichlari: modul va kurs foizlari, har dars bo'yicha soniyalar, test natijasi, `current_lesson_id` |
| Talaba | `GET /progress/lessons/:lessonId`, `GET /tests/:id/attempts/me` |
| Admin | `GET /progress/courses/:courseId/students` — kursni boshlagan barcha talabalar (qidiruv, sahifalash) |
| Admin | `GET /progress/courses/:courseId/students/:userId` — talabaning to'liq ko'rinishi (talaba ko'radigan bilan bir xil) |
| Admin | `GET /tests/:id/attempts/users/:userId` — talabaning test urinishlari |

## Hali qilinmagan (PDF'dagi boshqa bloklar)

- To'lov va kursga kirish huquqi (BE-15): hozir tizimga kirgan har bir foydalanuvchi nashr qilingan kursni o'qiy oladi.
- Video saqlash/HLS/signed URL (BE-17, BE-18): `video_url` va material `url` oddiy havola sifatida saqlanadi.
