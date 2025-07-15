import requests
import json

def join_channels():
    base_url = "http://127.0.0.1:8000"
    
    # First, let's login to get a token
    login_url = f"{base_url}/auth/login"
    login_data = {
        "email": "test@example.com",
        "password": "password123"
    }
    
    try:
        # Login to get token
        print("Logging in...")
        response = requests.post(login_url, json=login_data)
        if response.status_code != 200:
            print(f"Failed to login: {response.text}")
            return
            
        auth_data = response.json()
        token = auth_data['access_token']
        user_id = auth_data['user']['id']
        
        print(f"Logged in successfully as: {auth_data['user']['username']}")
        
        # Get existing channels
        channels_url = f"{base_url}/channels/"
        headers = {"Authorization": f"Bearer {token}"}
        
        print("Getting existing channels...")
        response = requests.get(channels_url, headers=headers)
        print(f"Channels response: {response.status_code}")
        
        if response.status_code == 200:
            channels = response.json()
            print(f"Found {len(channels)} channels:")
            for channel in channels:
                print(f"  - {channel['name']} (ID: {channel['id']})")
        else:
            print(f"Failed to get channels: {response.text}")
            return
        
        # If you want to join channels with a different user, you can:
        # 1. Register a new user
        # 2. Login with that user
        # 3. Join the channels
        
        print("\nTo join channels with a different user:")
        print("1. Register a new user at /auth/register")
        print("2. Login with that user")
        print("3. Use the /channels/{channel_id}/join endpoint")
        
        # Example of joining a channel (uncomment and modify as needed):
        # if channels:
        #     channel_id = channels[0]['id']
        #     join_url = f"{base_url}/channels/{channel_id}/join"
        #     response = requests.post(join_url, headers=headers)
        #     print(f"Joining channel {channels[0]['name']}: {response.status_code}")
        #     if response.status_code == 200:
        #         print("Successfully joined channel!")
        #     else:
        #         print(f"Failed to join: {response.text}")
                
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    join_channels() 