# B4nter Setup Guide

This guide will help you set up and run the SoccerChat application locally.

## Prerequisites

- Node.js 18+ 
- Python 3.9+
- Git
- Supabase account
- Google OAuth credentials (optional)

## 1. Clone and Setup Project

```bash
git clone <your-repo-url>
cd b4nter
```

## 2. Supabase Setup

1. Go to [Supabase](https://supabase.com) and create a new project
2. Get your project URL and API keys from Settings > API
3. Run the database migration:
   - Go to SQL Editor in Supabase
   - Copy and paste the contents of `backend/migrations/001_initial_schema.sql`
   - Execute the script

## 3. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create environment file
cp env.example .env
```

Edit `backend/.env` with your configuration:

```env
# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_here
JWT_ALGORITHM=HS256
JWT_EXPIRATION=3600

# CORS Configuration
CORS_ORIGINS=http://localhost:3000

# Server Configuration
HOST=0.0.0.0
PORT=8000
DEBUG=true
```

## 4. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

Edit `frontend/.env` with your configuration:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_BACKEND_URL=http://localhost:8000
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

## 5. Google OAuth Setup (Optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized origins: `http://localhost:3000`
6. Add authorized redirect URIs: `http://localhost:3000`
7. Copy Client ID and Client Secret to your environment files

## 6. Running the Application

### Start Backend
```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Start Frontend
```bash
cd frontend
npm run dev
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

## 7. Testing the Application

1. Open http://localhost:3000
2. Register a new account or use the sample accounts:
   - Email: admin@b4nter.com, Password: password123
   - Email: user1@b4nter.com, Password: password123
   - Email: user2@b4nter.com, Password: password123

## 8. Features to Test

### Authentication
- Register with email/password
- Login with email/password
- Google OAuth login (if configured)

### Channels
- Create new channels
- Join existing channels
- View channel messages
- Send messages to channels

### Direct Messages
- Start conversations with other users
- Send and receive direct messages

### Real-time Features
- Real-time message delivery
- Typing indicators
- Online/offline status

## 9. Deployment to Render

1. Push your code to GitHub
2. Connect your repository to Render
3. Use the `render.yaml` configuration file
4. Set environment variables in Render dashboard
5. Deploy both services

## 10. Troubleshooting

### Common Issues

1. **CORS Errors**: Ensure CORS_ORIGINS includes your frontend URL
2. **Database Connection**: Verify Supabase credentials
3. **Socket.IO Connection**: Check if backend is running on correct port
4. **Google OAuth**: Ensure redirect URIs are correctly configured

### Logs

- Backend logs: Check terminal where uvicorn is running
- Frontend logs: Check browser developer console
- Supabase logs: Check Supabase dashboard

## 11. Development

### Project Structure
```
b4nter/
├── backend/           # FastAPI server
│   ├── routers/      # API routes
│   ├── models.py     # Pydantic models
│   ├── auth.py       # Authentication logic
│   ├── database.py   # Database operations
│   └── main.py       # FastAPI app
├── frontend/         # React application
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── pages/       # Page components
│   │   ├── contexts/    # React contexts
│   │   └── lib/         # Utilities and API
│   └── package.json
└── docs/            # Documentation
```

### Adding New Features

1. **Backend**: Add new routes in `backend/routers/`
2. **Frontend**: Add new components in `frontend/src/components/`
3. **Database**: Add new tables in Supabase and update models
4. **Real-time**: Add new Socket.IO events in `backend/socket_manager.py`

## 12. Security Notes

- Never commit `.env` files
- Use strong JWT secrets
- Enable Row Level Security in Supabase
- Validate all user inputs
- Use HTTPS in production

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review the API documentation at `/docs`
3. Check Supabase logs
4. Create an issue in the repository 