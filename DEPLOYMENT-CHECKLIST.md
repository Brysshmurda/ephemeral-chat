# ✅ Deployment Checklist

Follow these steps in order:

## Phase 1: Prepare Your Code

- [ ] Git installed on your computer
- [ ] GitHub account created
- [ ] All code files saved

## Phase 2: Push to GitHub

```powershell
cd "c:\Users\brys\Desktop\new chat platform idea"
git init
git add .
git commit -m "Initial commit"
```

- [ ] Created GitHub repository (github.com/new)
- [ ] Pushed code to GitHub:
  ```powershell
  git remote add origin https://github.com/YOUR-USERNAME/ephemeral-chat.git
  git branch -M main
  git push -u origin main
  ```

## Phase 3: Deploy Backend

**Option A: Railway (Recommended)**
- [ ] Signed up at railway.app
- [ ] Created new project from GitHub repo
- [ ] Clicked on **server** service
- [ ] Added environment variables:
  - [ ] `JWT_SECRET` = random string
  - [ ] `NODE_ENV` = production
- [ ] Generated domain for backend
- [ ] **My backend URL:** _________________________________

**Option B: Render**
- [ ] Signed up at render.com
- [ ] Created new Web Service
- [ ] Root directory: `server`
- [ ] Added environment variables
- [ ] **My backend URL:** _________________________________

## Phase 4: Deploy Frontend

**Option A: Railway**
- [ ] Clicked on **client** service
- [ ] Added environment variable:
  - [ ] `REACT_APP_API_URL` = your backend URL
- [ ] Generated domain for frontend
- [ ] **My frontend URL:** _________________________________

**Option B: Vercel**
- [ ] Signed up at vercel.com
- [ ] Imported GitHub project
- [ ] Root directory: `client`
- [ ] Updated `REACT_APP_API_URL` in settings
- [ ] **My frontend URL:** _________________________________

## Phase 5: Connect Frontend & Backend

- [ ] Updated backend `CLIENT_URL` to match frontend URL
- [ ] Waited for redeployment (2 minutes)
- [ ] Checked logs for errors

## Phase 6: Test!

- [ ] Opened frontend URL in browser
- [ ] Created an account
- [ ] Opened frontend URL in incognito/private window
- [ ] Created second account
- [ ] Both users see each other online
- [ ] Sent messages successfully
- [ ] Tested voice call (optional)

## Phase 7: Share with Friends! 🎉

- [ ] Copied frontend URL
- [ ] Shared with friends via text/email/Discord/etc.

**My shareable link:** _________________________________

---

## Optional: Keep Server Awake

Free tiers sleep after 15 minutes of inactivity.

- [ ] Signed up at [uptimerobot.com](https://uptimerobot.com)
- [ ] Created "HTTP(s)" monitor
- [ ] Added backend URL
- [ ] Set interval to 5 minutes

Now your server stays awake!

---

## Need Help?

- **Quick Start:** [DEPLOYMENT-SIMPLE.md](DEPLOYMENT-SIMPLE.md)
- **Full Guide:** [DEPLOYMENT.md](DEPLOYMENT.md)
- **Step by Step:** [SETUP-FOR-FRIENDS.md](SETUP-FOR-FRIENDS.md)

Check service dashboards for logs and errors.

---

## ✨ You're Done!

Give yourself a high five! Your chat app is now live on the internet. 🎊

Friends can visit your URL anytime to chat!
