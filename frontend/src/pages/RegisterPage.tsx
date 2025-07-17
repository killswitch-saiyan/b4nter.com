import React, { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { FaCamera, FaUser, FaEnvelope, FaLock, FaEye, FaEyeSlash } from 'react-icons/fa';
// @ts-ignore
import brandLogo from '../assets/brandlogo.png';

const RegisterPage: React.FC = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    fullName: '',
    password: '',
    confirmPassword: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [profilePreview, setProfilePreview] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleProfilePictureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Profile picture must be less than 5MB');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        setProfilePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      toast.error('Password must be at least 8 characters long');
      return;
    }

    setIsLoading(true);

    try {
      await register(formData.username, formData.email, formData.password, formData.fullName);
      toast.success('Registration successful! Welcome to b4nter!');
      navigate('/chat');
    } catch (error) {
      toast.error('Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      className="relative min-h-screen flex flex-col items-stretch justify-center overflow-hidden font-sans"
      style={{ background: '#000000' }}
    >
      {/* Brand Logo - Top Corner */}
      <div className="fixed top-6 left-6 z-30">
        <img src={brandLogo} alt="b4nter Logo" className="w-12 h-12 rounded-full object-contain shadow-lg" style={{zIndex: 30}} />
      </div>

      {/* Background Video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover z-0 opacity-0 transition-opacity duration-1000"
        style={{ filter: 'brightness(0.7)' }}
        onCanPlay={() => {
          console.log('Video can play - showing it');
          const video = document.querySelector('video');         if (video) {
            video.style.opacity = '1';
          }
        }}
        onError={(e) => {
          console.error('Video failed to load:', e);
        }}
      >
        <source src="/brandvid.mp4" type="video/mp4" />
        <source src="https://b4ter.onrender.com/brandvid.mp4" type="video/mp4" />
        Your browser does not support the video tag.
      </video>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center w-full h-full min-h-[80vh] px-4 mt-24">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2 tracking-tight" style={{fontFamily: 'Azeret Mono, monospace'}}>Join b4nter</h1>
            <p className="text-white text-lg" style={{fontFamily: 'Syne Mono, monospace'}}>Create your account to get started</p>
          </div>

          {/* Form Container */}
          <div className="backdrop-blur-sm bg-white/10 rounded-2xl shadow-2xl border-white/20 p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Profile Picture Section */}
              <div className="text-center">
                <div className="relative inline-block group">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 p-0.5">
                    <div className="w-full h-full rounded-full bg-slate-800 flex items-center justify-center overflow-hidden">
                      {profilePreview ? (
                        <img 
                          src={profilePreview} 
                          alt="Profile preview" 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 text-slate-400 flex items-center justify-center">
                          <FaUser />
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute -bottom-1 right-1 w-7 h-7 bg-purple-500 rounded-full flex items-center justify-center text-white hover:bg-purple-600 transition-all duration-200 shadow-lg group-hover:scale-110"
                  >
                    <FaCamera />
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleProfilePictureChange}
                  className="hidden"
                />
                <p className="text-white/70 text-xs mt-2">Upload profile picture (optional)</p>
              </div>

              {/* Username */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white">Username</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pointer-events-none text-white/60 pl-4">
                    <FaUser />
                  </div>
                  <input
                    name="username"
                    type="text"
                    required
                    className="w-full pl-12 pr-4 bg-white/40 border border-white/20 rounded-3xl text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-[#B3E5FC] focus:border-transparent transition-all duration-200 backdrop-blur-sm"
                    placeholder="Enter your username"
                    value={formData.username}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white">Email</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pointer-events-none text-white/60 pl-4">
                    <FaEnvelope />
                  </div>
                  <input
                    name="email"
                    type="email"
                    required
                    className="w-full pl-12 pr-4 bg-white/40 border border-white/20 rounded-3xl text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-[#B3E5FC] focus:border-transparent transition-all duration-200 backdrop-blur-sm"
                    placeholder="Enter your email"
                    value={formData.email}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {/* Full Name */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white">Full Name</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pointer-events-none text-white/60 pl-4">
                    <FaUser />
                  </div>
                  <input
                    name="fullName"
                    type="text"
                    required
                    className="w-full pl-12 pr-4 bg-white/40 border border-white/20 rounded-3xl text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-[#B3E5FC] focus:border-transparent transition-all duration-200 backdrop-blur-sm"
                    placeholder="Enter your full name"
                    value={formData.fullName}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pointer-events-none text-white/60 pl-4">
                    <FaLock />
                  </div>
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    className="w-full pl-12 pr-12 bg-white/40 border border-white/20 rounded-3xl text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-[#B3E5FC] focus:border-transparent transition-all duration-200 backdrop-blur-sm"
                    placeholder="Create a password"
                    value={formData.password}
                    onChange={handleChange}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center text-white/60 hover:text-white transition-colors pr-4"
                  >
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white">Confirm Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pointer-events-none text-white/60 pl-4">
                    <FaLock />
                  </div>
                  <input
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    className="w-full pl-12 pr-12 bg-white/40 border border-white/20 rounded-3xl text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-[#B3E5FC] focus:border-transparent transition-all duration-200 backdrop-blur-sm"
                    placeholder="Confirm your password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 flex items-center text-white/60 hover:text-white transition-colors pr-4"
                  >
                    {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <div className="space-y-6">
              <div className="mt-16">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-4 rounded-xl font-semibold text-black text-lg bg-[#B3E5FC] shadow-xl hover:bg-[#81fa] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#B300000] disabled:opacity-60"
                  style={{fontFamily: 'Cabin, sans-serif'}}
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black mr-2"></div>
                      Creating account...
                    </div>
                  ) : (
                   "Create Account"
                  )}
                </button>
              </div>
              </div>

              {/* Login Link */}
              <div className="text-center">
                <p className="text-white text-sm">           Already have an account?{' '}
                  <Link
                    to="/login"
                    className="text-[#B3E5FC] hover:text-[#81fa] font-medium transition-colors underline"
                  >
                    Sign in
                  </Link>
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="absolute bottom-2 left-0 w-full text-center text-xs text-white z-20" style={{fontFamily: 'Cabin, sans-serif'}}>
        &copy; {new Date().getFullYear()} b4nter. All rights reserved.
      </footer>
    </div>
  );
};

export default RegisterPage; 