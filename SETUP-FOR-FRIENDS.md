# Ghost Chat - Production Setup Guide

Welcome! Follow these steps to deploy and share your chat app.

## 🎯 Recommended: Railway (Easiest Option)

Railway is the simplest way to deploy both frontend and backend together.

### Complete Setup Steps:

1. **Create GitHub Account** (if you don't have one)
   - Go to [github.com](https://github.com) and sign up (free)

2. **Install Git** (if not installed)
   - Download from [git-scm.com](https://git-scm.com)

3. **Initialize Git Repository**
   
   Open PowerShell in your project folder and run:
   
   ```powershell
   cd "c:\Users\brys\Desktop\new chat platform idea"
   
   # Initialize git
   git init
   
   # Configure git (use your info)
   git config user.name "Your Name"
   git config user.email "your.email@example.com"
   
   # Add all files
   git add .
   
   # Create first commit
   git commit -m "Initial commit - Ghost Chat App"
   ```

4. **Create GitHub Repository**
   - Go to [github.com/new](https://github.com/new)
   - Name: `ephemeral-chat`
   - Keep it Public
   - Don't add README, .gitignore, or license
   - Click **"Create repository"**

5. **Push to GitHub**
   
   Copy the commands from GitHub (they look like this):
   
   ```powershell
   git remote add origin https://github.com/YOUR-USERNAME/ephemeral-chat.git
   git branch -M main
   git push -u origin main
   ```

6. **Deploy on Railway**
   - Sign up at [railway.app](https://railway.app) (use GitHub account)
   - Click **"New Project"** → **"Deploy from GitHub repo"**
   - Select your `ephemeral-chat` repository
   - Railway will detect both server and client!

7. **Configure Server Service**
   - Click on the **server** service
   - Go to **"Variables"** tab
   - Add these variables:
     - `JWT_SECRET` = `your_random_secret_key_here_123456`
     - `NODE_ENV` = `production`
   
   - Go to **"Settings"** tab
   - **Root Directory**: `server`
   - **Start Command**: `npm start`
   - Click **"Generate Domain"** to get your backend URL
   
8. **Configure Client Service**
   - Click on the **client** service
   - Go to **"Variables"** tab
   - Add:
     - `REACT_APP_API_URL` = (paste your server URL from step 7)
   
   - Go to **"Settings"** tab
   - **Root Directory**: `client`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npx serve -s build`
   - Click **"Generate Domain"** to get your frontend URL

9. **Update Backend CORS**
   - Go back to **server** service
   - Add another variable:
     - `CLIENT_URL` = (paste your client URL from step 8)
   - Service will redeploy automatically

10. **Test Your App!**
    - Open your client URL (from step 8)
    - Register an account
    - Share the URL with friends! 🎉

---

## 🔄 Alternative: Render + Vercel (Free Forever)

If Railway runs out of free tier:

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed guide using:
- **Render** for backend (free with sleep)
- **Vercel** for frontend (free, no limits)

---

## 📝 Making Updates After Deployment

1. Make your changes to the code
2. Commit and push:
   ```powershell
   git add .
   git commit -m "Your update description"
   git push
   ```
3. Railway/Render/Vercel auto-deploy (wait 1-2 minutes)

---

## 🐛 Common Issues

### Cannot Push to GitHub
```powershell
# If you get "remote origin already exists":
git remote remove origin
git remote add origin https://github.com/YOUR-USERNAME/ephemeral-chat.git
git push -u origin main
```

### Server Sleeps on Free Tier
- Use [UptimeRobot](https://uptimerobot.com) to ping your backend every 5 minutes (keeps it awake)
- Or upgrade to paid tier ($5-7/month)

### CORS Errors
- Make sure `CLIENT_URL` environment variable matches your exact frontend URL
- Include `https://` and no trailing `/`

### Voice Calls Not Working
- WebRTC requires HTTPS (automatic on Railway/Render/Vercel)
- Check browser microphone permissions

---

## 💰 Costs

| Service | Free Tier | Paid Option |
|---------|-----------|-------------|
| Railway | $5 free credit | $5/month |
| Render | Free with sleep | $7/month always-on |
| Vercel | Free unlimited | $20/month pro |
| GitHub | Free unlimited | - |

**Recommended for friends:** Start with Railway's free tier!

---

## 🎊 You're All Set!

Your friends can now:
1. Visit your URL
2. Create a username
3. Chat in real-time!

Remember: Everything is ephemeral - server restart clears all data.

**Questions?** Check:
- [DEPLOYMENT-SIMPLE.md](DEPLOYMENT-SIMPLE.md) - Quick reference
- [DEPLOYMENT.md](DEPLOYMENT.md) - Detailed guide
- [README.md](README.md) - How the app works

**Happy chatting! 🚀**
