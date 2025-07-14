import requests
import json

# Test user registration
def test_registration():
    url = "http://localhost:8000/auth/register"
    data = {
        "username": "testuser123",
        "email": "test123@example.com",
        "password": "password123",
        "full_name": "Test User 123"
    }
    
    try:
        response = requests.post(url, json=data)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"User ID: {result.get('user', {}).get('id')}")
            print(f"Username: {result.get('user', {}).get('username')}")
            print(f"Full Name: {result.get('user', {}).get('full_name')}")
            print(f"Email: {result.get('user', {}).get('email')}")
            print(f"Token: {result.get('access_token')[:20]}...")
        else:
            print(f"Error: {response.text}")
            
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    test_registration() 