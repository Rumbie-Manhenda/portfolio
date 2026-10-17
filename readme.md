# Patricia Manhenda — portfolio

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

1. `main.js` catches the submit, builds a `FormData` and hands it to `form-delivery.js`
   together with the path in the form's `data-endpoint` attribute — `/submit`
   (email + message) or `/submit_rec` (name + email + recommendation).
2. `form-delivery.js` posts it to the Express API. `multer` parses the multipart body,
   `rateLimit.js` checks the sender has not been spamming, and `validate.js` trims the
   input, strips control characters and checks the lengths.
3. `mailer.js` composes a plain-text email to me with `replyTo` set to whoever wrote in,
   and hands it to `nodemailer`.
4. The response comes back as a sentence, and `main.js` writes it into the form's status
   area — inline, no page reload, no alert box.

Step 2 only works where the Express process is running. GitHub Pages has no process —
only files — so a POST to `/submit` there is a 404. `form-delivery.js` notices and
re-sends the same submission to the form service named in `api-config.js`, which emails
it straight to me. Same form, same fields, same reply to the visitor; two routes, so it
works both on my own machine and on the published site.

Because the same Express process serves both the site and the API, the pages post to
their own origin. Nothing has to be configured in the browser. (Open a page straight
from disk and `form-delivery.js` falls back to `http://localhost:3000`; if the pages are
ever hosted away from the API, set `window.PORTFOLIO_API` to the backend URL.)

---

## Why it is built this way

**Static HTML/CSS/JS, no framework.** The pages are content, not an application. A
framework would add a toolchain, a build step and a bundle to download — for four pages
that are already readable as source. Plain files mean I can open one, change a sentence
and ship it.

**One theme file, one components file.** `theme.css` is a theme foundation where every
colour, radius, shadow, font and motion value is a `--tp-*` token. `style.css` holds the
components (nav, hero, cards, forms, footer) and consumes those tokens exclusively — it
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
turns "reply" into a single click. Fewer moving parts, less to maintain, and no store of
other people's messages to look after.

**Multer, but also urlencoded.** Browsers send `FormData` as multipart, so the routes
parse that. They also parse plain form posts — so if JavaScript fails or is disabled, the
form still works as an ordinary HTML post. Same validation, same email.

**Validation, rate limiting and a static guard.** These are small files doing one job
each, because a public form is the only place a stranger can push data into my server:

- `validate.js` — trims, strips control characters, enforces limits (email 254, message
  5000, name 120) and returns a plain result the route acts on.
- `rateLimit.js` — an in-memory bucket per IP address, 10 submissions per 10 minutes,
  self-cleaning so the map cannot grow forever.
- `staticGuard.js` — the site folder also holds the server's own source and the package
  manifest. This middleware returns 404 for all of it, before `express.static` ever gets
  a look, so serving the site never means serving the backend.

Emails are composed as plain text, never HTML — nothing a visitor types can inject markup
into the message I receive.

---

## What is where

```
portfolio/
├─ index.html, projects.html, aboutme.html, coverletter.html   # the four pages
├─ theme.css        # design tokens (--tp-*), keyframes, palette from one hue
├─ style.css        # components, built only on those tokens
├─ main.js          # nav drawer, skill bars, counters, footer year, form wiring
├─ form-delivery.js # chooses the form's route (API, then the service) and posts
├─ api-config.js    # the one place the forms' API URL and fallback are set
├─ reveal.js        # scroll reveal — generic, reads the theme's motion tokens
├─ assets/          # images, generated project covers, video, CV PDF
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
├─ requirements.txt # runtime + dependency list, in plain English
├─ Dockerfile       # builds the site and the API as one image
├─ .dockerignore
├─ .github/workflows/static.yml    # publishes the pages to GitHub Pages
└─ .env.example     # copy to .env and fill in
```

`GET /health` reports whether email is configured, which is handy after a deploy.

---

## Running it locally

You need **Node.js 18 or newer** - Node 20 LTS is a good default. There is no build
step, and nothing here is Python.

```bash
cd portfolio
npm ci                      # install exactly what package-lock.json pins
copy .env.example .env      # Windows
cp   .env.example .env      # macOS / Linux
npm start                   # http://localhost:3000
```

`requirements.txt` lists the runtime and the three packages the site actually uses;
`package.json` (ranges) and `package-lock.json` (exact versions) are what npm installs
from. `requirements.txt` also records how to regenerate itself.

If `.env` is missing or incomplete the server still starts, but it says so in the
terminal, `/health` reports `emailConfigured: false`, and a submission comes back as a
clear 503 rather than pretending the message was sent. That was deliberate: a form that
silently swallows messages is worse than one that admits it is not connected.

In the browser that 503 is not the end of it. `form-delivery.js` reads it as "this route
cannot deliver" and re-sends the message to the form service instead, so the visitor
still gets their message through — which is why the site works even before any of this
is configured.

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

For Gmail: turn on 2-Step Verification, create an App Password at
<https://myaccount.google.com/apppasswords>, and use that 16-character value as
`SMTP_PASS`. Not your normal password.

## Tests

```bash
npm test        # node --test test/
```

The suite runs the real Express app on an ephemeral port with a stub mail transport and
checks the things I would otherwise break by accident: both forms reach the mailer, an
unconfigured server returns 503, bad input returns 400 and sends nothing, a plain
no-JavaScript post still works, `/health` tells the truth, the site is served at the
root, and `/gitkey`, `/package.json` and `/server/index.js` all 404.

`test/form-delivery.test.js` covers the routing layer on its own, with a stubbed `fetch`:
the API's own answer is kept, a 404/405/502/503 or an unreachable host falls through to
the service, the recommendation fields are renamed for the service, and a 400 is never
retried.

## Deploying

There are two halves here and they deploy differently.

**The pages** are published by GitHub Actions. `.github/workflows/static.yml` runs on
every push to `main`, uploads the repository as an artifact, and hands it to GitHub
Pages.

Worth being explicit about what that workflow does, because it is easy to miss: it
uploads **`path: '.'`** — the *entire* repository — and publishes it at a public URL.
Whatever is committed here becomes downloadable, not just the pages. `staticGuard` does
not help, because on Pages nothing is running but a plain file server; that middleware
only guards the site when Express is the thing serving it.

So: keep `server/`, `node_modules/`, `.env` and any key or credential out of what gets
published — either by narrowing the workflow's `path` to just the pages and `assets/`, or
by keeping them out of the repository in the first place.

**The API** is a Node process, and Pages cannot run it, so it needs a host of its own.
`Dockerfile` and `.dockerignore` are included and work as-is on Render, Railway, Fly.io or
any VPS. A host that runs Node directly works too: build with `npm ci`, start with
`npm start`.

### Making the contact forms deliver

There are two routes, and the forms use whichever one is available. Route A needs no
account and no server; Route B uses my own SMTP account and needs the Express API to be
running somewhere.

**Route A — the form service (works today, on GitHub Pages).**
`api-config.js` already points at it. The only setup is a one-time confirmation:

1. Submit the form once, from the published site.
2. FormSubmit sends one confirmation email to `pattymcharis15@gmail.com`. Click the link
   in it.
3. Every message after that is delivered to that inbox.

Nothing is required from a visitor, and no server is involved. To switch the fallback
off, set `window.PORTFOLIO_FORM_ENDPOINT = ''` — the forms then need Route B.

**Route B — the API and my own SMTP account.**

Three steps, in order.

**1. Create a Gmail app password.** Turn on 2-Step Verification, then create one at
<https://myaccount.google.com/apppasswords>. It is 16 characters. Your normal Google
password will not work here.

**2. Deploy the API** with these variables set on the host (in the host's dashboard, never
committed):

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=pattymcharis15@gmail.com
SMTP_PASS=<the 16-character app password>
MAIL_TO=pattymcharis15@gmail.com
MAIL_FROM=pattymcharis15@gmail.com
ALLOWED_ORIGINS=https://rumbie-manhenda.github.io
```

`MAIL_TO` already defaults to `pattymcharis15@gmail.com` in `server/config.js`, so it
works even if you leave that line out. Then check `https://<your-api-host>/health`: it
should report `"emailConfigured": true`.

**3. Point the pages at the API.** In `api-config.js`, set:

```js
window.PORTFOLIO_API = 'https://<your-api-host>';
```

Commit and push, so Pages republishes with the new value.

Nothing fails silently if a step is missed: `/health` reports `emailConfigured: false`,
and the API answers a submission with a 503. With Route A still configured that 503 just
hands the message to the form service, so Route B failing over is invisible to the
visitor — check `/health` when you want to be sure the API itself is the one sending.

Deploying the whole folder to one Node host instead — API and pages on the same origin —
needs neither setting. Leave `window.PORTFOLIO_API` empty and the forms post to the page
they came from.

---

## A few loose ends

