# Supabase Setup Guide for B4nter

This guide will walk you through setting up Supabase for the B4nter project, including database configuration, authentication, and environment setup.

## 🚀 Step 1: Create Supabase Project

### 1.1 Sign Up/Login to Supabase
1. Go to [https://supabase.com](https://supabase.com)
2. Click "Start your project" or "Sign In"
3. Sign in with GitHub, Google, or create an account

### 1.2 Create New Project
1. Click "New Project"
2. Choose your organization
3. Fill in project details:
   - **Name**: `b4nter` (or your preferred name)
   - **Database Password**: Create a strong password (save this!)
   - **Region**: Choose closest to your users
   - **Pricing Plan**: Free tier is sufficient for development

### 1.3 Wait for Setup
- Database setup takes 1-2 minutes
- You'll receive an email when ready

## 🔧 Step 2: Get Project Credentials

### 2.1 Access Project Settings
1. Go to your Supabase dashboard
2. Click on your project
3. Go to **Settings** → **API**

### 2.2 Copy Credentials
You'll need these values:

```env
# Project URL
SUPABASE_URL=https://your-project-id.supabase.co

# API Keys
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

**Important Notes:**
- **Anon Key**: Public key for client-side operations
- **Service Role Key**: Private key for server-side operations (keep secret!)
- **Project URL**: Your unique Supabase instance URL

## 🗄️ Step 3: Set Up Database Schema

### 3.1 Access SQL Editor
1. In Supabase dashboard, go to **SQL Editor**
2. Click **New Query**

### 3.2 Run Migration Script
1. Copy the entire content from `backend/migrations/001_initial_schema.sql`
2. Paste it into the SQL Editor
3. Click **Run** to execute the script

### 3.3 Verify Tables Created
Go to **Table Editor** and verify these tables exist:
- `users`
- `channels`
- `channel_members`
- `messages`

## 🔐 Step 4: Configure Authentication

### 4.1 Enable Email Authentication
1. Go to **Authentication** → **Providers**
2. Ensure **Email** is enabled
3. Configure settings:
   - **Enable email confirmations**: Disabled (for development)
   - **Secure email change**: Enabled
   - **Double confirm changes**: Enabled

### 4.2 Configure Google OAuth (Optional)
1. In **Authentication** → **Providers**
2. Enable **Google**
3. Get Google OAuth credentials:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create new project or select existing
   - Enable Google+ API
   - Create OAuth 2.0 credentials
   - Add authorized origins: `http://localhost:3000`
   - Add redirect URIs: `http://localhost:3000`
4. Add credentials to Supabase:
   - **Client ID**: Your Google OAuth client ID
   - **Client Secret**: Your Google OAuth client secret

### 4.3 Configure Auth Settings
1. Go to **Authentication** → **Settings**
2. Configure:
   - **Site URL**: `http://localhost:3000` (for development)
   - **Redirect URLs**: `http://localhost:3000/**`
   - **JWT Expiry**: `3600` (1 hour)

## 🌐 Step 5: Configure Row Level Security (RLS)

The migration script already sets up RLS policies, but verify they're working:

### 5.1 Check RLS Status
1. Go to **Table Editor**
2. Select each table (`users`, `channels`, `channel_members`, `messages`)
3. Verify **RLS** is enabled (toggle should be ON)

### 5.2 Verify Policies
Check that these policies exist:

**Users Table:**
- `Users can view their own data`
- `Users can view other users' public data`
- `Users can update their own data`

**Channels Table:**
- `Users can view channels they are members of`
- `Channel creators can update their channels`

**Messages Table:**
- `Users can view channel messages`
- `Users can view direct messages`
- `Users can create messages`

## ⚙️ Step 6: Environment Configuration

### 6.1 Backend Configuration
Create `backend/.env` file:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Google OAuth (if configured)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# JWT Configuration
JWT_SECRET=your-jwt-secret-key-here
JWT_ALGORITHM=HS256
JWT_EXPIRATION=3600

# CORS Configuration
CORS_ORIGINS=http://localhost:3000

# Server Configuration
HOST=0.0.0.0
PORT=8000
DEBUG=true
```

### 6.2 Frontend Configuration
Create `frontend/.env` file:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_BACKEND_URL=http://localhost:8000
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

## 🧪 Step 7: Test Configuration

### 7.1 Quick Test
```bash
python test_scripts/quick_test.py
```

### 7.2 Full Test Suite
```bash
cd test_scripts
pip install -r requirements.txt
python run_tests.py
```

## 🔍 Step 8: Verify Setup

### 8.1 Check Database Connection
1. Go to **Table Editor**
2. Verify sample data exists:
   - 3 users in `users` table
   - 3 channels in `channels` table
   - Channel members in `channel_members` table
   - Sample messages in `messages` table

### 8.2 Test Authentication
1. Start your backend: `uvicorn main:app --reload`
2. Test registration: `POST /auth/register`
3. Test login: `POST /auth/login`

### 8.3 Check API Documentation
1. Visit: `http://localhost:8000/docs`
2. Verify all endpoints are available
3. Test endpoints with sample data

## 🚨 Troubleshooting

### Common Issues

#### 1. Database Connection Failed
```
Error: Could not connect to database
```
**Solution:**
- Verify `SUPABASE_URL` is correct
- Check `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`
- Ensure database is not paused (free tier pauses after inactivity)

#### 2. RLS Policy Errors
```
Error: new row violates row-level security policy
```
**Solution:**
- Verify RLS policies are correctly applied
- Check user authentication
- Ensure proper user context in requests

#### 3. CORS Errors
```
Error: CORS policy violation
```
**Solution:**
- Add your frontend URL to `CORS_ORIGINS`
- Verify `SITE_URL` in Supabase Auth settings
- Check redirect URLs configuration

#### 4. Google OAuth Not Working
```
Error: Invalid Google token
```
**Solution:**
- Verify Google OAuth credentials
- Check authorized origins and redirect URIs
- Ensure Google+ API is enabled

### Debug Steps

1. **Check Supabase Logs**
   - Go to **Logs** in Supabase dashboard
   - Check for authentication errors
   - Monitor database queries

2. **Verify Environment Variables**
   ```bash
   # Backend
   cd backend
   python -c "from config import settings; print(settings.supabase_url)"
   
   # Frontend
   cd frontend
   npm run dev
   # Check browser console for environment variables
   ```

3. **Test Database Connection**
   ```bash
   cd backend
   python -c "
   from database import db
   import asyncio
   result = asyncio.run(db.get_all_users())
   print('Users:', len(result))
   "
   ```

## 🔒 Security Best Practices

### 1. Environment Variables
- Never commit `.env` files to version control
- Use different keys for development and production
- Rotate keys regularly

### 2. Database Security
- Use RLS policies for all tables
- Limit service role key usage
- Monitor database access logs

### 3. Authentication
- Enable email confirmations in production
- Use strong JWT secrets
- Implement rate limiting

### 4. CORS Configuration
- Only allow necessary origins
- Use HTTPS in production
- Validate all inputs

## 📊 Monitoring

### 1. Supabase Dashboard
- Monitor database usage
- Check authentication logs
- Track API requests

### 2. Application Logs
- Monitor backend logs
- Check frontend console errors
- Track user activity

### 3. Performance
- Monitor query performance
- Check connection pooling
- Track response times

## 🚀 Production Deployment

### 1. Update Environment Variables
```env
# Production URLs
CORS_ORIGINS=https://your-domain.com
SITE_URL=https://your-domain.com
```

### 2. Enable Email Confirmations
- Go to Supabase Auth settings
- Enable email confirmations
- Configure email templates

### 3. Set Up Monitoring
- Enable Supabase monitoring
- Set up alerts for errors
- Monitor usage limits

## 📞 Support

If you encounter issues:

1. **Check Supabase Documentation**: [https://supabase.com/docs](https://supabase.com/docs)
2. **Supabase Community**: [https://github.com/supabase/supabase/discussions](https://github.com/supabase/supabase/discussions)
3. **Supabase Discord**: [https://discord.supabase.com](https://discord.supabase.com)

## 🔄 Next Steps

After completing Supabase setup:

1. **Run Tests**: Verify everything works with test scripts
2. **Start Development**: Begin building your application
3. **Deploy**: Use the provided Render configuration
4. **Monitor**: Set up monitoring and alerts

Your B4nter application is now ready to use with Supabase! 