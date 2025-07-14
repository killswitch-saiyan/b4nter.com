#!/usr/bin/env python3
"""
B4nter Test Runner
Main script to run all tests including API and Socket.IO tests
"""

import subprocess
import sys
import time
import json
import requests
from typing import Dict, Any, Optional

class B4nterTestRunner:
    def __init__(self, api_url: str = "http://localhost:8000"):
        self.api_url = api_url
        self.test_results = {}
        
    def print_header(self, title: str):
        """Print formatted header"""
        print("\n" + "=" * 60)
        print(f"🚀 {title}")
        print("=" * 60)
        
    def print_result(self, test_name: str, success: bool):
        """Print test result with color coding"""
        status = "✅ PASS" if success else "❌ FAIL"
        color = "\033[92m" if success else "\033[91m"
        reset = "\033[0m"
        print(f"{color}{status}{reset} - {test_name}")
        
    def check_api_health(self) -> bool:
        """Check if API is running and healthy"""
        try:
            response = requests.get(f"{self.api_url}/health", timeout=5)
            return response.status_code == 200 and response.json().get("status") == "healthy"
        except:
            return False
            
    def run_api_tests(self) -> Dict[str, Any]:
        """Run API tests and return results"""
        self.print_header("Running API Tests")
        
        try:
            result = subprocess.run([
                sys.executable, "test_scripts/test_api.py", 
                "--url", self.api_url
            ], capture_output=True, text=True, timeout=60)
            
            success = result.returncode == 0
            self.print_result("API Tests", success)
            
            return {
                "success": success,
                "output": result.stdout,
                "error": result.stderr,
                "return_code": result.returncode
            }
            
        except subprocess.TimeoutExpired:
            self.print_result("API Tests", False)
            return {
                "success": False,
                "output": "",
                "error": "Tests timed out",
                "return_code": -1
            }
        except Exception as e:
            self.print_result("API Tests", False)
            return {
                "success": False,
                "output": "",
                "error": str(e),
                "return_code": -1
            }
            
    def extract_test_data(self, api_output: str) -> Optional[Dict[str, str]]:
        """Extract test data from API test output for Socket.IO tests"""
        try:
            # This is a simplified extraction - in a real scenario, you might want
            # to modify the API test to output structured data
            lines = api_output.split('\n')
            test_data = {}
            
            for line in lines:
                if "user_id" in line and "testuser1" in line:
                    # Extract user1_id
                    pass
                elif "user_id" in line and "testuser2" in line:
                    # Extract user2_id
                    pass
                elif "channel_id" in line and "test-channel" in line:
                    # Extract channel_id
                    pass
                    
            # For now, return None to indicate we need manual data
            return None
            
        except Exception as e:
            print(f"Error extracting test data: {e}")
            return None
            
    def run_socket_tests(self, test_data: Dict[str, str]) -> Dict[str, Any]:
        """Run Socket.IO tests with provided test data"""
        self.print_header("Running Socket.IO Tests")
        
        if not test_data:
            self.print_result("Socket.IO Tests", False)
            return {
                "success": False,
                "output": "",
                "error": "No test data provided",
                "return_code": -1
            }
            
        try:
            result = subprocess.run([
                sys.executable, "test_scripts/test_socket.py",
                "--url", self.api_url,
                "--channel-id", test_data["channel_id"],
                "--user1-id", test_data["user1_id"],
                "--user2-id", test_data["user2_id"]
            ], capture_output=True, text=True, timeout=60)
            
            success = result.returncode == 0
            self.print_result("Socket.IO Tests", success)
            
            return {
                "success": success,
                "output": result.stdout,
                "error": result.stderr,
                "return_code": result.returncode
            }
            
        except subprocess.TimeoutExpired:
            self.print_result("Socket.IO Tests", False)
            return {
                "success": False,
                "output": "",
                "error": "Tests timed out",
                "return_code": -1
            }
        except Exception as e:
            self.print_result("Socket.IO Tests", False)
            return {
                "success": False,
                "output": "",
                "error": str(e),
                "return_code": -1
            }
            
    def run_manual_socket_test(self) -> Dict[str, Any]:
        """Run Socket.IO tests with manual data input"""
        self.print_header("Manual Socket.IO Test Setup")
        
        print("To run Socket.IO tests, you need to provide test data from the API tests.")
        print("Please run the API tests first and note the following:")
        print("- Channel ID")
        print("- User 1 ID")
        print("- User 2 ID")
        
        try:
            channel_id = input("Enter Channel ID: ").strip()
            user1_id = input("Enter User 1 ID: ").strip()
            user2_id = input("Enter User 2 ID: ").strip()
            
            if not all([channel_id, user1_id, user2_id]):
                print("❌ All fields are required")
                return {"success": False, "error": "Missing test data"}
                
            test_data = {
                "channel_id": channel_id,
                "user1_id": user1_id,
                "user2_id": user2_id
            }
            
            return self.run_socket_tests(test_data)
            
        except KeyboardInterrupt:
            print("\n❌ Test cancelled by user")
            return {"success": False, "error": "Cancelled by user"}
            
    def generate_test_report(self, api_results: Dict[str, Any], socket_results: Dict[str, Any]):
        """Generate a comprehensive test report"""
        self.print_header("Test Report")
        
        total_tests = 2
        passed_tests = 0
        
        if api_results["success"]:
            passed_tests += 1
        if socket_results["success"]:
            passed_tests += 1
            
        print(f"📊 Overall Results: {passed_tests}/{total_tests} test suites passed")
        print()
        
        # API Test Results
        print("🔗 API Tests:")
        self.print_result("  - HTTP Endpoints", api_results["success"])
        if not api_results["success"] and api_results["error"]:
            print(f"    Error: {api_results['error']}")
            
        # Socket.IO Test Results
        print("🔌 Socket.IO Tests:")
        self.print_result("  - Real-time Messaging", socket_results["success"])
        if not socket_results["success"] and socket_results["error"]:
            print(f"    Error: {socket_results['error']}")
            
        print()
        if passed_tests == total_tests:
            print("🎉 All test suites passed! B4nter is working correctly.")
        else:
            print("⚠️  Some test suites failed. Please check the implementation.")
            
        return passed_tests == total_tests
        
    def run_all_tests(self) -> bool:
        """Run all tests and generate report"""
        print("🏈 B4nter Test Suite")
        print("Testing all features: User creation, login, direct messaging, and channel messaging")
        
        # Check if API is running
        if not self.check_api_health():
            print("❌ API is not running or not healthy")
            print("Please start the backend server first:")
            print("cd backend && uvicorn main:app --reload")
            return False
            
        # Run API tests
        api_results = self.run_api_tests()
        
        # Run Socket.IO tests (manual mode for now)
        socket_results = self.run_manual_socket_test()
        
        # Generate report
        return self.generate_test_report(api_results, socket_results)

def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Run B4nter test suite")
    parser.add_argument("--url", default="http://localhost:8000", help="API base URL")
    args = parser.parse_args()
    
    runner = B4nterTestRunner(args.url)
    success = runner.run_all_tests()
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main() 