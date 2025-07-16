import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { FaFutbol, FaPoll, FaSmile, FaUserFriends } from 'react-icons/fa';

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
      style={{
        backgroundImage: `url('/src/assets/background.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Animated Gradient Background */}
      {/* No animated gradient background */}
      
      {/* Main Content: No Boxes, Just Text */}
      <div className="relative z-10 flex flex-col md:flex-row w-full h-full min-h-[80vh]">
        {/* Left: Hero & Trending Rooms, top-left aligned */}
        <div className="flex-1 flex flex-col items-start justify-start pt-16 pl-10 md:pt-24 md:pl-24">
          <div className="flex items-center gap-3 mb-6 relative">
            <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="100" height="100" viewBox="0 0 100 100" style={{fill:'#40C057'}}>
              <path d="M 54.457031 11.955078 C 52.955575 11.96183 51.425846 12.037431 49.871094 12.185547 C 38.691603 13.250139 27.892151 16.119918 19.958984 21.236328 C 12.025817 26.352737 6.9527125 34.090362 8.1894531 43.902344 C 10.103095 59.086291 23.098464 71.745785 42.113281 74.511719 C 44.221735 76.665866 45.055206 78.676155 44.976562 80.861328 C 44.893363 83.17301 43.764618 85.844346 41.613281 88.765625 A 2.0002 2.0002 0 0 0 43.96875 91.806641 C 48.189194 90.108137 51.9035 87.947983 54.498047 84.814453 C 56.695708 82.160257 57.904275 78.752087 57.927734 74.779297 C 76.157369 75.279684 90.772369 60.356359 91.943359 43.794922 C 93.039738 28.296634 79.052299 13.904806 58.873047 12.136719 C 57.431672 12.010427 55.958488 11.948327 54.457031 11.955078 z M 54.472656 15.951172 C 54.641788 15.950203 54.806404 15.958089 54.974609 15.958984 L 53.962891 17.775391 A 1.0001 1.0001 0 1 0 55.708984 18.748047 L 57.224609 16.029297 C 57.655841 16.053249 58.089236 16.073269 58.513672 16.109375 C 59.426504 16.187027 60.318927 16.299429 61.199219 16.431641 L 58.667969 20.736328 A 1.0001 1.0001 0 1 0 60.390625 21.75 L 63.302734 16.800781 C 64.076988 16.959005 64.834916 17.140696 65.580078 17.339844 L 64.628906 18.701172 A 1.0007592 1.0007592 0 1 0 66.269531 19.847656 L 67.601562 17.939453 C 80.081772 22.028299 87.905097 31.858042 87.994141 41.953125 L 84.466797 41.867188 A 1.000298 1.000298 0 0 0 84.417969 43.867188 L 87.910156 43.951172 C 87.834604 44.813987 87.720911 45.672964 87.5625 46.525391 L 83.009766 47.029297 A 1.0002464 1.0002464 0 1 0 83.230469 49.017578 L 87.09375 48.589844 C 85.406751 54.942285 81.491962 60.782076 76.162109 64.902344 L 74.099609 61.572266 A 1.0001 1.0001 0 0 0 73.273438 61.085938 A 1.0001 1.0001 0 0 0 72.400391 62.625 L 74.541016 66.082031 C 73.934627 66.489742 73.308472 66.867519 72.671875 67.230469 L 69.388672 61.552734 A 1.0001 1.0001 0 0 0 68.476562 61.042969 A 1.0001 1.0001 0 0 0 67.658203 62.554688 L 70.902344 68.167969 C 66.474226 70.304289 61.437033 71.345942 56.097656 70.826172 A 2.0002 2.0002 0 0 0 53.916016 73.027344 C 54.347136 77.086908 53.377718 79.894451 51.416016 82.263672 C 50.553549 83.305305 49.387935 84.223413 48.115234 85.095703 C 48.589155 83.745003 48.924976 82.384966 48.974609 81.005859 C 49.099163 77.545041 47.622655 74.141363 44.605469 71.253906 A 2.0002 2.0002 0 0 0 43.476562 70.714844 C 42.256836 70.558819 41.069946 70.357627 39.910156 70.119141 L 40.876953 67.193359 A 1.0001 1.0001 0 0 0 39.935547 65.867188 A 1.0001 1.0001 0 0 0 38.976562 66.566406 L 37.955078 69.667969 C 36.885118 69.398203 35.842767 69.093877 34.830078 68.755859 A 1.0005693 1.0005693 0 0 0 34.841797 68.720703 L 36.105469 64.892578 A 1.0001 1.0001 0 0 0 35.164062 63.566406 A 1.0001 1.0001 0 0 0 34.205078 64.267578 L 32.945312 68.080078 C 31.896545 67.672578 30.879396 67.228794 29.900391 66.75 L 31.634766 61.494141 A 1.0001 1.0001 0 0 0 30.693359 60.167969 A 1.0001 1.0001 0 0 0 29.736328 60.867188 L 28.105469 65.806641 C 26.730906 65.039948 25.436855 64.202157 24.222656 63.300781 L 26.943359 59.482422 A 1.0001 1.0001 0 0 0 26.140625 57.890625 A 1.0001 1.0001 0 0 0 25.3125 58.322266 L 22.646484 62.066406 C 21.840898 61.391016 21.082162 60.681722 20.361328 59.949219 L 23.603516 53.464844 A 1.0001 1.0001 0 0 0 22.664062 52.005859 A 1.0001 1.0001 0 0 0 21.814453 52.570312 L 18.908203 58.378906 C 17.823291 57.11461 16.861335 55.779284 16.019531 54.390625 A 1.0001 1.0001 0 0 0 16.28125 54.033203 L 19.060547 47.917969 A 1.0001 1.0001 0 0 0 18.167969 46.492188 A 1.0001 1.0001 0 0 0 17.240234 47.091797 L 14.871094 52.302734 C 14.024751 50.604444 13.348609 48.839052 12.865234 47.021484 L 14.929688 44.601562 A 1.0001 1.0001 0 0 0 14.169922 42.941406 A 1.0001 1.0001 0 0 0 13.408203 43.302734 L 12.332031 44.564453 C 12.266543 44.178926 12.207212 43.791206 12.158203 43.402344 C 11.115944 35.133325 15.02537 29.177746 22.126953 24.597656 C 22.138806 24.590012 22.152192 24.583807 22.164062 24.576172 L 24.519531 28.039062 A 1.0002904 1.0002904 0 0 0 26.173828 26.914062 L 23.882812 23.544922 C 30.83872 19.602322 40.280367 17.134389 50.117188 16.183594 L 49.128906 18.03125 A 1.0001 1.0001 0 1 0 50.892578 18.974609 L 52.480469 16.007812 C 53.151596 15.975238 53.815196 15.954938 54.472656 15.951172 z M 74.513672 26.728516 C 74.069812 26.710469 73.6385 26.954109 73.4375 27.380859 C 73.1685 27.949859 73.411469 28.630437 73.980469 28.898438 C 74.549469 29.166437 75.229047 28.923516 75.498047 28.353516 C 75.766047 27.784516 75.521125 27.106891 74.953125 26.837891 C 74.810875 26.770891 74.661625 26.734531 74.513672 26.728516 z M 67.59375 29.087891 C 67.149891 29.069844 66.718578 29.311531 66.517578 29.738281 C 66.248578 30.307281 66.491547 30.987859 67.060547 31.255859 C 67.629547 31.523859 68.309125 31.281891 68.578125 30.712891 C 68.846125 30.143891 68.601203 29.463313 68.033203 29.195312 C 67.890953 29.128312 67.741703 29.093906 67.59375 29.087891 z M 76.484375 34.929688 C 76.040516 34.911641 75.60725 35.153328 75.40625 35.580078 C 75.13725 36.149078 75.382172 36.829656 75.951172 37.097656 C 76.520172 37.365656 77.20075 37.123687 77.46875 36.554688 C 77.73675 35.985687 77.491828 35.305109 76.923828 35.037109 C 76.781578 34.970109 76.632328 34.935703 76.484375 34.929688 z M 68.029297 40.1875 C 66.749616 40.1875 65.664041 40.680468 64.957031 41.447266 C 64.250021 42.214063 63.912109 43.209899 63.912109 44.191406 C 63.912109 45.172914 64.250021 46.166796 64.957031 46.933594 C 65.664041 47.700391 66.749616 48.195312 68.029297 48.195312 C 69.308977 48.195313 70.394553 47.700391 71.101562 46.933594 C 71.808573 46.166796 72.144531 45.172914 72.144531 44.191406 C 72.144531 43.209899 71.808573 42.214063 71.101562 41.447266 C 70.394553 40.680468 69.308977 40.1875 68.029297 40.1875 z M 50.710938 40.226562 C 49.431257 40.226562 48.345682 40.719531 47.638672 41.486328 C 46.931662 42.253126 46.59375 43.248961 46.59375 44.230469 C 46.59375 45.211976 46.931662 46.205859 47.638672 46.972656 C 48.345682 47.739454 49.431257 48.234375 50.710938 48.234375 C 51.990617 48.234375 53.07424 47.739454 53.78125 46.972656 C 54.48826 46.205859 54.826172 45.211976 54.826172 44.230469 C 54.826172 43.248961 54.48826 42.253126 53.78125 41.486328 C 53.07424 40.719531 51.990617 40.226564 50.710938 40.226562 z M 33.757812 40.449219 C 32.478212 40.449219 31.392596 40.9424 30.685547 41.708984 C 29.978498 42.475569 29.642578 43.469838 29.642578 44.451172 C 29.642578 45.432506 29.978498 46.428729 30.685547 47.195312 C 31.392596 47.961897 32.478212 48.455078 33.757812 48.455078 C 35.037413 48.455078 36.123029 47.961897 36.830078 47.195312 C 37.537127 46.428728 37.873047 45.432506 37.873047 44.451172 C 37.873047 43.469838 37.537127 42.475569 36.830078 41.708984 C 36.123029 40.9424 35.037413 40.449219 33.757812 40.449219 z M 68.029297 42.1875 C 68.826949 42.1875 69.299203 42.443032 69.630859 42.802734 C 69.962516 43.162437 70.144531 43.670914 70.144531 44.191406 C 70.144531 44.711899 69.962516 45.218423 69.630859 45.578125 C 69.299203 45.937827 68.826949 46.195313 68.029297 46.195312 C 67.231645 46.195312 66.759391 45.937827 66.427734 45.578125 C 66.096078 45.218423 65.912109 44.711899 65.912109 44.191406 C 65.912109 43.670914 66.096078 43.162437 66.427734 42.802734 C 66.759391 42.443032 67.231645 42.1875 68.029297 42.1875 z M 50.710938 42.226562 C 51.508589 42.226563 51.980844 42.482094 52.3125 42.841797 C 52.644156 43.201499 52.826172 43.709976 52.826172 44.230469 C 52.826172 44.750961 52.644156 45.257485 52.3125 45.617188 C 51.980844 45.976889 51.508589 46.234375 50.710938 46.234375 C 49.913285 46.234375 49.439078 45.976889 49.107422 45.617188 C 48.775766 45.257484 48.59375 44.750961 48.59375 44.230469 C 48.59375 43.709976 48.775766 43.201499 49.107422 42.841797 C 49.439078 42.482094 49.913285 42.226562 50.710938 42.226562 z M 33.757812 42.449219 C 34.555546 42.449219 35.027758 42.704913 35.359375 43.064453 C 35.690992 43.423994 35.873047 43.931006 35.873047 44.451172 C 35.873047 44.971338 35.690992 45.47835 35.359375 45.837891 C 35.027758 46.197431 34.555546 46.455078 33.757812 46.455078 C 32.96008 46.455078 32.487867 46.197431 32.15625 45.837891 C 31.824633 45.47835 31.642578 44.971338 31.642578 44.451172 C 31.642578 43.931006 31.824633 43.423994 32.15625 43.064453 C 32.487867 42.704913 32.96008 42.449219 33.757812 42.449219 z"></path>
            </svg>
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