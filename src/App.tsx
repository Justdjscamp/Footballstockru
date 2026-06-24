import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Home, 
  Search, 
  MessageSquare, 
  User, 
  Wallet, 
  LogOut, 
  Menu, 
  X,
  PlusCircle,
  ShieldCheck,
  Trophy,
  MapPin,
  Users,
  Moon,
  Sun
} from 'lucide-react';
import { useAuth } from './hooks/useAuth';
import { usePushNotifications } from './hooks/usePushNotifications';
import { useChatSync } from './hooks/useChatSync';
import { logout, createUserProfile, updateUserProfile, saveFcmToken, removeFcmToken } from './services/firebaseService';
import { cn } from './lib/utils';
import { UserRole, ContactRequest } from './types';
import { db, auth } from './firebase';
import { collection, query, where, onSnapshot, or, and, doc, updateDoc } from 'firebase/firestore';
import { OperationType, handleFirestoreError } from './services/firebaseService';

// Pages
import HomePage from './pages/HomePage';
import ProfilePage from './pages/ProfilePage';
import SearchPage from './pages/SearchPage';
import ChatPage from './pages/ChatPage';
import WalletPage from './pages/WalletPage';
import LoginPage from './pages/LoginPage';
import AboutPage from './pages/AboutPage';
import PublicPlayerPage from './pages/PublicPlayerPage';
import PublicTeamPage from './pages/PublicTeamPage';
import SplashScreen from './components/SplashScreen';
import OAuthCallbackPage from './pages/OAuthCallbackPage';
import TermsPage from './pages/TermsPage';
import PrivacyPage from './pages/PrivacyPage';

const Layout = ({ children }: { children: React.ReactNode }) => {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const { totalUnread } = useChatSync(user);
  usePushNotifications(user);

  const [showSplash, setShowSplash] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as 'light' | 'dark') || 'dark';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Click outside to close menus
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsMoreOpen(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        // Also ensure click isn't on the menu button itself, or button will toggle it twice
        const menuBtn = document.getElementById('mobile-menu-btn');
        if (menuBtn && !menuBtn.contains(event.target as Node)) {
          setIsMenuOpen(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  useEffect(() => {
    // Hide splash after a minimum time if auth is ready
    if (!authLoading) {
      import('@capacitor/core').then(({ Capacitor }) => {
        if (Capacitor.isNativePlatform()) {
          import('@capacitor/splash-screen').then(({ SplashScreen }) => {
            SplashScreen.hide();
          }).catch(console.error);
        }
      });
    }
  }, [authLoading]);

  useEffect(() => {
    if (!user) return;

    const updateActivity = async () => {
      try {
        await updateUserProfile(user.uid, { lastActive: new Date().toISOString() });
      } catch (e) {
        console.error("Error updating activity:", e);
      }
    };

    updateActivity();
    const interval = setInterval(updateActivity, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [user]);

  const handleLogout = async () => {
    if (user) {
      try {
        const token = localStorage.getItem('fcm_token');
        if (token) {
          await removeFcmToken(user.uid, token);
        }
      } catch (error) {
        console.error('Error removing push token during logout:', error);
      } finally {
        localStorage.removeItem('fcm_token');
        logout();
        navigate('/');
        setIsMenuOpen(false);
      }
    } else {
      logout();
      navigate('/');
      setIsMenuOpen(false);
    }
  };

  const navItems = [
    { path: '/', icon: Home, label: 'Главная' },
    { path: '/search', icon: Search, label: 'Поиск' },
    { path: '/chat', icon: MessageSquare, label: 'Чаты', badge: totalUnread },
    { path: '/wallet', icon: Wallet, label: 'Кошелек' },
    { path: '/profile', icon: User, label: 'Профиль' },
    { path: '/about', icon: Trophy, label: 'О нас', hideInBottomNav: true, hideInDesktopNav: true },
  ];

  if (authLoading || showSplash) {
    return (
      <AnimatePresence>
        {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      </AnimatePresence>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden relative pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]">
      {/* Header */}
      <header className="mt-2 md:mt-4 mx-2 md:mx-auto w-auto md:w-full max-w-7xl z-50 bento-glass !overflow-visible rounded-2xl md:rounded-full px-4 min-h-[56px] md:min-h-[64px] flex items-center justify-between mb-2 md:mb-4 flex-shrink-0">
        <Link to="/" className="flex items-center gap-2">
          <div className="bg-primary p-1.5 rounded-lg shadow-lg shadow-primary/20">
            <Trophy className="w-5 h-5 text-white" />
          </div>
          <span className="font-black text-lg tracking-tight text-[var(--color-text-primary)]">FOOTBALL STOCK</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6">
          {navItems.filter(item => !item.hideInDesktopNav).map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-2 text-sm font-bold transition-all hover:text-primary relative",
                location.pathname === item.path ? "text-primary" : "text-[var(--color-text-secondary)]"
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute -top-3 -right-5 bg-red-500 text-white text-[12px] font-black px-1.5 py-0.5 rounded-full min-w-[24px] flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.8)] z-10 border-[3px] border-[var(--bento-bg)]">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </Link>
          ))}
          
          {/* Desktop Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button 
              onClick={() => setIsMoreOpen(!isMoreOpen)}
              className="flex items-center gap-1 text-sm font-bold text-[var(--color-text-secondary)] hover:text-primary transition-colors"
            >
              Еще <Menu className="w-4 h-4" />
            </button>
            {isMoreOpen && (
              <div className="absolute top-full right-0 mt-4 w-48 bento-glass p-2 z-50">
                <button
                  onClick={() => { toggleTheme(); setIsMoreOpen(false); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl text-sm font-medium text-[var(--color-text-primary)] hover:bg-black/5 dark:hover:bg-white/5 transition-all"
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  {theme === 'dark' ? 'Дневная тема' : 'Ночная тема'}
                </button>
                <div className="h-px bg-white/10 dark:bg-black/10 my-1 mx-2" />
                {navItems.filter(item => item.hideInDesktopNav).map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMoreOpen(false)}
                    className="flex items-center gap-3 p-3 rounded-xl text-sm font-medium text-[var(--color-text-primary)] hover:bg-black/5 dark:hover:bg-white/5 transition-all"
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {user ? (
            <button
              onClick={handleLogout}
              className="text-[var(--color-text-secondary)] hover:text-red-500 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          ) : (
            <Link
              to="/login"
              className="bg-primary text-white px-6 py-2 rounded-full text-sm font-bold hover:bg-primary-hover transition-all shadow-lg shadow-primary/20 backdrop-blur-md"
            >
              Войти
            </Link>
          )}
        </nav>

        {/* Mobile Menu Button */}
        <button id="mobile-menu-btn" className="md:hidden p-2 text-[var(--color-text-primary)]" onClick={() => setIsMenuOpen(!isMenuOpen)}>
          {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Mobile Nav Menu Dropdown */}
      {isMenuOpen && (
        <div ref={mobileMenuRef} className="md:hidden absolute top-[88px] left-4 right-4 z-[60] bento-glass p-4 space-y-2 animate-in slide-in-from-top-4">
          <button
            onClick={() => { toggleTheme(); setIsMenuOpen(false); }}
            className="flex items-center gap-4 p-4 w-full text-left text-[var(--color-text-primary)] font-bold rounded-2xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            {theme === 'dark' ? 'Дневная тема' : 'Ночная тема'}
          </button>
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setIsMenuOpen(false)}
              className={cn(
                "flex items-center gap-4 p-4 rounded-2xl text-base font-bold transition-all",
                location.pathname === item.path ? "bg-primary/10 text-primary" : "text-[var(--color-text-primary)] hover:bg-black/5 dark:hover:bg-white/5"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          ))}
          {user ? (
            <button
              onClick={handleLogout}
              className="flex items-center gap-4 p-4 w-full text-left text-red-500 font-bold rounded-2xl hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              Выйти
            </button>
          ) : (
            <Link
              to="/login"
              onClick={() => setIsMenuOpen(false)}
              className="flex items-center gap-4 p-4 w-full bg-primary text-white rounded-2xl font-bold justify-center"
            >
              Войти
            </Link>
          )}
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-2 md:px-6 overflow-y-auto relative z-10 custom-scrollbar pb-24 md:pb-6">
        {children}
      </main>

      {/* Bottom Nav (Mobile Only) */}
      <nav className="md:hidden bento-glass rounded-full mx-4 mb-4 mt-auto min-h-[64px] flex items-center justify-around px-2 z-50 shadow-2xl flex-shrink-0 fixed bottom-[env(safe-area-inset-bottom,0px)] left-0 right-0">
        {navItems.filter(item => !item.hideInBottomNav).map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "flex flex-col items-center gap-1 transition-all relative",
              location.pathname === item.path ? "text-primary scale-110" : "text-[var(--color-text-secondary)]"
            )}
          >
            <div className="relative">
              <item.icon className="w-6 h-6" />
              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute -top-2 -right-3 bg-red-500 text-white text-[12px] font-black px-1.5 py-0.5 rounded-full min-w-[24px] flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.8)] z-10 border-[3px] border-[var(--bento-bg)]">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </div>
            <span className="text-[10px] font-bold uppercase tracking-tighter">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
};

const CapacitorBackButtonHandler = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let listener: any;
    import('@capacitor/core').then(({ Capacitor }) => {
      if (Capacitor.isNativePlatform()) {
        import('@capacitor/app').then(({ App: CapacitorApp }) => {
          listener = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
            const event = new CustomEvent('capacitorBackButton', { cancelable: true });
            const notCanceled = window.dispatchEvent(event);
            
            if (!notCanceled) {
              return; // Modal closed its state, don't navigate
            }

            if (location.pathname === '/' || !canGoBack) {
              CapacitorApp.exitApp();
            } else {
              navigate(-1);
            }
          });
        });
      }
    });

    return () => {
      if (listener && typeof listener.remove === 'function') {
        listener.remove();
      }
    };
  }, [navigate, location]);

  return null;
};

export default function App() {
  return (
    <Router>
      <CapacitorBackButtonHandler />
      <Toaster 
        position="top-center" 
        richColors 
        duration={3000}
        toastOptions={{
          classNames: {
            toast: 'bento-glass border-2 border-white/20 dark:border-white/10 shadow-2xl backdrop-blur-xl bg-white/80 dark:bg-[#121212]/80',
            title: 'font-bold font-sans tracking-tight',
            description: 'font-medium opacity-90',
            actionButton: 'bg-primary text-white font-bold rounded-xl px-4 py-2 hover:bg-primary-hover transition-colors'
          }
        }}
      />
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chat/:chatId" element={<ChatPage />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/player/:uid" element={<PublicPlayerPage />} />
          <Route path="/team/:teamId" element={<PublicTeamPage />} />
          <Route path="/oauth-callback" element={<OAuthCallbackPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
        </Routes>
      </Layout>
    </Router>
  );
}
