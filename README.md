# SociaLens 🌐

A full-stack social media app built with **Next.js 15**, **TypeScript**, **Tailwind CSS**, and **Supabase** — Instagram-style features including feed, reels, real-time chat, follow system, and more.

---

## 🚀 Features

- ✅ Email/Password auth + Google OAuth + Email verification
- ✅ User profiles with avatar & cover photo
- ✅ Follow system (public & private accounts)
- ✅ Follow requests & approval
- ✅ Posts (text + image + video)
- ✅ Like / Comment / Share
- ✅ Reels — TikTok-style vertical video feed
- ✅ Real-time 1-on-1 chat (Supabase Realtime)
- ✅ Typing indicators (Broadcast)
- ✅ Online/offline status (Presence)
- ✅ Dark mode
- ✅ Fully responsive — mobile, tablet, desktop
- ✅ Adsterra ads (iframe method, React compatible)
- ✅ Settings page with privacy toggle

---

## 🛠 Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 15 (App Router + Turbopack) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v3 + shadcn/ui |
| Backend | Supabase (Auth + DB + Realtime + Storage) |
| Forms | react-hook-form + zod |
| Data fetching | @tanstack/react-query |
| Icons | lucide-react |
| Dark mode | next-themes |

---

## ⚙️ Setup Instructions

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Go to **SQL Editor** and run the entire contents of `supabase-setup.sql`
3. This will create all tables, RLS policies, helper functions, storage buckets, and triggers

### 2. Configure Environment Variables

Copy `.env.local` and fill in your values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_ADSTERRA_PUBLISHER_ID=your_adsterra_id
```

Find your Supabase URL and anon key at: **Project Settings → API**

### 3. Configure Google OAuth (optional)

1. In Supabase Dashboard: **Authentication → Providers → Google** → Enable
2. Create Google OAuth credentials at [console.cloud.google.com](https://console.cloud.google.com)
3. Add redirect URL: `https://your-project.supabase.co/auth/v1/callback`

### 4. Configure Email Verification

In Supabase Dashboard: **Authentication → URL Configuration**
- Site URL: `http://localhost:3000` (or your Vercel URL in production)
- Redirect URLs: Add `http://localhost:3000/api/auth/callback`

### 5. Install & Run

```bash
cd socialens
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 📦 Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel Dashboard or:
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add NEXT_PUBLIC_SITE_URL  # set to your vercel domain
```

After deploy, update in Supabase:
- **Authentication → URL Configuration → Site URL** → your Vercel URL
- Add Vercel URL to **Redirect URLs**

---

## 💰 Adsterra Ads Setup

1. Sign up at [adsterra.com](https://adsterra.com)
2. Create ad zones and get your slot keys
3. Set `NEXT_PUBLIC_ADSTERRA_PUBLISHER_ID` in `.env.local`
4. Update slot keys in components:
   - Feed ads: `feed_slot_X` in `app/(main)/feed/page.tsx`
   - Reels ads: `reels_slot` in `components/reels/ReelsFeed.tsx`
   - Sidebar ads: `sidebar_slot` in `components/layout/Sidebar.tsx`

> The `AdsterraBanner` component uses an **iframe-based method** which prevents the common `atOptions` overwrite bug that happens with React's re-rendering.

---

## 📁 Project Structure

```
socialens/
├── app/
│   ├── (auth)/          # Login, Signup, Verify Email
│   ├── (main)/          # Feed, Explore, Reels, Chat, Profile, Settings
│   ├── api/             # API routes
│   ├── layout.tsx       # Root layout with providers
│   └── globals.css
├── components/
│   ├── ui/              # shadcn/ui base components
│   ├── feed/            # PostCard, CommentSection, etc.
│   ├── chat/            # ChatList, ChatMessage, RealtimeMessages
│   ├── reels/           # ReelCard, ReelsFeed, VideoPlayer
│   ├── profile/         # ProfileHeader, FollowButton, etc.
│   ├── layout/          # Navbar, Sidebar, MobileBottomNav
│   └── shared/          # AdsterraBanner, LoadingSpinner, Toast
├── lib/
│   ├── supabase/        # client.ts, server.ts, middleware.ts
│   ├── hooks/           # useUser, usePosts, useFollow, useRealtimeMessages
│   ├── utils/           # helpers.ts, validation.ts
│   └── types/           # database.types.ts
├── public/
│   └── images/          # socialens-logo.png, default-avatar.svg
├── middleware.ts          # Route protection
├── supabase-setup.sql     # Complete DB setup — run this first!
└── .env.local            # Your environment variables
```

---

## 🔒 Security

- All routes protected via `middleware.ts`
- Row Level Security (RLS) enabled on all tables
- Storage policies restrict access by user ID
- TypeScript strict mode catches type errors at build time

---

## 📱 Responsive Breakpoints

| Device | Layout |
|--------|--------|
| Mobile `< 640px` | Bottom navigation bar |
| Tablet `640px – 1024px` | Top navbar only |
| Desktop `> 1024px` | Left sidebar navigation |

---

## 🐛 Troubleshooting

**Login not working?**
→ Check Supabase URL/anon key in `.env.local`

**Email verification not received?**
→ Check spam folder, or use Supabase Dashboard → Authentication → Users to manually confirm

**Realtime chat not working?**
→ Make sure `ALTER PUBLICATION supabase_realtime ADD TABLE messages;` was run in SQL editor

**Images not loading?**
→ Check storage bucket names match: `avatars`, `covers`, `posts`

---

Made with ❤️ using Next.js + Supabase
