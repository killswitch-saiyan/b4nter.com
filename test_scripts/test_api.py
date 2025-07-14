#!/usr/bin/env python3
"""
B4nter API Test Script
Tests all core features: user creation, login, direct messaging, and channel messaging
"""

import requests
import json
import time
import sys
from typing import Dict, Any

class B4nterAPITester:
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.session = requests.Session()
        self.users = {}
        self.channels = {}
        self.messages = {}
        
    def print_test(self, test_name: str, status: str = "RUNNING"):
        """Print test status with color coding"""
        colors = {
            "RUNNING": "\033[94m",  # Blue
            "PASS": "\033[92m",     # Green
            "FAIL": "\033[91m",     # Red
            "RESET": "\033[0m"      # Reset
        }
        print(f"{colors.get(status, '')}[{status}] {test_name}{colors['RESET']}")
        
    def make_request(self, method: str, endpoint: str, data: Dict = None, headers: Dict = None) -> Dict:
        """Make HTTP request and handle response"""
        url = f"{self.base_url}{endpoint}"
        
        try:
            if method.upper() == "GET":
                response = self.session.get(url, headers=headers)
            elif method.upper() == "POST":
                response = self.session.post(url, json=data, headers=headers)
            elif method.upper() == "DELETE":
                response = self.session.delete(url, headers=headers)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            response.raise_for_status()
            return response.json() if response.content else {}
            
        except requests.exceptions.RequestException as e:
            print(f"Request failed: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"Response: {e.response.text}")
            return None
            
    def test_health_check(self) -> bool:
        """Test API health endpoint"""
        self.print_test("Health Check")
        
        result = self.make_request("GET", "/health")
        if result and result.get("status") == "healthy":
            self.print_test("Health Check", "PASS")
            return True
        else:
            self.print_test("Health Check", "FAIL")
            return False
            
    def test_user_registration(self) -> bool:
        """Test user registration for two users"""
        self.print_test("User Registration")
        
        # Test user 1 registration
        user1_data = {
            "username": "testuser1",
            "email": "testuser1@b4nter.com",
            "password": "password123",
            "full_name": "Test User One"
        }
        
        result1 = self.make_request("POST", "/auth/register", user1_data)
        if not result1 or "access_token" not in result1:
            self.print_test("User Registration", "FAIL")
            return False
            
        self.users["user1"] = {
            "data": user1_data,
            "token": result1["access_token"],
            "user_id": result1["user"]["id"]
        }
        
        # Test user 2 registration
        user2_data = {
            "username": "testuser2",
            "email": "testuser2@b4nter.com",
            "password": "password123",
            "full_name": "Test User Two"
        }
        
        result2 = self.make_request("POST", "/auth/register", user2_data)
        if not result2 or "access_token" not in result2:
            self.print_test("User Registration", "FAIL")
            return False
            
        self.users["user2"] = {
            "data": user2_data,
            "token": result2["access_token"],
            "user_id": result2["user"]["id"]
        }
        
        self.print_test("User Registration", "PASS")
        return True
        
    def test_user_login(self) -> bool:
        """Test user login"""
        self.print_test("User Login")
        
        # Test user 1 login
        login_data1 = {
            "email": "testuser1@b4nter.com",
            "password": "password123"
        }
        
        result1 = self.make_request("POST", "/auth/login", login_data1)
        if not result1 or "access_token" not in result1:
            self.print_test("User Login", "FAIL")
            return False
            
        # Test user 2 login
        login_data2 = {
            "email": "testuser2@b4nter.com",
            "password": "password123"
        }
        
        result2 = self.make_request("POST", "/auth/login", login_data2)
        if not result2 or "access_token" not in result2:
            self.print_test("User Login", "FAIL")
            return False
            
        self.print_test("User Login", "PASS")
        return True
        
    def test_get_current_user(self) -> bool:
        """Test getting current user information"""
        self.print_test("Get Current User")
        
        headers = {"Authorization": f"Bearer {self.users['user1']['token']}"}
        result = self.make_request("GET", "/auth/me", headers=headers)
        
        if result and result.get("email") == "testuser1@b4nter.com":
            self.print_test("Get Current User", "PASS")
            return True
        else:
            self.print_test("Get Current User", "FAIL")
            return False
            
    def test_create_channel(self) -> bool:
        """Test channel creation"""
        self.print_test("Create Channel")
        
        channel_data = {
            "name": "test-channel",
            "description": "Test channel for B4nter",
            "is_private": False
        }
        
        headers = {"Authorization": f"Bearer {self.users['user1']['token']}"}
        result = self.make_request("POST", "/channels/", channel_data, headers)
        
        if result and "id" in result:
            self.channels["test_channel"] = result
            self.print_test("Create Channel", "PASS")
            return True
        else:
            self.print_test("Create Channel", "FAIL")
            return False
            
    def test_join_channel(self) -> bool:
        """Test joining a channel"""
        self.print_test("Join Channel")
        
        channel_id = self.channels["test_channel"]["id"]
        headers = {"Authorization": f"Bearer {self.users['user2']['token']}"}
        result = self.make_request("POST", f"/channels/{channel_id}/join", headers=headers)
        
        if result and "message" in result:
            self.print_test("Join Channel", "PASS")
            return True
        else:
            self.print_test("Join Channel", "FAIL")
            return False
            
    def test_get_user_channels(self) -> bool:
        """Test getting user channels"""
        self.print_test("Get User Channels")
        
        headers = {"Authorization": f"Bearer {self.users['user1']['token']}"}
        result = self.make_request("GET", "/channels/", headers=headers)
        
        if result and isinstance(result, list) and len(result) > 0:
            self.print_test("Get User Channels", "PASS")
            return True
        else:
            self.print_test("Get User Channels", "FAIL")
            return False
            
    def test_send_channel_message(self) -> bool:
        """Test sending a message to a channel"""
        self.print_test("Send Channel Message")
        
        channel_id = self.channels["test_channel"]["id"]
        message_data = {
            "content": "Hello from test user 1! This is a test message in the channel.",
            "channel_id": channel_id
        }
        
        headers = {"Authorization": f"Bearer {self.users['user1']['token']}"}
        result = self.make_request("POST", "/messages/", message_data, headers)
        
        if result and "id" in result and result["content"] == message_data["content"]:
            self.messages["channel_message"] = result
            self.print_test("Send Channel Message", "PASS")
            return True
        else:
            self.print_test("Send Channel Message", "FAIL")
            return False
            
    def test_get_channel_messages(self) -> bool:
        """Test getting channel messages"""
        self.print_test("Get Channel Messages")
        
        channel_id = self.channels["test_channel"]["id"]
        headers = {"Authorization": f"Bearer {self.users['user1']['token']}"}
        result = self.make_request("GET", f"/messages/channel/{channel_id}", headers=headers)
        
        if result and isinstance(result, list) and len(result) > 0:
            self.print_test("Get Channel Messages", "PASS")
            return True
        else:
            self.print_test("Get Channel Messages", "FAIL")
            return False
            
    def test_send_direct_message(self) -> bool:
        """Test sending a direct message between users"""
        self.print_test("Send Direct Message")
        
        # User 1 sends message to User 2
        message_data = {
            "content": "Hello User 2! This is a direct message from User 1.",
            "recipient_id": self.users["user2"]["user_id"]
        }
        
        headers = {"Authorization": f"Bearer {self.users['user1']['token']}"}
        result = self.make_request("POST", "/messages/", message_data, headers)
        
        if result and "id" in result and result["content"] == message_data["content"]:
            self.messages["direct_message"] = result
            self.print_test("Send Direct Message", "PASS")
            return True
        else:
            self.print_test("Send Direct Message", "FAIL")
            return False
            
    def test_get_direct_messages(self) -> bool:
        """Test getting direct messages between users"""
        self.print_test("Get Direct Messages")
        
        # User 2 gets direct messages with User 1
        user1_id = self.users["user1"]["user_id"]
        headers = {"Authorization": f"Bearer {self.users['user2']['token']}"}
        result = self.make_request("GET", f"/messages/direct/{user1_id}", headers=headers)
        
        if result and isinstance(result, list) and len(result) > 0:
            self.print_test("Get Direct Messages", "PASS")
            return True
        else:
            self.print_test("Get Direct Messages", "FAIL")
            return False
            
    def test_get_users_for_dm(self) -> bool:
        """Test getting users for direct messaging"""
        self.print_test("Get Users for DM")
        
        headers = {"Authorization": f"Bearer {self.users['user1']['token']}"}
        result = self.make_request("GET", "/messages/users", headers=headers)
        
        if result and isinstance(result, list) and len(result) > 0:
            self.print_test("Get Users for DM", "PASS")
            return True
        else:
            self.print_test("Get Users for DM", "FAIL")
            return False
            
    def test_channel_members(self) -> bool:
        """Test getting channel members"""
        self.print_test("Get Channel Members")
        
        channel_id = self.channels["test_channel"]["id"]
        headers = {"Authorization": f"Bearer {self.users['user1']['token']}"}
        result = self.make_request("GET", f"/channels/{channel_id}/members", headers=headers)
        
        if result and isinstance(result, list) and len(result) > 0:
            self.print_test("Get Channel Members", "PASS")
            return True
        else:
            self.print_test("Get Channel Members", "FAIL")
            return False
            
    def run_all_tests(self) -> bool:
        """Run all tests in sequence"""
        print("🚀 Starting B4nter API Tests")
        print("=" * 50)
        
        tests = [
            self.test_health_check,
            self.test_user_registration,
            self.test_user_login,
            self.test_get_current_user,
            self.test_create_channel,
            self.test_join_channel,
            self.test_get_user_channels,
            self.test_send_channel_message,
            self.test_get_channel_messages,
            self.test_send_direct_message,
            self.test_get_direct_messages,
            self.test_get_users_for_dm,
            self.test_channel_members,
        ]
        
        passed = 0
        total = len(tests)
        
        for test in tests:
            try:
                if test():
                    passed += 1
                time.sleep(0.5)  # Small delay between tests
            except Exception as e:
                print(f"Test failed with exception: {e}")
                
        print("=" * 50)
        print(f"📊 Test Results: {passed}/{total} tests passed")
        
        if passed == total:
            print("🎉 All tests passed! B4nter API is working correctly.")
            return True
        else:
            print("❌ Some tests failed. Please check the API implementation.")
            return False

def main():
    """Main function to run tests"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Test B4nter API")
    parser.add_argument("--url", default="http://localhost:8000", help="API base URL")
    args = parser.parse_args()
    
    tester = B4nterAPITester(args.url)
    success = tester.run_all_tests()
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main() 