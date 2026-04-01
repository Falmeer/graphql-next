# GraphQL Next Dashboard

This project runs on **Next.js** (App Router) and is ready for **GitHub + Netlify** deployment.

## Run locally

1. Install dependencies:

	npm install

2. Start dev server:

	npm run dev

3. Open:

	http://localhost:3000

## Production build

Build and verify locally:

npm run build

## Push to GitHub

If this repo is not initialized yet:

git init
git add .
git commit -m "Setup Next.js app for Netlify"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main

## Deploy on Netlify

1. In Netlify, click **Add new site** → **Import an existing project**.
2. Connect your GitHub repo.
3. Netlify will use settings from [netlify.toml](netlify.toml):
	- Build command: `npm run build`
	- Node version: `20`
	- Next.js runtime plugin: `@netlify/plugin-nextjs`
4. Deploy.

After each push to `main`, Netlify will auto-deploy.
