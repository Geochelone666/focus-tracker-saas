# Focus Tracker SaaS

A clean, production-ready starter for a full-stack **Next.js (App Router)** application with **Tailwind CSS** and **Supabase client scaffolding**.

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Supabase JavaScript client

## Project Structure

```text
.
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
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

2. Create your environment file:

   ```bash
   cp .env.example .env.local
   ```

3. Add your Supabase credentials to `.env.local`:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=your-project-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

4. Run the development server:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

## Notes

- Authentication and database features are intentionally not implemented yet.
- The Supabase client uses environment variables only (no hardcoded keys).
- The homepage includes a non-functional **Login** button for future wiring.
