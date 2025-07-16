import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { FaFutbol, FaPoll, FaSmile, FaUserFriends } from 'react-icons/fa';
import banterLogo from '../assets/banter-logo.png';

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
    <div className="relative min-h-screen flex flex-col items-stretch justify-center overflow-hidden font-sans bg-[#FAE5DF]"> {/* Beige background, can switch to salmon: #FFB3A7 */}
      {/* Animated Gradient Background */}
      {/* No animated gradient background */}
      
      {/* Main Content: No Boxes, Just Text */}
      <div className="relative z-10 flex flex-col md:flex-row w-full h-full min-h-[80vh]">
        {/* Left: Hero & Trending Rooms, top-left aligned */}
        <div className="flex-1 flex flex-col items-start justify-start pt-16 pl-10 md:pt-24 md:pl-24">
          <div className="flex items-center gap-3 mb-6 relative">
            <div className="relative w-36 h-36 flex-shrink-0 rounded-full" style={{background: '#FAE5DF'}}>
              <img src={banterLogo} alt="Banter Logo" className="w-full h-full object-contain" />
              <span className="absolute inset-0 flex items-center justify-center text-black text-base font-bold select-none pointer-events-none" style={{fontFamily: 'Bangers, monospace', letterSpacing: '0.05em'}}>%#$</span>
            </div>
            <span className="text-7xl md:text-7xl font-bold tracking-tight text-black select-none" style={{letterSpacing: '-0.0009em', fontFamily: 'Azeret Mono, monospace'}}>b4nter</span>
          </div>
          <h2 className="text-3xl md:text-3xl font-bold text-black mb-3" style={{letterSpacing: '-0.01em', fontFamily: 'Syne Mono, monospace'}}>Where pettiness trumps over peace. Talk trash and vibe !</h2>
          <p className="text-lg text-black mb-8 max-w-lg font-light" style={{fontFamily: 'Syne Mono, monospace'}}>Immerse yourself on hot takes, smack talks and vibe with a community of like-minded trash talkers. 
            No chill. Talk smack.</p>
          <p className="text-xs text-black mb-8 max-w-lg font-light" style={{fontFamily: 'Syne Mono, monospace'}}>Disclaimer: Stash your sensitivity in the locker room if you want to enter this playground!</p>
          <h3 className="text-base font-semibold text-black mb-2 tracking-wide uppercase" style={{fontFamily: 'Cabin, sans-serif'}}>What's Cooking ?</h3>
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
                <div className="flex items-center gap-1 text-xs opacity-90">
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
            <h3 className="text-3xl font-semibold text-black mb-6 text-center animate-fade-in tracking-tight w-full" style={{fontFamily: 'Cabin, sans-serif'}}>Dare to join the chaos?</h3>
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
             <span className="mx-3 text-black text-sm" style={{fontFamily: 'Cabin, sans-serif'}}>or</span>
              <div className="flex-grow border-t border-gray-300" />
            </div>
            <div className="text-center w-full">
              <Link
                to="/register"
                className="font-medium text-black hover:underline transition-colors text-base"
                style={{fontFamily: 'Cabin, sans-serif'}}
              >
                Don&apos;t have an account? <span className="underline">Sign up</span>
              </Link>
            </div>
            <div className="flex gap-6 mt-8 justify-center text-black text-lg w-full" style={{fontFamily: 'Cabin, sans-serif'}}>
              <span className="flex items-center gap-2"><FaSmile /> Emojis</span>
              <span className="flex items-center gap-2"><FaPoll /> Polls</span>
              <span className="flex items-center gap-2">{FaUserFriends as any && <FaUserFriends className="align-middle" />} Avatars</span>
            </div>
          </div>
        </div>
      </div>
      {/* No animated gradient border */}
      {/* Footer */}
      <footer className="absolute bottom-2 left-0 w-full text-center text-xs text-black z-20" style={{fontFamily: 'Cabin, sans-serif'}}>
        &copy; {new Date().getFullYear()} b4nter. All rights reserved.
      </footer>
    </div>
  );
};

export default LoginPage; 