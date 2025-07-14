#!/usr/bin/env python3
"""
B4nter Socket.IO Test Script
Tests real-time messaging features including Socket.IO connections
"""

import socketio
import time
import json
import sys
from typing import Dict, Any, Optional

class B4nterSocketTester:
    def __init__(self, server_url: str = "http://localhost:8000"):
        self.server_url = server_url
        self.sio = socketio.Client()
        self.test_results = {}
        self.messages_received = []
        
    def print_test(self, test_name: str, status: str = "RUNNING"):
        """Print test status with color coding"""
        colors = {
            "RUNNING": "\033[94m",  # Blue
            "PASS": "\033[92m",     # Green
            "FAIL": "\033[91m",     # Red
            "RESET": "\033[0m"      # Reset
        }
        print(f"{colors.get(status, '')}[{status}] {test_name}{colors['RESET']}")
        
    def setup_socket_events(self):
        """Setup Socket.IO event handlers"""
        
        @self.sio.event
        def connect():
            print("✅ Connected to Socket.IO server")
            
        @self.sio.event
        def disconnect():
            print("❌ Disconnected from Socket.IO server")
            
        @self.sio.event
        def connect_error(data):
            print(f"❌ Socket connection error: {data}")
            
        @self.sio.on('new_channel_message')
        def on_channel_message(data):
            print(f"📨 Received channel message: {data}")
            self.messages_received.append({
                'type': 'channel',
                'data': data
            })
            
        @self.sio.on('new_direct_message')
        def on_direct_message(data):
            print(f"💬 Received direct message: {data}")
            self.messages_received.append({
                'type': 'direct',
                'data': data
            })
            
        @self.sio.on('user_typing')
        def on_user_typing(data):
            print(f"⌨️  User typing: {data}")
            
        @self.sio.on('user_stopped_typing')
        def on_user_stopped_typing(data):
            print(f"⏹️  User stopped typing: {data}")
            
    def test_socket_connection(self) -> bool:
        """Test basic Socket.IO connection"""
        self.print_test("Socket.IO Connection")
        
        try:
            self.sio.connect(self.server_url, auth={'user_id': 'test-user'})
            time.sleep(1)
            
            if self.sio.connected:
                self.print_test("Socket.IO Connection", "PASS")
                return True
            else:
                self.print_test("Socket.IO Connection", "FAIL")
                return False
                
        except Exception as e:
            print(f"Connection failed: {e}")
            self.print_test("Socket.IO Connection", "FAIL")
            return False
            
    def test_join_channel_socket(self, channel_id: str, user_id: str) -> bool:
        """Test joining a channel via Socket.IO"""
        self.print_test("Join Channel Socket")
        
        try:
            self.sio.emit('join_channel', {
                'channel_id': channel_id,
                'user_id': user_id
            })
            time.sleep(1)
            self.print_test("Join Channel Socket", "PASS")
            return True
            
        except Exception as e:
            print(f"Join channel failed: {e}")
            self.print_test("Join Channel Socket", "FAIL")
            return False
            
    def test_send_channel_message_socket(self, content: str, channel_id: str, user_id: str) -> bool:
        """Test sending a channel message via Socket.IO"""
        self.print_test("Send Channel Message Socket")
        
        try:
            self.sio.emit('send_message', {
                'content': content,
                'sender_id': user_id,
                'channel_id': channel_id
            })
            time.sleep(2)  # Wait for message processing
            
            # Check if message was received
            channel_messages = [msg for msg in self.messages_received if msg['type'] == 'channel']
            if channel_messages:
                self.print_test("Send Channel Message Socket", "PASS")
                return True
            else:
                self.print_test("Send Channel Message Socket", "FAIL")
                return False
                
        except Exception as e:
            print(f"Send channel message failed: {e}")
            self.print_test("Send Channel Message Socket", "FAIL")
            return False
            
    def test_send_direct_message_socket(self, content: str, recipient_id: str, sender_id: str) -> bool:
        """Test sending a direct message via Socket.IO"""
        self.print_test("Send Direct Message Socket")
        
        try:
            self.sio.emit('send_message', {
                'content': content,
                'sender_id': sender_id,
                'recipient_id': recipient_id
            })
            time.sleep(2)  # Wait for message processing
            
            # Check if message was received
            direct_messages = [msg for msg in self.messages_received if msg['type'] == 'direct']
            if direct_messages:
                self.print_test("Send Direct Message Socket", "PASS")
                return True
            else:
                self.print_test("Send Direct Message Socket", "FAIL")
                return False
                
        except Exception as e:
            print(f"Send direct message failed: {e}")
            self.print_test("Send Direct Message Socket", "FAIL")
            return False
            
    def test_typing_indicators(self, channel_id: str, user_id: str) -> bool:
        """Test typing indicators"""
        self.print_test("Typing Indicators")
        
        try:
            # Start typing
            self.sio.emit('typing_start', {
                'user_id': user_id,
                'channel_id': channel_id
            })
            time.sleep(1)
            
            # Stop typing
            self.sio.emit('typing_stop', {
                'user_id': user_id,
                'channel_id': channel_id
            })
            time.sleep(1)
            
            self.print_test("Typing Indicators", "PASS")
            return True
            
        except Exception as e:
            print(f"Typing indicators failed: {e}")
            self.print_test("Typing Indicators", "FAIL")
            return False
            
    def test_leave_channel_socket(self, channel_id: str, user_id: str) -> bool:
        """Test leaving a channel via Socket.IO"""
        self.print_test("Leave Channel Socket")
        
        try:
            self.sio.emit('leave_channel', {
                'channel_id': channel_id,
                'user_id': user_id
            })
            time.sleep(1)
            self.print_test("Leave Channel Socket", "PASS")
            return True
            
        except Exception as e:
            print(f"Leave channel failed: {e}")
            self.print_test("Leave Channel Socket", "FAIL")
            return False
            
    def run_socket_tests(self, test_data: Dict[str, Any]) -> bool:
        """Run all Socket.IO tests"""
        print("🔌 Starting B4nter Socket.IO Tests")
        print("=" * 50)
        
        # Setup socket events
        self.setup_socket_events()
        
        # Test connection
        if not self.test_socket_connection():
            return False
            
        # Get test data
        channel_id = test_data.get('channel_id')
        user1_id = test_data.get('user1_id')
        user2_id = test_data.get('user2_id')
        
        if not all([channel_id, user1_id, user2_id]):
            print("❌ Missing test data for Socket.IO tests")
            return False
            
        tests = [
            lambda: self.test_join_channel_socket(channel_id, user1_id),
            lambda: self.test_send_channel_message_socket(
                "Hello from Socket.IO! This is a test channel message.", 
                channel_id, 
                user1_id
            ),
            lambda: self.test_send_direct_message_socket(
                "Hello from Socket.IO! This is a test direct message.",
                user2_id,
                user1_id
            ),
            lambda: self.test_typing_indicators(channel_id, user1_id),
            lambda: self.test_leave_channel_socket(channel_id, user1_id),
        ]
        
        passed = 0
        total = len(tests)
        
        for test in tests:
            try:
                if test():
                    passed += 1
                time.sleep(1)  # Delay between tests
            except Exception as e:
                print(f"Socket test failed with exception: {e}")
                
        # Disconnect
        if self.sio.connected:
            self.sio.disconnect()
            
        print("=" * 50)
        print(f"📊 Socket Test Results: {passed}/{total} tests passed")
        
        if passed == total:
            print("🎉 All Socket.IO tests passed!")
            return True
        else:
            print("❌ Some Socket.IO tests failed.")
            return False

def main():
    """Main function to run Socket.IO tests"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Test B4nter Socket.IO")
    parser.add_argument("--url", default="http://localhost:8000", help="Socket.IO server URL")
    parser.add_argument("--channel-id", required=True, help="Channel ID for testing")
    parser.add_argument("--user1-id", required=True, help="User 1 ID for testing")
    parser.add_argument("--user2-id", required=True, help="User 2 ID for testing")
    args = parser.parse_args()
    
    test_data = {
        'channel_id': args.channel_id,
        'user1_id': args.user1_id,
        'user2_id': args.user2_id
    }
    
    tester = B4nterSocketTester(args.url)
    success = tester.run_socket_tests(test_data)
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main() 