import requests
import json

def reset_user_password():
    # First, let's try to get the user info to see if they exist
    print("Checking if user exists...")
    
    # Try to register a new user with your email to see the error
    register_url = "http://localhost:8000/auth/register"
    user_data = {
        "username": "naveen",
        "email": "naveen.subramanian17@gmail.com",
        "password": "newpassword123",
        "full_name": "Naveen Subramanian"
    }
    
    try:
        response = requests.post(register_url, json=user_data)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 400 and "already exists" in response.text:
            print("✅ User exists! Now let's create a new user with a different email for testing...")
            
            # Create a new test user with your name
            new_user_data = {
                "username": "naveen_test",
                "email": "naveen.test@example.com",
                "password": "test123",
                "full_name": "Naveen Subramanian"
            }
            
            new_response = requests.post(register_url, json=new_user_data)
            if new_response.status_code == 200:
                result = new_response.json()
                user = result.get('user', {})
                print(f"✅ New test user created successfully!")
                print(f"User ID: {user.get('id')}")
                print(f"Username: {user.get('username')}")
                print(f"Full Name: {user.get('full_name')}")
                print(f"Email: {user.get('email')}")
                
                # Test login
                print("\n--- Testing Login ---")
                login_url = "http://localhost:8000/auth/login"
                login_data = {
                    "email": new_user_data['email'],
                    "password": new_user_data['password']
                }
                
                login_response = requests.post(login_url, json=login_data)
                if login_response.status_code == 200:
                    print("✅ Login successful!")
                    print("Use these credentials:")
                    print(f"Email: {new_user_data['email']}")
                    print(f"Password: {new_user_data['password']}")
                else:
                    print(f"❌ Login failed: {login_response.text}")
                    
        elif response.status_code == 200:
            print("✅ New user created successfully!")
            result = response.json()
            user = result.get('user', {})
            print(f"User ID: {user.get('id')}")
            print(f"Username: {user.get('username')}")
            print(f"Full Name: {user.get('full_name')}")
            print(f"Email: {user.get('email')}")
            print("Use these credentials:")
            print(f"Email: {user_data['email']}")
            print(f"Password: {user_data['password']}")
            
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    reset_user_password() 