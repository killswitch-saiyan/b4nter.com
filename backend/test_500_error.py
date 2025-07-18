#!/usr/bin/env python3
"""
Test script to identify 500 error causes
"""

import asyncio
import json
import logging
import httpx
from database import db

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_endpoint(client, url, method="GET", data=None, headers=None):
    """Test a single endpoint"""
    try:
        if headers is None:
            headers = {"Content-Type": "application/json"}
        
        if method == "GET":
            response = await client.get(url, headers=headers)
            return {
                "url": url,
                "method": method,
                "status": response.status_code,
                "text": response.text,
                "success": response.status_code < 400
            }
        elif method == "POST":
            response = await client.post(url, json=data, headers=headers)
            return {
                "url": url,
                "method": method,
                "status": response.status_code,
                "text": response.text,
                "success": response.status_code < 400
            }
    except Exception as e:
        return {
            "url": url,
            "method": method,
            "status": "ERROR",
            "text": str(e),
            "success": False
        }

async def test_database_operations():
    """Test database operations directly"""
    logger.info("Testing database operations...")
    
    try:
        # Test getting all users
        users = await db.get_all_users()
        logger.info(f"✅ Database: get_all_users - {len(users) if users else 0} users")
        
        # Test getting user by email
        user = await db.get_user_by_email("admin@b4nter.com")
        logger.info(f"✅ Database: get_user_by_email - {'Found' if user else 'Not found'}")
        
        # Test creating a user (will fail if user exists, which is expected)
        test_user_data = {
            "username": "test_500_debug",
            "email": "test_500_debug@example.com",
            "full_name": "Test 500 Debug",
            "password_hash": "test_hash",
            "public_key": "test_public_key"
        }
        
        try:
            new_user = await db.create_user(test_user_data)
            if new_user:
                logger.info(f"✅ Database: create_user - Success, ID: {new_user.get('id')}")
                # Note: We don't have a delete_user method, so we'll just log the success
                logger.info("✅ Database: Test user created successfully")
            else:
                logger.info("⚠️ Database: create_user - Failed (user might already exist)")
        except Exception as e:
            logger.info(f"⚠️ Database: create_user - Expected error: {e}")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Database operations failed: {e}")
        return False

async def test_api_endpoints():
    """Test API endpoints"""
    logger.info("Testing API endpoints...")
    
    base_url = "http://localhost:8000"
    
    try:
        async with httpx.AsyncClient() as client:
            endpoints = [
                ("/", "GET"),
                ("/health", "GET"),
                ("/health/database", "GET"),
                ("/health/auth", "GET"),
                ("/docs", "GET"),
                ("/auth/register", "POST", {
                    "username": "test_api_user",
                    "email": "test_api@example.com",
                    "password": "testpassword123",
                    "full_name": "Test API User"
                }),
                ("/auth/login", "POST", {
                    "email": "admin@b4nter.com",
                    "password": "password123"
                }),
            ]
            
            results = []
            
            for endpoint in endpoints:
                url = base_url + endpoint[0]
                method = endpoint[1]
                data = endpoint[2] if len(endpoint) > 2 else None
                
                logger.info(f"Testing {method} {url}")
                result = await test_endpoint(client, url, method, data)
                results.append(result)
                
                if result["success"]:
                    logger.info(f"✅ {method} {url} - {result['status']}")
                else:
                    logger.error(f"❌ {method} {url} - {result['status']}: {result['text']}")
            
            return results
    except Exception as e:
        logger.error(f"❌ API endpoint testing failed: {e}")
        return []

async def main():
    """Main test function"""
    logger.info("🚀 Starting 500 error diagnostic tests...")
    
    # Test database operations
    db_ok = await test_database_operations()
    
    # Test API endpoints
    api_results = await test_api_endpoints()
    
    # Summary
    logger.info("\n" + "="*50)
    logger.info("📊 TEST SUMMARY")
    logger.info("="*50)
    
    logger.info(f"Database Operations: {'✅ PASS' if db_ok else '❌ FAIL'}")
    
    if api_results:
        successful_apis = [r for r in api_results if r["success"]]
        failed_apis = [r for r in api_results if not r["success"]]
        
        logger.info(f"API Endpoints: {len(successful_apis)}/{len(api_results)} successful")
        
        if failed_apis:
            logger.info("\n❌ FAILED ENDPOINTS:")
            for api in failed_apis:
                logger.info(f"  {api['method']} {api['url']} - {api['status']}: {api['text'][:100]}...")
        
        if db_ok and len(successful_apis) == len(api_results):
            logger.info("\n🎉 All tests passed! The 500 error might be frontend-specific.")
        else:
            logger.info("\n⚠️ Some tests failed. Check the logs above for details.")
    else:
        logger.info("❌ No API results available")

if __name__ == "__main__":
    asyncio.run(main()) 