# Focus Tracker SaaS

A full-stack **Next.js (App Router)** starter with **Tailwind CSS** and **Supabase authentication**.
A clean, production-ready starter for a full-stack **Next.js (App Router)** application with **Tailwind CSS** and **Supabase client scaffolding**.

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Supabase (`@supabase/ssr` + `@supabase/supabase-js`)
- Supabase JavaScript client

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
│   └── login-button.tsx
├── lib/
│   └── env.ts
├── supabase/
│   └── client.ts
├── .env.example
├── next.config.mjs
├── postcss.config.mjs
├── tailwind.config.ts
└── tsconfig.json
```

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create local env file:
2. Create your environment file:

   ```bash
   cp .env.example .env.local
   ```

3. Provide Supabase project values:
3. Add your Supabase credentials to `.env.local`:

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
4. Run the development server:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

## Notes

- Authentication and database features are intentionally not implemented yet.
- The Supabase client uses environment variables only (no hardcoded keys).
- The homepage includes a non-functional **Login** button for future wiring.
