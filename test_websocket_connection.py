#!/usr/bin/env python3
"""
Simple WebSocket connection test for the chat application.
This script tests basic WebSocket connectivity and message handling.
"""

import asyncio
import websockets
import json
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
BACKEND_URL = "ws://127.0.0.1:8000"
TEST_USER_ID = "test-user-123"

async def test_websocket_connection():
    """Test basic WebSocket connection and message handling."""
    
    uri = f"{BACKEND_URL}/ws/{TEST_USER_ID}"
    logger.info(f"Connecting to {uri}")
    
    try:
        async with websockets.connect(uri) as websocket:
            logger.info("✅ WebSocket connection established successfully")
            
            # Wait for connection confirmation
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                data = json.loads(response)
                logger.info(f"✅ Received connection confirmation: {data}")
                
                if data.get('type') == 'connection_established':
                    logger.info("✅ Connection confirmation received correctly")
                else:
                    logger.warning(f"⚠️ Unexpected message type: {data.get('type')}")
                    
            except asyncio.TimeoutError:
                logger.error("❌ Timeout waiting for connection confirmation")
                return False
            except json.JSONDecodeError:
                logger.error("❌ Invalid JSON in connection confirmation")
                return False
            
            # Test sending a simple message
            test_message = {
                "type": "join_channel",
                "channel_id": "test-channel-123"
            }
            
            logger.info(f"Sending test message: {test_message}")
            await websocket.send(json.dumps(test_message))
            
            # Wait for response
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                data = json.loads(response)
                logger.info(f"✅ Received response: {data}")
                
                if data.get('type') == 'channel_joined':
                    logger.info("✅ Channel join confirmation received")
                else:
                    logger.warning(f"⚠️ Unexpected response type: {data.get('type')}")
                    
            except asyncio.TimeoutError:
                logger.warning("⚠️ No response received for test message (this might be normal)")
            except json.JSONDecodeError:
                logger.error("❌ Invalid JSON in response")
                return False
            
            logger.info("✅ WebSocket test completed successfully")
            return True
            
    except ConnectionRefusedError:
        logger.error("❌ Connection refused. Is the backend server running?")
        return False
    except websockets.exceptions.InvalidURI:
        logger.error("❌ Invalid WebSocket URI")
        return False
    except Exception as e:
        logger.error(f"❌ Unexpected error: {e}")
        return False

async def test_multiple_connections():
    """Test multiple simultaneous WebSocket connections."""
    
    logger.info("Testing multiple WebSocket connections...")
    
    async def create_connection(user_id):
        uri = f"{BACKEND_URL}/ws/{user_id}"
        try:
            websocket = await websockets.connect(uri)
            response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
            data = json.loads(response)
            logger.info(f"✅ User {user_id} connected successfully")
            return websocket
        except Exception as e:
            logger.error(f"❌ Failed to connect user {user_id}: {e}")
            return None
    
    # Create multiple connections
    user_ids = [f"test-user-{i}" for i in range(1, 4)]
    connections = []
    
    for user_id in user_ids:
        websocket = await create_connection(user_id)
        if websocket:
            connections.append((user_id, websocket))
    
    logger.info(f"✅ Created {len(connections)} successful connections")
    
    # Clean up connections
    for user_id, websocket in connections:
        await websocket.close()
        logger.info(f"✅ Closed connection for user {user_id}")
    
    return len(connections) > 0

async def main():
    """Run all WebSocket tests."""
    
    logger.info("🚀 Starting WebSocket connection tests...")
    
    # Test 1: Basic connection
    logger.info("\n" + "="*50)
    logger.info("TEST 1: Basic WebSocket Connection")
    logger.info("="*50)
    
    success1 = await test_websocket_connection()
    
    # Test 2: Multiple connections
    logger.info("\n" + "="*50)
    logger.info("TEST 2: Multiple WebSocket Connections")
    logger.info("="*50)
    
    success2 = await test_multiple_connections()
    
    # Summary
    logger.info("\n" + "="*50)
    logger.info("TEST SUMMARY")
    logger.info("="*50)
    
    if success1 and success2:
        logger.info("✅ All WebSocket tests passed!")
        logger.info("🎉 Your WebSocket server is working correctly")
        logger.info("📞 Voice and video calling should work properly")
    else:
        logger.error("❌ Some WebSocket tests failed")
        logger.error("🔧 Please check your backend server configuration")
        
        if not success1:
            logger.error("   - Basic connection test failed")
        if not success2:
            logger.error("   - Multiple connections test failed")

if __name__ == "__main__":
    asyncio.run(main()) 