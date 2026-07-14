## Deploy to Vercel

## Quick Deploy

1. **Push to GitHub** (if not already)
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

2. **Import on Vercel**
   - Go to [vercel.com](https://vercel.com) → **Add New Project**
   - Import your GitHub repository
   - Vercel auto-detects Vite; no config changes needed
   - Click **Deploy**

3. **Optional: Environment Variables**
   - In Vercel: Project → **Settings** → **Environment Variables**
   - Add `VITE_WEBHOOK_URL` = `https://hr.n8n.dcw.dev/webhook/qa-orchestrator` (or your n8n URL)
   - Add `VITE_JIRA_FETCH_URL` = `https://hr.n8n.dcw.dev/webhook/jira-fetch` (for Jira requirements preview)
   - Redeploy for changes to take effect

## Build & Output

- **Build command:** `npm run build` (runs `vite build`)
- **Output directory:** `dist`
- **Install command:** `npm install`

## n8n CORS

Ensure your n8n webhook has CORS enabled for your Vercel domain:

- `allowedOrigins: "*"` (or add `https://your-app.vercel.app`)

## Logo / Image

The app references `/image.png` for the DotcomWeavers logo. Add `public/image.png` if you want the logo to appear; otherwise it will show a broken image placeholder.
