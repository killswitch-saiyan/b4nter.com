# B4nter Test Scripts

This directory contains comprehensive test scripts to verify all B4nter features including user creation, login, direct messaging, and channel messaging...

## Test Structure

```
test_scripts/
├── test_api.py          # API endpoint tests
├── test_socket.py       # Socket.IO real-time tests
├── run_tests.py         # Main test runner
├── requirements.txt     # Test dependencies
└── README.md           # This file
```

## Prerequisites

1. **Backend Server Running**: Make sure the B4nter backend is running on `http://localhost:8000`
2. **Database Setup**: Ensure Supabase is configured and the database schema is applied
3. **Dependencies**: Install test dependencies

```bash
cd test_scripts
pip install -r requirements.txt
```

## Running Tests

### Option 1: Run All Tests (Recommended)

```bash
python test_scripts/run_tests.py
```

This will:
1. Check if the API is running
2. Run all API tests
3. Prompt for test data to run Socket.IO tests
4. Generate a comprehensive test report

### Option 2: Run Individual Tests

#### API Tests Only
```bash
python test_scripts/test_api.py --url http://localhost:8000
```

#### Socket.IO Tests Only
```bash
python test_scripts/test_socket.py \
  --url http://localhost:8000 \
  --channel-id <channel_id> \
  --user1-id <user1_id> \
  --user2-id <user2_id>
```

## Test Features

### API Tests (`test_api.py`)

Tests all HTTP endpoints:

1. **Health Check** - Verify API is running
2. **User Registration** - Create two test users
3. **User Login** - Test login for both users
4. **Get Current User** - Verify authentication
5. **Create Channel** - Create a test channel
6. **Join Channel** - Test channel joining
7. **Get User Channels** - List user's channels
8. **Send Channel Message** - Post message to channel
9. **Get Channel Messages** - Retrieve channel messages
10. **Send Direct Message** - Send DM between users
11. **Get Direct Messages** - Retrieve DM history
12. **Get Users for DM** - List available users
13. **Get Channel Members** - List channel members

### Socket.IO Tests (`test_socket.py`)

Tests real-time features:

1. **Socket Connection** - Verify WebSocket connection
2. **Join Channel Socket** - Join channel via Socket.IO
3. **Send Channel Message Socket** - Real-time channel messaging
4. **Send Direct Message Socket** - Real-time direct messaging
5. **Typing Indicators** - Test typing indicators
6. **Leave Channel Socket** - Leave channel via Socket.IO

## Test Data

The tests create the following test data:

### Users
- **User 1**: `testuser1@b4nter.com` / `password123`
- **User 2**: `testuser2@b4nter.com` / `password123`

### Channel
- **Name**: `test-channel`
- **Description**: `Test channel for B4nter`
- **Creator**: User 1 (admin)

### Messages
- Channel message: "Hello from test user 1! This is a test message in the channel."
- Direct message: "Hello User 2! This is a direct message from User 1."

## Expected Output

### Successful API Test Run
```
🚀 Starting B4nter API Tests
==================================================
[RUNNING] Health Check
[PASS] Health Check
[RUNNING] User Registration
[PASS] User Registration
[RUNNING] User Login
[PASS] User Login
...
==================================================
📊 Test Results: 13/13 tests passed
🎉 All tests passed! B4nter API is working correctly.
```

### Successful Socket.IO Test Run
```
🔌 Starting B4nter Socket.IO Tests
==================================================
✅ Connected to Socket.IO server
[RUNNING] Socket.IO Connection
[PASS] Socket.IO Connection
[RUNNING] Join Channel Socket
[PASS] Join Channel Socket
...
==================================================
📊 Socket Test Results: 5/5 tests passed
🎉 All Socket.IO tests passed!
```

## Troubleshooting

### Common Issues

1. **API Not Running**
   ```
   ❌ API is not running or not healthy
   Please start the backend server first:
   cd backend && uvicorn main:app --reload
   ```

2. **Database Connection Issues**
   - Verify Supabase credentials in `backend/.env`
   - Ensure database schema is applied
   - Check network connectivity

3. **Socket.IO Connection Failed**
   - Verify backend is running with Socket.IO support
   - Check CORS configuration
   - Ensure WebSocket transport is enabled

4. **Test Timeout**
   - Increase timeout values in test scripts
   - Check server performance
   - Verify network connectivity

### Debug Mode

To see detailed output, run tests with verbose logging:

```bash
python test_scripts/test_api.py --url http://localhost:8000 --verbose
```

## Test Customization

### Adding New Tests

1. **API Tests**: Add new test methods to `B4nterAPITester` class
2. **Socket Tests**: Add new test methods to `B4nterSocketTester` class
3. **Update Test Runner**: Add new tests to the test suite in `run_tests.py`

### Modifying Test Data

Edit the test data in the respective test files:
- `test_api.py`: Modify user data, channel data, and message content
- `test_socket.py`: Modify Socket.IO event data

### Environment-Specific Testing

Use the `--url` parameter to test different environments:

```bash
# Test local development
python test_scripts/run_tests.py --url http://localhost:8000

# Test staging environment
python test_scripts/run_tests.py --url https://staging-api.b4nter.com

# Test production environment
python test_scripts/run_tests.py --url https://api.b4nter.com
```

## Continuous Integration

These tests can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run B4nter Tests
  run: |
    cd test_scripts
    pip install -r requirements.txt
    python run_tests.py --url ${{ secrets.API_URL }}
```

## Support

For test-related issues:
1. Check the troubleshooting section
2. Verify all prerequisites are met
3. Review test output for specific error messages
4. Check backend logs for additional context 