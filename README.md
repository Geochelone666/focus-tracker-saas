# Focus Tracker SaaS

A full-stack **Next.js (App Router)** starter with **Tailwind CSS** and **Supabase authentication**.

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Supabase (`@supabase/ssr` + `@supabase/supabase-js`)

## Project Structure

```text
.
├── app/
│   ├── actions/
│   │   └── auth.ts
│   ├── dashboard/
│   │   └── page.tsx
│   ├── login/
│   │   ├── actions.ts
│   │   └── page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   └── header.tsx
├── lib/
│   └── env.ts
├── supabase/
│   ├── client.ts
│   ├── middleware.ts
│   └── server.ts
├── middleware.ts
└── .env.example
```

## Environment Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create local env file:

   ```bash
   cp .env.example .env.local
   ```

3. Provide Supabase project values:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=your-project-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

## Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Authentication Flow

- `/login` supports both email/password **login** and **signup**.
- Session persistence is handled using Supabase auth helpers and Next.js middleware.
- Header displays the authenticated user email and a logout button.
- `/dashboard` is protected and redirects to `/login` when unauthenticated.
