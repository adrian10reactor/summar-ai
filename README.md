# Sumar AI

Upload PDFs, get AI-generated quizzes. A study tool POC.

## What it does

- Upload **one or multiple PDFs** and get a multiple-choice quiz generated from the content
- Configure **number of questions** (3-50, or let AI decide) and **difficulty** (easy/medium/hard/mixed)
- Take the quiz with a clean UI, get scored with explanations for every answer
- **Share** quizzes via link or **download** as a standalone HTML file that works offline

## How it works

1. PDFs are sent as base64 to **Google Gemini** (free tier API)
2. Gemini reads the documents natively and returns structured JSON (questions, options, correct answers, explanations)
3. If a model hits its rate limit, the app automatically falls back through **14 different Gemini models**, each with its own free quota

## Where data is stored

- **Browser localStorage** only -- no database, no server-side storage, no accounts
- Quizzes persist across page reloads but are tied to the browser
- Share links encode the full quiz in the URL hash (never sent to a server)
- HTML exports are fully self-contained single files

## Setup

```bash
# Install dependencies
npm install

# Add your free Gemini API key
# Get one at https://aistudio.google.com/apikey
echo "GEMINI_API_KEY=your_key_here" > .env.local

# Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Tech stack

- Next.js 16 + Tailwind CSS
- Google Gemini 2.0 Flash (free tier)
- No database, no auth
