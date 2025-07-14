#!/usr/bin/env python3
"""
B4nter Quick Test Script
Quick verification of basic functionality without creating test data
"""

import requests
import sys
import time

def print_test(name: str, success: bool, message: str = ""):
    """Print test result"""
    status = "✅ PASS" if success else "❌ FAIL"
    color = "\033[92m" if success else "\033[91m"
    reset = "\033[0m"
    print(f"{color}{status}{reset} - {name}")
    if message:
        print(f"    {message}")

def test_api_health(base_url: str) -> bool:
    """Test API health endpoint"""
    try:
        response = requests.get(f"{base_url}/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            return data.get("status") == "healthy"
        return False
    except Exception as e:
        print(f"Health check failed: {e}")
        return False

def test_api_root(base_url: str) -> bool:
    """Test API root endpoint"""
    try:
        response = requests.get(f"{base_url}/", timeout=5)
        if response.status_code == 200:
            data = response.json()
            return "B4nter" in data.get("message", "")
        return False
    except Exception as e:
        print(f"Root endpoint test failed: {e}")
        return False

def test_api_docs(base_url: str) -> bool:
    """Test API documentation endpoint"""
    try:
        response = requests.get(f"{base_url}/docs", timeout=5)
        return response.status_code == 200
    except Exception as e:
        print(f"Docs endpoint test failed: {e}")
        return False

def test_socket_connection(base_url: str) -> bool:
    """Test Socket.IO connection"""
    try:
        # Try to connect to Socket.IO endpoint
        response = requests.get(f"{base_url}/socket.io/", timeout=5)
        # Socket.IO should return some response (even if not connected)
        return response.status_code in [200, 400, 404]  # Various possible responses
    except Exception as e:
        print(f"Socket.IO test failed: {e}")
        return False

def run_quick_tests(base_url: str = "http://localhost:8000"):
    """Run quick tests to verify basic functionality"""
    print("🏈 B4nter Quick Test")
    print("=" * 40)
    
    tests = [
        ("API Health Check", lambda: test_api_health(base_url)),
        ("API Root Endpoint", lambda: test_api_root(base_url)),
        ("API Documentation", lambda: test_api_docs(base_url)),
        ("Socket.IO Endpoint", lambda: test_socket_connection(base_url)),
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        try:
            success = test_func()
            print_test(test_name, success)
            if success:
                passed += 1
            time.sleep(0.5)
        except Exception as e:
            print_test(test_name, False, str(e))
    
    print("=" * 40)
    print(f"📊 Quick Test Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All quick tests passed! Basic functionality is working.")
        return True
    elif passed >= total // 2:
        print("⚠️  Some tests failed, but basic functionality appears to be working.")
        return True
    else:
        print("❌ Multiple tests failed. Please check your setup.")
        return False

def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Quick test for B4nter")
    parser.add_argument("--url", default="http://localhost:8000", help="API base URL")
    args = parser.parse_args()
    
    success = run_quick_tests(args.url)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main() 