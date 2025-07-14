#!/usr/bin/env python3
"""
B4nter Supabase Setup Script
Interactive script to help configure Supabase environment variables
"""

import os
import re
import sys
from pathlib import Path

def print_header(title):
    """Print formatted header"""
    print("\n" + "=" * 60)
    print(f"🏈 {title}")
    print("=" * 60)

def get_input(prompt, required=True, default=""):
    """Get user input with validation"""
    while True:
        if default:
            value = input(f"{prompt} (default: {default}): ").strip()
            if not value:
                value = default
        else:
            value = input(f"{prompt}: ").strip()
        
        if required and not value:
            print("❌ This field is required!")
            continue
        
        return value

def validate_url(url):
    """Validate Supabase URL format"""
    if not url.startswith("https://"):
        return False
    if not url.endswith(".supabase.co"):
        return False
    return True

def validate_key(key):
    """Validate API key format"""
    # Supabase keys are typically long base64 strings
    if len(key) < 50:
        return False
    return True

def create_env_file(env_data, filepath):
    """Create .env file with provided data"""
    try:
        with open(filepath, 'w') as f:
            for key, value in env_data.items():
                f.write(f"{key}={value}\n")
        return True
    except Exception as e:
        print(f"❌ Error creating {filepath}: {e}")
        return False

def main():
    """Main setup function"""
    print_header("B4nter Supabase Configuration")
    
    print("This script will help you configure Supabase for B4nter.")
    print("You'll need your Supabase project credentials from:")
    print("https://supabase.com/dashboard/project/[your-project]/settings/api")
    print()
    
    # Get Supabase credentials
    print("📋 Enter your Supabase credentials:")
    supabase_url = get_input("Supabase Project URL (e.g., https://abc123.supabase.co)")
    
    if not validate_url(supabase_url):
        print("❌ Invalid Supabase URL format!")
        print("URL should be: https://[project-id].supabase.co")
        return False
    
    supabase_anon_key = get_input("Supabase Anon Key")
    if not validate_key(supabase_anon_key):
        print("❌ Invalid anon key format!")
        return False
    
    supabase_service_key = get_input("Supabase Service Role Key")
    if not validate_key(supabase_service_key):
        print("❌ Invalid service role key format!")
        return False
    
    # Optional Google OAuth
    print("\n🔐 Google OAuth Configuration (Optional):")
    google_client_id = get_input("Google Client ID", required=False)
    google_client_secret = get_input("Google Client Secret", required=False)
    
    # JWT Configuration
    print("\n🔑 JWT Configuration:")
    jwt_secret = get_input("JWT Secret (generate a strong random string)", 
                          default="your-super-secret-jwt-key-change-this-in-production")
    
    # Environment-specific settings
    print("\n🌐 Environment Configuration:")
    cors_origins = get_input("CORS Origins (comma-separated)", 
                            default="http://localhost:3000")
    
    # Create backend .env
    print_header("Creating Backend Configuration")
    
    backend_env = {
        "SUPABASE_URL": supabase_url,
        "SUPABASE_ANON_KEY": supabase_anon_key,
        "SUPABASE_SERVICE_ROLE_KEY": supabase_service_key,
        "JWT_SECRET": jwt_secret,
        "JWT_ALGORITHM": "HS256",
        "JWT_EXPIRATION": "3600",
        "CORS_ORIGINS": cors_origins,
        "HOST": "0.0.0.0",
        "PORT": "8000",
        "DEBUG": "true"
    }
    
    if google_client_id:
        backend_env["GOOGLE_CLIENT_ID"] = google_client_id
    if google_client_secret:
        backend_env["GOOGLE_CLIENT_SECRET"] = google_client_secret
    
    backend_env_path = Path("backend/.env")
    if create_env_file(backend_env, backend_env_path):
        print(f"✅ Created {backend_env_path}")
    else:
        return False
    
    # Create frontend .env
    print_header("Creating Frontend Configuration")
    
    frontend_env = {
        "VITE_SUPABASE_URL": supabase_url,
        "VITE_SUPABASE_ANON_KEY": supabase_anon_key,
        "VITE_BACKEND_URL": "http://localhost:8000"
    }
    
    if google_client_id:
        frontend_env["VITE_GOOGLE_CLIENT_ID"] = google_client_id
    
    frontend_env_path = Path("frontend/.env")
    if create_env_file(frontend_env, frontend_env_path):
        print(f"✅ Created {frontend_env_path}")
    else:
        return False
    
    # Next steps
    print_header("Setup Complete!")
    print("✅ Environment files created successfully!")
    print()
    print("📋 Next steps:")
    print("1. Run the database migration:")
    print("   - Go to Supabase SQL Editor")
    print("   - Copy content from backend/migrations/001_initial_schema.sql")
    print("   - Execute the script")
    print()
    print("2. Test the configuration:")
    print("   python test_scripts/quick_test.py")
    print()
    print("3. Start the backend:")
    print("   cd backend && uvicorn main:app --reload")
    print()
    print("4. Start the frontend:")
    print("   cd frontend && npm run dev")
    print()
    print("🔒 Security Notes:")
    print("- Never commit .env files to version control")
    print("- Use different keys for development and production")
    print("- Rotate keys regularly")
    print()
    print("📚 For detailed setup instructions, see SUPABASE_SETUP.md")
    
    return True

if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n❌ Setup cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Setup failed: {e}")
        sys.exit(1) 