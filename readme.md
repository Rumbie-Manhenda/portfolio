# Patricia Manhenda - My Portfolio

This is my personal site: four hand-written pages (home, projects, about, cover letter)
and a small Node/Express backend that serves them and emails the two contact forms
straight to my inbox.

I built it because a CV tells you which tools someone has touched. It does not tell you
how they think, how they work, or whether they finish things. So the site is the long
version: the story, the projects, and a way to actually reach me.

---

## The flow, in one pass

Someone lands on `index.html`. The pages are plain HTML styled by two stylesheets and
brought to life by two small scripts — no framework, no build step.

If they fill in a form, here is what happens:

1. `main.js` catches the submit, builds a `FormData` and `POST`s it to the path in the
   form's `data-endpoint` attribute — `/submit` (email + message) or `/submit_rec`
   (name + email + recommendation).
2. Express receives it. `multer` parses the multipart body, `rateLimit.js` checks the
   sender has not been spamming, and `validate.js` trims the input, strips control
   characters and checks the lengths.
3. `mailer.js` composes a plain-text email to me with `replyTo` set to whoever wrote in,
   and hands it to `nodemailer`.
4. The response comes back as a sentence, and `main.js` writes it into the form's status
   area - inline, no page reload, no alert box.

Because the same Express process serves both the site and the API, the pages post to
their own origin. Nothing has to be configured in the browser. (Open a page straight
from disk and `main.js` falls back to `http://localhost:3000`; if you ever host the pages
away from the API, set `window.PORTFOLIO_API` at the top of `main.js` to the backend URL.)

---

## Why it is built this way

**Static HTML/CSS/JS, no framework.** The pages are content, not an application. A
framework would add a toolchain, a build step and a bundle to download - for four pages
that are already readable as source. Plain files mean I can open one, change a sentence
and ship it.

**One theme file, one components file.** `theme.css` is a theme foundation where every
colour, radius, shadow, font and motion value is a `--tp-*` token. `style.css` holds the
components (nav, hero, cards, forms, footer) and consumes those tokens exclusively - it
never hard-codes a value. The practical pay-off: re-branding the whole site is changing
one number. The palette is generated from a single hue (`--tp-h`), so moving it moves the
entire accent scheme with it. It also gives the site one consistent notion of motion,
which `reveal.js` reads from (`--tp-reveal`, `--tp-dur-slow`, `--tp-stagger`) so the
scroll animations stay in step with the theme instead of being sprinkled in by hand.

**Express, serving the site and the API together.** One process, one origin, one deploy.
Running a separate static host would have meant CORS configuration, a second deployment
and a second thing to break, purely to serve files that Express can serve anyway.

**Nodemailer instead of a database.** The obvious way to store form submissions is a
table, and that is what I did first (see *loose ends* below). But storing them means I
have to remember to read them, and that means an admin page, authentication, and a
database to keep alive. An email lands where I already look, includes `replyTo`, and
turns "reply" into a single click. Fewer moving parts, less to maintain, nothing to leak.

**Multer, but also urlencoded.** Browsers send `FormData` as multipart, so the routes
parse that. They also parse plain form posts - so if JavaScript fails or is disabled, the
form still works as an ordinary HTML post. Same validation, same email.

**Validation, rate limiting and a static guard.** These are small files doing one job
each, because a public form is the only place a stranger can push data into my server:

- `validate.js` — trims, strips control characters, enforces limits (email 254, message
  5000, name 120) and returns a plain result the route acts on.
- `rateLimit.js` — an in-memory bucket per IP address, 10 submissions per 10 minutes,
  self-cleaning so the map cannot grow forever.
- `staticGuard.js` — the site folder also holds server source, the package manifest and
  SSH keys. This middleware returns 404 for all of it, before `express.static` ever gets
  a look. Secrets stay secrets even though they sit next to the files being served.

Emails are composed as plain text, never HTML — so nothing a visitor types can inject markup
into the message I receive.

---

## What is where

```
portfolio/
├─ index.html, projects.html, aboutme.html, coverletter.html   # the four pages
├─ theme.css        # design tokens (--tp-*), keyframes, palette from one hue
├─ style.css        # components, built only on those tokens
├─ main.js          # nav drawer, skill bars, counters, footer year, form posts
├─ reveal.js        # scroll reveal - generic, reads the theme's motion tokens
├─ assets/          # images, video, CV PDF
├─ server/
│  ├─ index.js      # entry point (npm start)
│  ├─ app.js        # builds the Express app: headers, CORS, routes, static site
│  ├─ config.js     # reads .env / environment into one settings object
│  ├─ loadEnv.js    # tiny dependency-free .env reader
│  ├─ validate.js   # form input checking
│  ├─ mailer.js     # nodemailer transport + message templates
│  ├─ rateLimit.js  # anti-spam limiter
│  ├─ staticGuard.js# blocks source/secret files from being served
│  └─ routes/contact.js            # POST /submit and POST /submit_rec
├─ test/            # npm test
└─ .env.example     # copy to .env and fill in
```

`GET /health` reports whether email is configured, which is handy after a deploy.

---

## Running it locally

You need **Node.js 18 or newer** (the tests use the built-in `fetch` and `FormData`).

```bash
cd portfolio
npm install
copy .env.example .env      # Windows
cp   .env.example .env      # macOS / Linux
npm start                   # http://localhost:3000
```

If `.env` is missing or incomplete the server still starts, but it says so in the
terminal, `/health` reports `emailConfigured: false`, and the forms answer with a clear
503 asking the visitor to email me directly - rather than pretending the message was
sent. That was deliberate: a form that silently swallows messages is worse than one that
admits it is not connected - I am yets to work on this !

### Configuration

Everything lives in `.env` (git-ignored, never committed):

| Variable | Purpose |
| --- | --- |
| `PORT` | Port the server listens on (default `3000`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Mail server (Gmail: `smtp.gmail.com`, `587`, `false`) |
| `SMTP_USER`, `SMTP_PASS` | Mailbox and its app password |
| `MAIL_TO` | Where notifications are delivered |
| `MAIL_FROM` | "From" address; falls back to `SMTP_USER` |
| `ALLOWED_ORIGINS` | Comma-separated site origins, or `*` |
| `RATE_LIMIT_DISABLED` | `true` only while testing |

