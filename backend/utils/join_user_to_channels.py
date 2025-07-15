import requests
import json

def join_user_to_channels(email, password):
    base_url = "http://127.0.0.1:8000"
    
    # First, login to get a token
    login_url = f"{base_url}/auth/login"
    login_data = {
        "email": email,
        "password": password
    }
    
    try:
        # Login to get token
        print(f"Logging in as {email}...")
        response = requests.post(login_url, json=login_data)
        if response.status_code != 200:
            print(f"Failed to login: {response.text}")
            return
            
        auth_data = response.json()
        token = auth_data['access_token']
        user_id = auth_data['user']['id']
        
        print(f"Logged in successfully as: {auth_data['user']['username']}")
        
        # Get existing channels (using test user to see all channels)
        test_login_data = {
            "email": "test@example.com",
            "password": "password123"
        }
        test_response = requests.post(login_url, json=test_login_data)
        test_token = test_response.json()['access_token']
        
        channels_url = f"{base_url}/channels/"
        test_headers = {"Authorization": f"Bearer {test_token}"}
        
        response = requests.get(channels_url, headers=test_headers)
        if response.status_code == 200:
            channels = response.json()
            print(f"Found {len(channels)} channels to join:")
            
            # Join each channel with the current user
            user_headers = {"Authorization": f"Bearer {token}"}
            for channel in channels:
                join_url = f"{base_url}/channels/{channel['id']}/join"
                join_response = requests.post(join_url, headers=user_headers)
                if join_response.status_code == 200:
                    print(f"  ✓ Joined {channel['name']}")
                elif join_response.status_code == 400 and "Already a member" in join_response.text:
                    print(f"  - Already a member of {channel['name']}")
                else:
                    print(f"  ✗ Failed to join {channel['name']}: {join_response.text}")
            
            print(f"\nUser {email} should now be able to see and send messages in all channels!")
            
        else:
            print(f"Failed to get channels: {response.text}")
                
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    # Replace with your email and password
    email = input("Enter your email: ")
    password = input("Enter your password: ")
    join_user_to_channels(email, password) 