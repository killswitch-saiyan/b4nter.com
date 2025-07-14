# b4nter.com
Where the game never stops talking

A real-time messaging platform built specifically for soccer/football communities, teams, and fans.

## Features

- **User Authentication**: Email/password + Google OAuth
- **Direct Messaging**: One-on-one conversations between users
- **Channels**: Create and join football-related channels
- **Admin Controls**: Channel creators have admin privileges
- **Real-time Messaging**: Instant message delivery with Socket.io
- **Football-focused**: Built specifically for soccer communities

## Tech Stack

- **Frontend**: React + Tailwind CSS
- **Backend**: Python FastAPI
- **Database**: Supabase (PostgreSQL)
- **Real-time**: Socket.io
- **Authentication**: Supabase Auth + Google OAuth
- **Deployment**: Render

## Project Structure

```
b4nter/
├── frontend/          # React application
├── backend/           # FastAPI server
├── shared/            # Shared types and utilities
└── docs/              # Documentation
```

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.9+
- Supabase account
- Google OAuth credentials (optional)

### Development Setup

1. **Clone and setup environment**:
   ```bash
   git clone <repository>
   cd b4nter
   ```

2. **Supabase Setup**:
   ```bash
   # Run the interactive setup script
   python setup_supabase.py

   # Or follow the manual setup guide
   # See SUPABASE_SETUP.md for detailed instructions
   ```

3. **Database Migration**:
   - Go to Supabase SQL Editor
   - Copy and run the content from `backend/migrations/001_initial_schema.sql`

4. **Backend Setup**:
   ```bash
   cd backend
   pip install -r requirements.txt
   # .env file created by setup script
   uvicorn main:app --reload
   ```

5. **Frontend Setup**:
   ```bash
   cd frontend
   npm install
   # .env file created by setup script
   npm run dev
   ```

## Environment Variables

Environment variables are automatically configured by the setup script. For manual configuration, see the example files:

### Backend (.env)
```
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GOOGLE_CLIENT_ID=your_google_client_id (optional)
GOOGLE_CLIENT_SECRET=your_google_client_secret (optional)
JWT_SECRET=your_jwt_secret
CORS_ORIGINS=http://localhost:3000
```

### Frontend (.env)
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_BACKEND_URL=http://localhost:8000
VITE_GOOGLE_CLIENT_ID=your_google_client_id (optional)
```

**Note**: Use the interactive setup script for easy configuration:
```bash
python setup_supabase.py
```

## Testing

### Quick Test
```bash
python test_scripts/quick_test.py
```

### Full Test Suite
```bash
cd test_scripts
pip install -r requirements.txt
python run_tests.py
```

## API Documentation

Once the backend is running, visit `http://localhost:8000/docs` for interactive API documentation.

## Deployment

### Render Deployment

1. **Backend**: Deploy as a Python service
2. **Frontend**: Deploy as a static site
3. **Database**: Use Supabase (already hosted)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License
