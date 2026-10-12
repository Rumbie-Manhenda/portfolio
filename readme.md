# My Portfolio Website

This is my personal portfolio website — a showcase of who I am, my projects and my
skills. The pages are built with vanilla HTML, CSS and JavaScript.

The site is served by a small **Node.js + Express** backend that also powers the two
forms on the site, so visitors can actually get in touch:

- the **contact form** (About page) — sends me an email,
- the **recommendation form** (Projects page) — sends me an email.

Email is delivered with [nodemailer](https://nodemailer.com/) over SMTP.

## How the email works

```
Browser (contact / recommendation form)
        │  POST /submit  or  POST /submit_rec
        ▼
Express server  ──►  validate input  ──►  nodemailer  ──►  SMTP  ──►  your inbox
```

- `main.js` submits the forms with `fetch()` to the **same origin** the page was
  loaded from (the Express server serves both the site and the API).
- The server checks the input, then emails you the message with the visitor set as
  the **Reply-To** address — so you can just hit "Reply" in your mail client.

## Endpoints

| Method | Path          | Fields                                | Purpose                        |
| ------ | ------------- | ------------------------------------- | ------------------------------ |
| POST   | `/submit`     | `email`, `message`                    | Contact form                   |
| POST   | `/submit_rec` | `name_rec`, `email_rec`, `message_rec`| Recommendation form            |
| GET    | `/health`     | –                                     | Reports `emailConfigured`      |

## Setup

Requirements: **Node.js 18 or newer**.

```bash
cd portfolio
npm install
```

### 1. Configure your email (this is the important part)

The server reads its settings from a local `.env` file. Copy the template and fill
it in:

```bash
copy .env.example .env      # Windows
cp   .env.example .env      # macOS / Linux
```

**Using Gmail (recommended):**

1. Turn on **2-Step Verification** for your Google account.
2. Go to <https://myaccount.google.com/apppasswords> and create an app password
   (name it "Portfolio").
3. Put your address in `SMTP_USER` and the **16-character app password** in
   `SMTP_PASS`. Do **not** use your normal Google password — Gmail rejects it.

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@gmail.com
SMTP_PASS=your-16-character-app-password
MAIL_TO=pattymcharis15@gmail.com
MAIL_FROM=you@gmail.com
```

`.env` is git-ignored, so your password is never committed.

Any SMTP provider works — just change `SMTP_HOST`, `SMTP_PORT` and `SMTP_SECURE`
(use `SMTP_PORT=465` with `SMTP_SECURE=true` for implicit TLS).

### 2. Run it

```bash
npm start
```

Then open <http://localhost:3000>. The console tells you straight away whether
email is configured:

```
Portfolio server running at http://localhost:3000
Email ready — contact messages will be delivered to pattymcharis15@gmail.com.
```

If it instead warns that email is **NOT** configured, the forms will return a clear
error until you finish step 1.

## Tests

```bash
npm test
```

Covers input validation, the email composition, and the HTTP endpoints end to end
(multipart and plain form posts, validation errors, the "not configured" path, and
the guarantee that secret files such as `gitkey` and `.env` are never served).

## Project layout

```
portfolio/
├─ index.html, aboutme.html, projects.html, coverletter.html   # pages
├─ main.js, reveal.js, sketch.js, style.css, theme.css          # front-end
├─ assets/                                                      # images, docs, video
├─ server/
│  ├─ index.js         # entry point (npm start)
│  ├─ app.js           # Express app: CORS, static site, routes
│  ├─ config.js        # reads .env / environment
│  ├─ loadEnv.js       # tiny dependency-free .env reader
│  ├─ validate.js      # form input validation
│  ├─ mailer.js        # nodemailer transport + message templates
│  ├─ rateLimit.js     # simple anti-spam limiter
│  ├─ staticGuard.js   # blocks secret/source files from being served
│  └─ routes/contact.js
├─ test/               # npm test
└─ .env.example        # copy to .env and fill in
```

## Deploying

The server serves the static site **and** the API, so deploy the whole `portfolio`
folder to any Node host (Render, Railway, Fly.io, a VPS, …) and set the same
environment variables there — do not commit `.env`.

If you ever host the pages separately from the API (for example on GitHub Pages),
set `window.PORTFOLIO_API` to the API's full URL at the top of `main.js`, and add
that site's origin to `ALLOWED_ORIGINS` in `.env`.

## Dependencies

- Node.js & Express.js
- Nodemailer (email delivery)
- Multer (parses the forms)
- MySQL (kept for future data features)
