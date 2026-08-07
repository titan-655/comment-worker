# 💬 Comment Worker

جایگزین رایگان و خودمیزبان برای Disqus؛ یک سیستم دیدگاه سبک برای سایتهای استاتیک (GitHub Pages، Hugo، Astro، Jekyll و هر چیزی که HTML خروجی میدهد). کل سرویس یک Worker روی Cloudflare Workers است و دادهها در D1 (پایگاه داده SQLite ابری کلادفلر) ذخیره میشود؛ یعنی بدون سرور، بدون هزینه اشتراک، و بدون اینکه ردپایی از کاربرانت به دست شرکت ثالث برسد. نصبش روی سایت فقط یک خط اسکریپت است.

## مقایسه با Disqus

| | Comment Worker | Disqus |
|---|---|---|
| هزینه | صفر (پلن رایگان Cloudflare Workers + D1) | رایگان با تبلیغ، یا اشتراک پولی |
| ردگیری کاربر | هیچ — فقط IP و User-Agent برای ضد اسپم ذخیره میشود | تبلیغات و پروفایل و ردگیری گسترده |
| مالکیت داده | دیتا در D1 خودت، خروجی CSV داری | دیتا روی سرورهای Disqus |
| زبان رابط | فارسی (داشبورد و پیامها) | انگلیسی |
| محدودیت سایت | چند سایت با یک Worker | سقف تعداد سایت در پلن رایگان |
| سرعت | یک Worker در لبه کلادفلر | اسکریپت سنگین شخص ثالث |

## امکانات

- **نصب با یک خط اسکریپت** — کافیست `<script src=".../embed.js" data-site="..." data-page="...">` را به صفحه اضافه کنی؛ خودش فرم و لیست دیدگاهها را میسازد.
- **سه حالت مدیریت** — `open` (هر دیدگاهی مستقیم نمایش داده میشود)، `moderated` (اول تأیید تو)، `closed` (دیدگاهها بسته است).
- **ضد اسپم سهلایه** — فیلد Honeypot مخفی (`_hp`) که رباتها پر میکنند، محدودیت تعداد دیدگاه هر IP در هر ساعت، و تشخیص خودکار لینک و کلمات اسپم (دیدگاه مشکوک مستقیم با وضعیت `spam` ذخیره میشود و نمایش داده نمیشود).
- **داشبورد مدیریت فارسی** — فیلتر بر اساس وضعیت (تأییدشده / در انتظار / اسپم)، تأیید، حذف، و خروجی CSV با یک کلیک.
- **چند سایت در یک Worker** — هر سایت یک `id` و یک `secret` جدا دارد.
- **جواب به دیدگاهها** — با `parent_id` میتوانی دیدگاههای والد/فرزند ذخیره کنی.

## هر فایل چیست و باید چه کنی

| فایل | چیست | باید چه کنی |
|---|---|---|
| `src/index.js` | کل Worker: مسیریاب، API، embed.js و داشبورد HTML | فایل اصلی؛ دست نزن مگر با دلیل |
| `dashboard.html` | کد منبع داشبورد مدیریت | برای ویرایش داشبورد؛ بعد از تغییر، محتوایش را باید داخل `DASHBOARD_HTML` در `src/index.js` بگذاری |
| `schema.sql` | ساختار جداول `sites` و `comments` | یک بار با `wrangler d1 execute` روی D1 اجرا کن |
| `wrangler.toml` | تنظیمات Worker و اتصال D1 | `database_id` را بعد از ساخت D1 اینجا بگذار |
| `test/sim.js` | ۲۳ تست خودکار روی SQLite محلی | با node اجرا کن (دستورش پایین است) |
| `LICENSE` | مجوز MIT | — |

## راهاندازی ۵ دقیقهای

پیشنیاز: حساب Cloudflare و نصب [Wrangler](https://developers.cloudflare.com/workers/wrangler/).

```bash
# ۱) یک D1 بساز
wrangler d1 create comment-worker-db
# خروجی شامل database_id است — آن را در wrangler.toml بگذار

# ۲) ساختار جداول را اجرا کن
wrangler d1 execute comment-worker-db --remote --file=schema.sql

# ۳) سایتت را بساز (id، نام، secret، حالت، سقف دیدگاه هر IP در ساعت)
wrangler d1 execute comment-worker-db --remote --command \
  "INSERT INTO sites (id, name, secret, moderation, rate_limit) VALUES ('blog', 'وبلاگ من', 'SECRET', 'open', 5);"

# ۴) دیپلوی کن
wrangler deploy
```

`SECRET` را یک رشته تصادفی بلند بگذار — همان کلید مدیریت سایت است. برای هر سایت جدید فقط یک `INSERT` دیگر در جدول `sites` بزن.

## نصب روی سایت

یک خط اسکریپت قبل از بسته شدن `</body>` (یا هر جای صفحه):

```html
<script src="https://comment-worker.<subdomain>.workers.dev/embed.js" data-site="blog" data-page="/blog/post-1" defer></script>
```

| ویژگی | کار |
|---|---|
| `data-site` | شناسه سایتی که در D1 ساختی (مثل `blog`) |
| `data-page` | آدرس صفحه — دیدگاهها بر اساس این مقدار جدا میشوند |
| `data-api` | اختیاری؛ اگر embed.js را جای دیگری میزبانی میکنی، آدرس Worker را اینجا بده. پیشفرض: آدرس خود صفحه |
| `defer` | اجرای اسکریپت بعد از بارگذاری HTML — توصیه میشود |

اسکریپت یک بلوک `#cw-comments` بعد از خودش میسازد: فرم (نام، ایمیل اختیاری، متن) و لیست دیدگاههای تأییدشده همان صفحه.

## مرجع API

همه مسیرهای `admin/*` با هدر `Authorization: Bearer <secret>` احراز هویت میشوند (secret همان ستون `secret` جدول `sites` است). مسیرهای عمومی بدون هدر کار میکنند.

| متد و مسیر | توضیح | پاسخ |
|---|---|---|
| `GET /embed.js` | اسکریپت سمت کلاینت | JS |
| `GET /api/:siteId/comments?page=/path` | لیست دیدگاههای تأییدشده یک صفحه (عمومی) | `{comments: [...]}` — ایمیل نمایش داده نمیشود |
| `POST /api/:siteId/comments?page=/path` | ثبت دیدگاه. بدنه JSON: `author`, `email` (اختیاری), `body`, `parent_id` (اختیاری), `_hp` (هانیپات) | `{ok, id, status, message}` — خطاها: 400 (ناقص)، 429 (محدودیت)، 403 (بسته)، 404 (سایت ناشناخته) |
| `GET /admin?site=:siteId&key=:secret` | داشبورد مدیریت (HTML) | HTML |
| `GET /api/:siteId/admin/comments?status=` | همه دیدگاهها؛ با `status=pending\|approved\|spam` فیلتر کن | `{comments: [...]}` |
| `POST /api/:siteId/admin/comments/:id?status=` | تغییر وضعیت دیدگاه (`approved` / `pending` / `spam`) | `{ok: true}` |
| `GET /api/:siteId/admin/delete/:id` | حذف دیدگاه | `{ok: true}` |
| `GET /api/:siteId/admin/export.csv` | خروجی CSV همه دیدگاهها (ستونها: id, page, parent, author, body, status, created_at) | فایل CSV |
| `GET /api/:siteId/admin/stats` | شمارش وضعیتها | `{approved, pending, spam}` |

مثال ثبت دیدگاه:

```bash
curl -X POST 'https://comment-worker.<subdomain>.workers.dev/api/blog/comments?page=/blog/post-1' \
  -H 'Content-Type: application/json' \
  -H 'CF-Connecting-IP: 1.2.3.4' \
  -d '{"author": "علی", "email": "ali@example.com", "body": "سلام، مطلب خوبی بود"}'
```

## امنیت

- **کلید secret** — بدون آن هیچ مسیر مدیریتی کار نمیکند (`401`). کلید در URL داشبورد (`/admin?key=...`) دیده میشود؛ یا با آن وارد شو و بعد کلید را از URL پاک کن، یا مستقیم در داشبورد تایپش کن.
- **هانیپات** — فیلد مخفی `_hp` در فرم. رباتها پرش میکنند؛ اگر پر شده بود، سیستم جواب «موفقیت» میدهد ولی چیزی ذخیره نمیکند.
- **Rate limit** — هر IP (هدر `CF-Connecting-IP`) برای هر سایت حداکثر `rate_limit` دیدگاه در هر ساعت (پیشفرض 5).
- **اسپمگیر** — وجود لینک (`http://` / `https://`) یا کلمات اسپم رایج، دیدگاه را با وضعیت `spam` ذخیره میکند؛ در لیست عمومی نمایش داده نمیشود ولی در داشبورد قابل بررسی است.
- متن دیدگاهها و نام نویسنده هنگام رندر HTML Escape میشوند (ایمن در برابر XSS).

## حالتهای مدیریت

| حالت | رفتار |
|---|---|
| `open` | هر دیدگاه بلافاصله با وضعیت `approved` نمایش داده میشود |
| `moderated` | دیدگاهها با وضعیت `pending` ذخیره میشوند؛ فقط بعد از تأیید در داشبورد نمایش داده میشوند |
| `closed` | ثبت دیدگاه جدید رد میشود (`403`) — خواندن دیدگاههای قبلی همچنان ممکن است |

## تست

بدون نیاز به npm و حساب کلادفلر؛ تستها Worker را با یک پایگاه SQLite واقعی در حافظه (`node:sqlite`) اجرا میکنند:

```bash
node --experimental-sqlite test/sim.js
```

خروجی مطلوب: `23 ✅ | 0 ❌`. (به Node نسخه ۲۲.۵ یا بالاتر نیاز دارد.)

## نکات

- **چند سایت در یک Worker** — فقط چند `INSERT` در جدول `sites` بزن؛ هر سایت id و secret خودش را دارد و داشبورد هر سایت با `?site=<id>` باز میشود.
- **پاکسازی دستی** — برای حذف همه دیدگاههای یک سایت:
  ```bash
  wrangler d1 execute comment-worker-db --remote --command "DELETE FROM comments WHERE site_id = 'blog';"
  ```
- **خروجی CSV** — سادهترین راه پشتیبانگیری؛ کافیست هر چند وقت یک بار خروجی بگیری.
- **مجوز** — MIT؛ آزادانه استفاده و تغییرش بده.
