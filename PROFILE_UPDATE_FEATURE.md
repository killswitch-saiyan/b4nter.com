# Profile Update Feature

This document describes the new user profile update functionality that allows users to edit their profile information and upload profile pictures.

## 🎯 Features

### User Profile Dropdown
- **Location**: Header of the chat interface
- **Trigger**: Click on the user avatar/name in the header
- **Functionality**: 
  - View current profile information
  - Edit profile details
  - Upload/change profile picture
  - Logout functionality

### Profile Information Editing
- **Editable Fields**:
  - Username
  - Full Name
  - Email Address
- **Validation**:
  - Username uniqueness check
  - Email uniqueness check
  - Real-time form validation

### Profile Picture Upload
- **Supported Formats**: JPG, PNG, GIF
- **File Size Limit**: 5MB maximum
- **Storage**: Base64 encoded in database
- **Features**:
  - Preview before upload
  - Drag and drop support
  - Error handling for invalid files

## 🏗️ Architecture

### Backend Components

#### 1. Profile Update Endpoint
```python
PUT /api/users/profile
```
- **Purpose**: Update user profile information
- **Authentication**: Required (Bearer token)
- **Validation**: Username and email uniqueness
- **Response**: Updated user object

#### 2. Profile Picture Upload Endpoint
```python
POST /api/users/profile-picture
```
- **Purpose**: Upload and update profile picture
- **Authentication**: Required (Bearer token)
- **File Validation**: Type and size checks
- **Storage**: Base64 encoding in database

#### 3. Database Methods
- `get_user_by_username()`: Check username availability
- `update_user()`: Update user profile data
- `get_user_by_email()`: Check email availability

### Frontend Components

#### 1. UserProfileDropdown Component
- **Location**: `frontend/src/components/UserProfileDropdown.tsx`
- **Features**:
  - Dropdown menu with profile view/edit modes
  - Click-outside-to-close functionality
  - Real-time form updates
  - Profile picture upload integration

#### 2. ProfilePictureUpload Component
- **Location**: `frontend/src/components/ProfilePictureUpload.tsx`
- **Features**:
  - File selection with preview
  - Upload progress indication
  - Error handling and validation
  - Fallback to initials if image fails

#### 3. Enhanced AuthContext
- **New Method**: `updateUser(updates)`
- **Purpose**: Real-time user data updates
- **Integration**: Automatic localStorage sync

## 🚀 Usage

### For Users

1. **Access Profile Menu**:
   - Click on your avatar/name in the header
   - Dropdown menu will appear

2. **View Profile**:
   - See current profile information
   - View profile picture
   - Access edit and logout options

3. **Edit Profile**:
   - Click "Edit Profile" button
   - Modify username, full name, or email
   - Upload new profile picture
   - Click "Save Changes" to update

4. **Upload Profile Picture**:
   - Click camera icon on avatar
   - Select image file (JPG, PNG, GIF)
   - Preview the image
   - Click "Upload" to save

### For Developers

#### Backend API Usage

```python
# Update profile information
PUT /api/users/profile
Headers: Authorization: Bearer <token>
Body: {
    "username": "newusername",
    "full_name": "New Full Name",
    "email": "newemail@example.com"
}

# Upload profile picture
POST /api/users/profile-picture
Headers: Authorization: Bearer <token>
Body: FormData with file field
```

#### Frontend Integration

```typescript
// Using the UserProfileDropdown component
import UserProfileDropdown from '../components/UserProfileDropdown';

<UserProfileDropdown />

// Using the ProfilePictureUpload component
import ProfilePictureUpload from '../components/ProfilePictureUpload';

<ProfilePictureUpload 
  onUploadSuccess={(avatarUrl) => {
    // Handle successful upload
    updateUser({ avatar_url: avatarUrl });
  }}
/>
```

## 🔧 Configuration

### Backend Environment Variables
No additional configuration required. Uses existing database and authentication setup.

### Frontend Configuration
No additional configuration required. Uses existing API endpoints and authentication.

## 🧪 Testing

### Manual Testing
1. **Profile Update**:
   - Login to the application
   - Click profile dropdown in header
   - Click "Edit Profile"
   - Modify fields and save
   - Verify changes persist

2. **Profile Picture Upload**:
   - Access profile edit mode
   - Click camera icon
   - Select image file
   - Verify upload and display

3. **Validation Testing**:
   - Try uploading non-image files
   - Try uploading files > 5MB
   - Try using duplicate username/email
   - Verify appropriate error messages

### Automated Testing
The feature includes comprehensive backend testing with:
- Profile update endpoint validation
- Profile picture upload validation
- Database constraint checking
- Authentication verification

## 🔒 Security Considerations

### Input Validation
- **File Type**: Only image files allowed
- **File Size**: Maximum 5MB limit
- **Username/Email**: Uniqueness validation
- **Authentication**: All endpoints require valid JWT token

### Data Protection
- **Profile Data**: Stored securely in database
- **Images**: Base64 encoded (consider cloud storage for production)
- **Access Control**: Users can only update their own profiles

## 🚀 Future Enhancements

### Potential Improvements
1. **Cloud Storage**: Move images to AWS S3 or similar
2. **Image Processing**: Add image resizing and optimization
3. **Profile Privacy**: Add privacy settings for profile visibility
4. **Profile Verification**: Add email verification for changes
5. **Profile History**: Track profile change history

### Performance Optimizations
1. **Image Compression**: Implement client-side image compression
2. **Lazy Loading**: Load profile pictures on demand
3. **Caching**: Implement profile data caching
4. **CDN**: Use CDN for profile picture delivery

## 📝 API Documentation

### Profile Update Endpoint
```http
PUT /api/users/profile
Content-Type: application/json
Authorization: Bearer <token>

{
  "username": "string",
  "full_name": "string", 
  "email": "string"
}
```

**Response:**
```json
{
  "id": "uuid",
  "username": "string",
  "email": "string",
  "full_name": "string",
  "avatar_url": "string",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### Profile Picture Upload Endpoint
```http
POST /api/users/profile-picture
Content-Type: multipart/form-data
Authorization: Bearer <token>

file: <image_file>
```

**Response:**
```json
{
  "message": "Profile picture updated successfully",
  "avatar_url": "data:image/png;base64,..."
}
```

## 🐛 Troubleshooting

### Common Issues

1. **Profile Picture Not Displaying**:
   - Check file format (JPG, PNG, GIF only)
   - Verify file size < 5MB
   - Check browser console for errors

2. **Profile Update Fails**:
   - Verify username/email uniqueness
   - Check authentication token validity
   - Review server logs for errors

3. **Dropdown Not Opening**:
   - Check for JavaScript errors
   - Verify component is properly imported
   - Check CSS z-index conflicts

### Debug Steps
1. Check browser developer tools for errors
2. Verify API endpoints are accessible
3. Check database connectivity
4. Review authentication token validity
5. Test with different file types and sizes

## 📞 Support

For issues or questions about the profile update feature:
1. Check this documentation
2. Review the code comments
3. Test with the provided examples
4. Check server logs for detailed error messages 