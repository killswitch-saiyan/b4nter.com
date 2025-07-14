import requests
import json

def create_new_user():
    # Register a new user with simple credentials
    register_url = "http://localhost:8000/auth/register"
    user_data = {
        "username": "testuser2024",
        "email": "testuser2024@example.com",
        "password": "test123",
        "full_name": "Test User 2024"
    }
    
    try:
        print("Creating new user...")
        print(f"Username: {user_data['username']}")
        print(f"Email: {user_data['email']}")
        print(f"Password: {user_data['password']}")
        
        response = requests.post(register_url, json=user_data)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            result = response.json()
            user = result.get('user', {})
            print(f"✅ User created successfully!")
            print(f"User ID: {user.get('id')}")
            print(f"Username: {user.get('username')}")
            print(f"Full Name: {user.get('full_name')}")
            print(f"Email: {user.get('email')}")
            print(f"Token: {result.get('access_token')[:20]}...")
            
            # Now test login with the same credentials
            print("\n--- Testing Login ---")
            login_url = "http://localhost:8000/auth/login"
            login_data = {
                "email": user_data['email'],
                "password": user_data['password']
            }
            
            login_response = requests.post(login_url, json=login_data)
            print(f"Login Status Code: {login_response.status_code}")
            print(f"Login Response: {login_response.text}")
            
            if login_response.status_code == 200:
                print("✅ Login test successful!")
            else:
                print("❌ Login test failed!")
                
        else:
            print(f"❌ User creation failed: {response.text}")
            
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    create_new_user() 