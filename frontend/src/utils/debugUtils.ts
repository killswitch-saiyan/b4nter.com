/**
 * Debug utilities to help identify API issues
 */

export const debugAPI = {
  // Log all fetch requests
  logRequest: (url: string, options: RequestInit) => {
    console.log('🔍 API Request:', {
      url,
      method: options.method || 'GET',
      headers: options.headers,
      body: options.body
    });
  },

  // Log all fetch responses
  logResponse: (url: string, response: Response, data?: any) => {
    console.log('📡 API Response:', {
      url,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      data
    });
  },

  // Log API errors
  logError: (url: string, error: any) => {
    console.error('❌ API Error:', {
      url,
      error: error.message,
      stack: error.stack,
      response: error.response
    });
  },

  // Test backend connectivity
  testBackend: async () => {
    try {
      console.log('🧪 Testing backend connectivity...');
      
      const response = await fetch('/api/health', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      console.log('✅ Backend health check:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Backend health data:', data);
        return true;
      } else {
        console.error('❌ Backend health check failed:', response.status);
        return false;
      }
    } catch (error) {
      console.error('❌ Backend connectivity test failed:', error);
      return false;
    }
  },

  // Test authentication endpoints
  testAuth: async () => {
    try {
      console.log('🔐 Testing authentication endpoints...');
      
      // Test registration endpoint
      const registerResponse = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: 'test_user_debug',
          email: 'test_debug@example.com',
          password: 'testpassword123',
          full_name: 'Test Debug User'
        }),
      });
      
      console.log('📝 Registration test:', registerResponse.status);
      
      if (registerResponse.ok) {
        const data = await registerResponse.json();
        console.log('✅ Registration successful:', data);
        
        // Clean up test user
        if (data.user?.id) {
          // Note: You might need to implement a cleanup endpoint
          console.log('🧹 Test user created, consider cleanup');
        }
      } else {
        const errorText = await registerResponse.text();
        console.log('⚠️ Registration test response:', errorText);
      }
      
      return true;
    } catch (error) {
      console.error('❌ Authentication test failed:', error);
      return false;
    }
  },

  // Test database connectivity
  testDatabase: async () => {
    try {
      console.log('🗄️ Testing database connectivity...');
      
      const response = await fetch('/api/users', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      console.log('📊 Database test:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Database accessible, users count:', data.length);
        return true;
      } else {
        const errorText = await response.text();
        console.log('⚠️ Database test response:', errorText);
        return false;
      }
    } catch (error) {
      console.error('❌ Database test failed:', error);
      return false;
    }
  },

  // Run all tests
  runAllTests: async () => {
    console.log('🚀 Running all debug tests...');
    
    const results = {
      backend: await debugAPI.testBackend(),
      auth: await debugAPI.testAuth(),
      database: await debugAPI.testDatabase(),
    };
    
    console.log('📊 Debug test results:', results);
    
    const allPassed = Object.values(results).every(result => result);
    console.log(allPassed ? '🎉 All tests passed!' : '⚠️ Some tests failed');
    
    return results;
  }
};

// Add to window for easy access in browser console
if (typeof window !== 'undefined') {
  (window as any).debugAPI = debugAPI;
} 