import requests
import json
import time

def test_registration():
    # Generate a unique email using timestamp
    timestamp = int(time.time())
    email = f"test{timestamp}@example.com"
    
    register_url = "http://localhost:8000/auth/register"
    user_data = {
        "username": f"testuser{timestamp}",
        "email": email,
        "password": "test123",
        "full_name": "Test User"
    }
    
    try:
        print("Testing registration with unique credentials...")
        print(f"Username: {user_data['username']}")
        print(f"Email: {user_data['email']}")
        print(f"Password: {user_data['password']}")
        print(f"Full Name: {user_data['full_name']}")
        
        response = requests.post(register_url, json=user_data)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            result = response.json()
            user = result.get('user', {})
            print(f"✅ Registration successful!")
            print(f"User ID: {user.get('id')}")
            print(f"Username: {user.get('username')}")
            print(f"Full Name: {user.get('full_name')}")
            print(f"Email: {user.get('email')}")
            
            # Test login immediately
            print("\n--- Testing Login ---")
            login_url = "http://localhost:8000/auth/login"
            login_data = {
                "email": user_data['email'],
                "password": user_data['password']
            }
            
            login_response = requests.post(login_url, json=login_data)
            if login_response.status_code == 200:
                print("✅ Login successful!")
                print("Use these credentials in the frontend:")
                print(f"Email: {user_data['email']}")
                print(f"Password: {user_data['password']}")
            else:
                print(f"❌ Login failed: {login_response.text}")
                
        else:
            print(f"❌ Registration failed: {response.text}")
            
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    test_registration() 