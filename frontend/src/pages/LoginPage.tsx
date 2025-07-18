import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { FaFutbol, FaPoll, FaSmile, FaUserFriends } from 'react-icons/fa';
import brandLogo from '../assets/brandlogo.png';
// Video will be handled via public path

const trendingRooms = [
  {
    name: 'Manchester United vs Liverpool',
    users: 128,
    gradient: 'from-pink-500 via-red-500 to-yellow-500',
    emoji: '⚽️',
  },
  {
    name: 'Oscars Live',
    users: 87,
    gradient: 'from-blue-500 via-purple-500 to-pink-500',
    emoji: '🎬',
  },
  {
    name: 'NBA Playoffs',
    users: 102,
    gradient: 'from-green-400 via-blue-500 to-purple-500',
    emoji: '🏀',
  },
  {
    name: 'Champions League',
    users: 95,
    gradient: 'from-yellow-400 via-red-400 to-pink-500',
    emoji: '🏆',
  },
];

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showSignup, setShowSignup] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(email, password);
      toast.success('Login successful!');
      navigate('/chat');
    } catch (error) {
      toast.error('Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      className="relative min-h-screen flex flex-col items-stretch justify-center overflow-hidden font-sans"
      style={{ background: '#000' }}
    >
      <style>
        {`
          @keyframes gradientShift {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
        `}
      </style>
      {/* Background Video - Hidden by default, shown only if it loads */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover z-0 opacity-0 transition-opacity duration-1000"
        style={{ filter: 'brightness(0.7)' }}
        onCanPlay={() => {
          console.log('Video can play - showing it');
          const video = document.querySelector('video');
          if (video) {
            video.style.opacity = '1';
          }
        }}
        onError={(e) => {
          console.error('Video failed to load:', e);
          // Video will remain hidden, background image will show
        }}
      >
        <source src="/brandvid.mp4" type="video/mp4" />
        Your browser does not support the video tag.
      </video>
      {/* Animated Gradient Background */}
      {/* No animated gradient background */}
      
      {/* Main Content: No Boxes, Just Text */}
      <div className="relative z-10 flex flex-col md:flex-row w-full h-full min-h-[80vh]">
        {/* Left: Hero & Trending Rooms, top-left aligned */}
        <div className="flex-1 flex flex-col items-start justify-start pt-16 pl-10 md:pt-24 md:pl-24">
          <div className="flex items-center gap-3 mb-6 relative">
            <img src={brandLogo} alt="Banter Logo" className="w-[80px] h-[80px] rounded-full object-contain shadow-lg" />
            <span className="text-7xl md:text-7xl font-bold tracking-tight text-white select-none" style={{letterSpacing: '-0.0009em', fontFamily: 'Azeret Mono, monospace'}}>b4nter</span>
          </div>
          <h2 className="text-3xl md:text-3xl font-bold text-white mb-3" style={{letterSpacing: '-0.01em', fontFamily: 'Syne Mono, monospace'}}>Where pettiness trumps over peace. Talk trash and vibe !</h2>
          <p className="text-lg text-white mb-8 max-w-lg font-light" style={{fontFamily: 'Syne Mono, monospace'}}>Immerse yourself on hot takes, smack talks and vibe with a community of like-minded trash talkers. 
            No chill. Talk smack.</p>
          <p className="text-xs text-white mb-8 max-w-lg font-light" style={{fontFamily: 'Syne Mono, monospace'}}>Disclaimer: Stash your sensitivity in the locker room if you want to enter this playground!</p>
          <h3 className="text-base font-semibold text-white mb-2 tracking-wide uppercase" style={{fontFamily: 'Cabin, sans-serif'}}>What's Cooking ?</h3>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {trendingRooms.map((room) => (
              <div
                key={room.name}
                className={`min-w-[200px] rounded-2xl px-4 py-2 bg-[#B3E5FC] text-black flex flex-col items-start justify-between transition-transform hover:scale-105 cursor-pointer border-0 shadow-none backdrop-blur-0`}
                style={{background: undefined, boxShadow: 'none'}}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{room.emoji}</span>
                 <span className="font-bold text-lg drop-shadow" style={{fontFamily: 'Cabin, sans-serif'}}>{room.name}</span>
                </div>
                <div className="flex items-center gap-1 text-xs opacity-90 text-white">
                  {FaUserFriends as any && <FaUserFriends className="inline-block mr-1 align-middle" />}
                  {room.users} online
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Right: Sign-in, just text, right-aligned and centered vertically */}
        <div className="flex-1 flex flex-col items-end justify-start pt-16 md:pt-24 pr-10 md:pr-24">
          <div className="w-full max-w-md flex flex-col items-end">
            <h3 className="text-3xl font-semibold text-white mb-6 text-center animate-fade-in tracking-tight w-full" style={{fontFamily: 'Cabin, sans-serif'}}>Dare to join the chaos?</h3>
            <form className="space-y-8 w-full max-w-md" onSubmit={handleSubmit}>
              <div className="space-y-6">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="w-full px-5 py-4 rounded-xl bg-white/40 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#B3E5FC] text-black placeholder-black shadow-md text-base backdrop-blur-sm"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{fontWeight: 400}}
                />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="w-full px-5 py-4 rounded-xl bg-white/40 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#B3E5FC] text-black placeholder-black shadow-md text-base backdrop-blur-sm"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{fontWeight: 400}}
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-4 rounded-xl font-semibold text-black text-lg bg-[#B3E5FC] shadow-xl hover:bg-[#81d4fa] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#B3E5FC] disabled:opacity-60 tracking-wide"
                style={{fontFamily: 'Cabin, sans-serif'}}
              >
                {isLoading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
            <div className="flex items-center my-6 w-full">
              <div className="flex-grow border-t border-gray-300" />
             <span className="mx-3 text-white text-sm" style={{fontFamily: 'Cabin, sans-serif'}}>or</span>
              <div className="flex-grow border-t border-gray-300" />
            </div>
            <div className="text-center w-full">
              <Link
                to="/register"
                className="font-medium text-white hover:underline transition-colors text-base"
                style={{fontFamily: 'Cabin, sans-serif'}}
              >
                Don&apos;t have an account? <span className="underline">Sign up</span>
              </Link>
            </div>
            <div className="flex gap-6 mt-8 justify-center text-white text-lg w-full" style={{fontFamily: 'Cabin, sans-serif'}}>
              <span className="flex items-center gap-2"><FaSmile /> Emojis</span>
              <span className="flex items-center gap-2"><FaPoll /> Polls</span>
              <span className="flex items-center gap-2">{FaUserFriends as any && <FaUserFriends className="align-middle" />} Avatars</span>
            </div>
          </div>
        </div>
      </div>
      {/* No animated gradient border */}
      {/* Footer */}
      <footer className="absolute bottom-2 left-0 w-full text-center text-xs text-white z-20" style={{fontFamily: 'Cabin, sans-serif'}}>
        &copy; {new Date().getFullYear()} b4nter. All rights reserved.
      </footer>
    </div>
  );
};

export default LoginPage; 