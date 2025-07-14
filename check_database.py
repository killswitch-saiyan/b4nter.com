import requests
import json

def check_and_create_channels():
    # First, let's register a test user to get a token
    register_url = "http://localhost:8000/auth/register"
    user_data = {
        "username": "adminuser",
        "email": "admin@example.com",
        "password": "password123",
        "full_name": "Admin User"
    }
    
    try:
        # Register user
        response = requests.post(register_url, json=user_data)
        if response.status_code != 200:
            print(f"Failed to register user: {response.text}")
            return
            
        auth_data = response.json()
        token = auth_data['access_token']
        user_id = auth_data['user']['id']
        
        print(f"User registered successfully: {user_id}")
        
        # Check if channels exist
        channels_url = "http://localhost:8000/channels/"
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.get(channels_url, headers=headers)
        print(f"Channels response: {response.status_code}")
        print(f"Channels: {response.text}")
        
        # Create channels if they don't exist
        channels_to_create = [
            {"name": "general", "description": "General discussion"},
            {"name": "premier-league", "description": "Premier League discussion"},
            {"name": "champions-league", "description": "Champions League discussion"}
        ]
        
        for channel_data in channels_to_create:
            create_url = "http://localhost:8000/channels/"
            response = requests.post(create_url, json=channel_data, headers=headers)
            print(f"Creating channel {channel_data['name']}: {response.status_code}")
            if response.status_code == 200:
                print(f"Channel created: {response.json()}")
            else:
                print(f"Failed to create channel: {response.text}")
                
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    check_and_create_channels() 