# Switch to Different GitHub Account

## Current Configuration
- **Git user:** GoodMind India (info@goodmind.app)
- **Remote:** https://github.com/asgar-dcw/qa-main.git

## Steps to Use Your Different Account

### 1. Update Git Identity (replace with YOUR details)
```powershell
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"
```

### 2. Update Remote (if pushing to a different repo)
If the repo is under your other account (e.g. `your-username/qa-main`):
```powershell
cd d:\qa-automation-main\qa-automation-main
git remote set-url origin https://github.com/YOUR_USERNAME/qa-main.git
```

### 3. Clear Cached Credentials
```powershell
git credential reject
```
Then paste this and press Enter twice:
```
protocol=https
host=github.com
```

Or use Windows Credential Manager:
- Open **Control Panel** → **Credential Manager** → **Windows Credentials**
- Find any `git:https://github.com` entry and remove it

### 4. Push
```powershell
cd d:\qa-automation-main\qa-automation-main
git push -u origin main
```
A browser or login prompt will appear — sign in with your **new** GitHub account.

---

**Note:** Ensure the repository exists on GitHub under your account first:
- Go to https://github.com/new
- Create repo named `qa-main` (or your preferred name)
- Do NOT initialize with README
- Copy the repo URL and use it in step 2
