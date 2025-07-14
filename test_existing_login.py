import requests
import json

def test_existing_login():
    # Test login with existing user
    login_url = "http://localhost:8000/auth/login"
    login_data = {
        "email": "naveen.subramanian17@gmail.com",
        "password": "password123"  # Try with the password you used
    }
    
    try:
        print("Attempting login...")
        print(f"Email: {login_data['email']}")
        print(f"Password: {login_data['password']}")
        
        response = requests.post(login_url, json=login_data)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            result = response.json()
            user = result.get('user', {})
            print(f"✅ Login successful!")
            print(f"User ID: {user.get('id')}")
            print(f"Username: {user.get('username')}")
            print(f"Full Name: {user.get('full_name')}")
            print(f"Email: {user.get('email')}")
            print(f"Token: {result.get('access_token')[:20]}...")
        else:
            print(f"❌ Login failed: {response.text}")
            
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    test_existing_login() 