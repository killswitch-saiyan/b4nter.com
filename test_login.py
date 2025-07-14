import requests
import json

def test_login():
    # First register a user
    register_url = "http://localhost:8000/auth/register"
    user_data = {
        "username": "logintest",
        "email": "logintest@example.com",
        "password": "password123",
        "full_name": "Login Test User"
    }
    
    try:
        # Register user
        response = requests.post(register_url, json=user_data)
        if response.status_code != 200:
            print(f"Failed to register user: {response.text}")
            return
            
        print("User registered successfully")
        
        # Now login with the same credentials
        login_url = "http://localhost:8000/auth/login"
        login_data = {
            "email": "logintest@example.com",
            "password": "password123"
        }
        
        response = requests.post(login_url, json=login_data)
        print(f"Login Status Code: {response.status_code}")
        print(f"Login Response: {response.text}")
        
        if response.status_code == 200:
            result = response.json()
            user = result.get('user', {})
            print(f"Login successful!")
            print(f"User ID: {user.get('id')}")
            print(f"Username: {user.get('username')}")
            print(f"Full Name: {user.get('full_name')}")
            print(f"Email: {user.get('email')}")
            print(f"Created At: {user.get('created_at')}")
            print(f"Updated At: {user.get('updated_at')}")
            print(f"Token: {result.get('access_token')[:20]}...")
        else:
            print(f"Login failed: {response.text}")
            
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    test_login() 