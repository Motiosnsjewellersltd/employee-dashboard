# Motisons Employee Dashboard - Vercel Deployment

This project is a full-stack Next.js application. GitHub Pages cannot run its `/api/*` routes, Prisma, or MySQL access. Deploy the repository as a Next.js project on Vercel instead.

## 1. Database

Create a managed MySQL database (Railway, Aiven, TiDB Cloud, PlanetScale-compatible MySQL, or another provider) and copy its `DATABASE_URL`.

Do not use your PC's `localhost` MySQL URL on Vercel.

## 2. Vercel project

1. Sign in to Vercel and choose **Add New > Project**.
2. Import the GitHub repository `Motisonsjewellersltd/employee-dashboard`.
3. Framework preset should be **Next.js**.
4. Add these Environment Variables for Production (and Preview if required):
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `NEXT_PUBLIC_APP_URL` (set it to the final Vercel URL after the first deploy, then redeploy)
5. In **Storage**, create/connect a **Vercel Blob** store. The app uses Blob for employee photos and chat/notification attachments when running on Vercel.
6. Deploy.

## 3. Create database tables

From your local project folder, temporarily put the production `DATABASE_URL` in `.env`, then run:

```bat
npx prisma db push
npx prisma generate
```

## 4. Create the first admin

Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` locally in `.env`, then run:

```bat
npm run db:seed
```

Use a strong password. The seed script no longer contains a public default password.

## 5. GitHub Pages

Disable GitHub Pages for this repository (Settings > Pages) or simply do not use its URL. The working application URL is the Vercel deployment URL.

## 6. Important upload note

Vercel server uploads are limited by the function request-body size. This project limits cloud photo/chat/notification uploads to 4 MB so they remain inside that limit. Local-PC mode keeps using the existing `public/uploads` folder.

## Updating later

After the GitHub repository is connected to Vercel, normal updates are:

```bat
git add .
git commit -m "Update employee dashboard"
git push origin main
```

Vercel automatically builds and deploys the new commit.
