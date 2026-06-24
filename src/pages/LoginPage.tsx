import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Trophy, Users, ShieldCheck, Phone, KeyRound, ArrowLeft, MessageCircle, Search, MessageSquare } from 'lucide-react';
import { 
  setupRecaptcha, 
  sendPhoneSMS, 
  verifyPhoneCode, 
  createUserProfile, 
  getUserProfile,
  signInWithOidc
} from '../services/firebaseService';
import { UserRole } from '../types';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { ConfirmationResult } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

const generateNonce = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export default function LoginPage() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<any>(null);
  const [isCodeSent, setIsCodeSent] = useState(false);
  
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  
  useEffect(() => {
    if (!authLoading && user && profile) {
      navigate('/profile');
    }
  }, [user, profile, authLoading, navigate]);

  useEffect(() => {
    import('@capacitor/core').then(({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) {
        if ((window as any).recaptchaVerifier) {
          try {
            (window as any).recaptchaVerifier.clear();
          } catch (e) {}
          (window as any).recaptchaVerifier = null;
        }
        setupRecaptcha('recaptcha-wrapper');
      }
    });

    return () => {
      if ((window as any).recaptchaVerifier) {
        try {
          (window as any).recaptchaVerifier.clear();
        } catch (e) {}
        (window as any).recaptchaVerifier = null;
      }
    };
  }, []);

  const handleCreateMissingProfile = async (selectedRole: UserRole) => {
    if (!user) return;
    setLoading(true);
    try {
      await processUser(user, selectedRole);
    } catch (e) {
      toast.error('Ошибка создания профиля');
    } finally {
      // setLoading(false)
    }
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role) {
      toast.error('Пожалуйста, выберите роль');
      return;
    }
    if (!phoneNumber || phoneNumber.length < 10) {
      toast.error('Введите корректный номер телефона (например, +79991234567)');
      return;
    }
    
    // Auto-prepend + if missed for simple validation
    const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

    setLoading(true);
    try {
      const { Capacitor } = await import('@capacitor/core');
      let verifier = null;
      
      if (!Capacitor.isNativePlatform()) {
        verifier = (window as any).recaptchaVerifier;
        if (!verifier) {
           verifier = setupRecaptcha('recaptcha-wrapper');
        }
      }
      
      const result = await sendPhoneSMS(formattedPhone, verifier);
      setConfirmationResult(result);
      if (result.autoVerified) {
        toast.success('Успешный вход!');
        // onAuthStateChanged in App.tsx or useAuth will handle redirect
      } else {
        setIsCodeSent(true);
        toast.success('Код отправлен по SMS');
      }
    } catch (error: any) {
      if (!error.message?.includes('element has been removed') && error.message) {
        // Continue but handle retry logic better
      }
      // Retry once with a fresh recaptcha if not native
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) {
        if (error.message?.includes('element has been removed') || error.message?.includes('element has been missing') || error.message?.includes('reCAPTCHA')) {
          try {
            if ((window as any).recaptchaVerifier) {
              try { (window as any).recaptchaVerifier.clear(); } catch(e) {}
              (window as any).recaptchaVerifier = null;
            }
            const freshVerifier = setupRecaptcha('recaptcha-wrapper');
            const retryResult = await sendPhoneSMS(formattedPhone, freshVerifier);
            setConfirmationResult(retryResult);
            setIsCodeSent(true);
            toast.success('Код отправлен по SMS');
            setLoading(false);
            return;
          } catch (retryError: any) {
            error = retryError;
          }
        }

        // If error occurs, reset recaptcha so user can try again
        if ((window as any).recaptchaVerifier) {
          try {
            (window as any).recaptchaVerifier.clear();
          } catch(e) {}
          (window as any).recaptchaVerifier = null;
          setupRecaptcha('recaptcha-wrapper');
        }
      }

      if (error.code === 'auth/app-not-authorized' || error.message?.includes('not authorized')) {
        toast.error('Приложение не авторизовано. Проверьте настройки Firebase.');
      } else {
        toast.error(error.message || 'Ошибка отправки SMS. Попробуйте еще раз.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmationResult) return;
    if (!verificationCode || verificationCode.length < 4) {
      toast.error('Введите код из SMS');
      return;
    }

    setLoading(true);
    try {
      const user = await verifyPhoneCode(confirmationResult, verificationCode);
      await processUser(user, role!);
    } catch (error: any) {
      toast.error(error.message || 'Неверный код или ошибка сервера');
      setLoading(false);
    }
  };

  const processUser = async (user: any, selectedRole: UserRole) => {
    try {
      const existingProfile = await getUserProfile(user.uid);
      if (!existingProfile) {
        await createUserProfile(user, selectedRole);
        toast.success('Профиль создан!');
      } else {
        toast.success('С возвращением!');
      }
      navigate('/profile');
    } catch (error) {
      toast.error('Ошибка создания профиля: ' + (error as Error).message);
      setLoading(false); // only finish loading if it errors, otherwise let it navigate while spinning
    }
  };

  const handleOAuthLogin = async (provider: 'vk' | 'yandex') => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/config');
      if (!response.ok) {
        throw new Error('Не удалось получить конфигурацию авторизации с сервера');
      }
      const config = await response.json();
      const redirectUri = window.location.origin + '/oauth-callback';
      
      // Generate and save a CSRF validation nonce
      const nonce = generateNonce();
      sessionStorage.setItem('oauth_nonce', nonce);
      const state = `${provider}:${role}:${nonce}`;

      let authUrl = '';
      if (provider === 'vk') {
        if (!config.vkClientId) {
          toast.error('Авторизация через ВКонтакте не настроена (отсутствует VK_CLIENT_ID на сервере).');
          setLoading(false);
          return;
        }
        authUrl = `https://oauth.vk.com/authorize?client_id=${config.vkClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&display=page&scope=email&response_type=code&v=5.131&state=${state}`;
      } else if (provider === 'yandex') {
        if (!config.yandexClientId) {
          toast.error('Авторизация через Яндекс не настроена (отсутствует YANDEX_CLIENT_ID на сервере).');
          setLoading(false);
          return;
        }
        authUrl = `https://oauth.yandex.ru/authorize?response_type=code&client_id=${config.yandexClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
      }

      if (authUrl) {
        if (Capacitor.isNativePlatform()) {
          // Open in Capacitor In-App Browser overlay
          await Browser.open({ url: authUrl });
        } else {
          // Open in same tab for Web
          window.location.href = authUrl;
        }
      }
    } catch (e: any) {
      toast.error(`Ошибка при запуске авторизации: ${e.message || 'Неизвестная ошибка'}`);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-12 space-y-8 bento-glass p-8 mt-10 relative">
      {/* Hidden button to hook reCAPTCHA */}
      <div id="recaptcha-wrapper"></div>
      
      {role && (
        <button 
          onClick={() => {
            setRole(null);
            setConfirmationResult(null);
            setIsCodeSent(false);
            setPhoneNumber('');
            setVerificationCode('');
          }}
          className="absolute top-6 left-6 text-[var(--color-text-secondary)] hover:text-primary transition-colors flex items-center gap-2"
        >
          <ArrowLeft className="w-5 h-5" /> 
        </button>
      )}

      <div className="text-center space-y-2">
        <div className="inline-flex bg-primary/20 p-4 rounded-2xl mb-4 shadow-inner border border-primary/20 mt-4">
          <Trophy className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-black text-[var(--color-text-primary)] tracking-tight">Вход в систему</h1>
        {!role ? (
          <p className="text-[var(--color-text-secondary)] font-medium">Выберите вашу роль для продолжения</p>
        ) : (
          <p className="text-[var(--color-text-secondary)] font-medium">
            {role === 'player' ? 'Футболист' : 'Менджер'} · Вход по номеру
          </p>
        )}
      </div>

      {!role ? (
        <div className="grid gap-4">
          <button
            onClick={() => {
              setRole('player');
              if (user && !profile) handleCreateMissingProfile('player');
            }}
            className="p-6 rounded-3xl border-2 transition-all text-left flex items-center gap-4 group bento-hover border-white/10 bg-black/5 dark:bg-white/5 hover:border-primary/50"
          >
            <div className="p-3 rounded-xl transition-colors bg-black/10 dark:bg-white/10 text-[var(--color-text-secondary)] group-hover:text-primary group-hover:bg-primary/20">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="font-black text-lg text-[var(--color-text-primary)]">Я футболист</div>
              <div className="text-sm text-[var(--color-text-secondary)] font-medium">Ищу команду для игр и турниров</div>
            </div>
          </button>

          <button
            onClick={() => {
              setRole('manager');
              if (user && !profile) handleCreateMissingProfile('manager');
            }}
            className="p-6 rounded-3xl border-2 transition-all text-left flex items-center gap-4 group bento-hover border-white/10 bg-black/5 dark:bg-white/5 hover:border-primary/50"
          >
            <div className="p-3 rounded-xl transition-colors bg-black/10 dark:bg-white/10 text-[var(--color-text-secondary)] group-hover:text-primary group-hover:bg-primary/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="font-black text-lg text-[var(--color-text-primary)]">Я менеджер</div>
              <div className="text-sm text-[var(--color-text-secondary)] font-medium">Ищу игроков для усиления команды</div>
            </div>
          </button>
        </div>
      ) : (
        <div className="space-y-6 slide-in-top">
          {!isCodeSent ? (
            <div className="space-y-6">
              <form onSubmit={handleSendCode} className="space-y-4">
                <label className="flex items-center gap-3 p-4 rounded-2xl bg-black/5 dark:bg-white/5 border-2 border-transparent focus-within:border-primary transition-colors">
                  <Phone className="w-5 h-5 text-[var(--color-text-secondary)]" />
                  <input 
                     type="tel" 
                     value={phoneNumber} 
                     onChange={(e) => setPhoneNumber(e.target.value)} 
                     placeholder="+7 999 123 45 67" 
                     required
                     className="bg-transparent border-none outline-none text-[var(--color-text-primary)] font-medium w-full"
                  />
                </label>
                <button
                  type="submit"
                  disabled={loading}
                  className="bento-button w-full py-4 text-lg"
                >
                  {loading ? 'Отправка...' : 'Получить код'}
                </button>
              </form>

              {/* Other Login Methods */}
              <div className="relative mt-8">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-black/5 dark:border-white/5"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-[var(--bento-bg)] text-[var(--color-text-secondary)] font-bold uppercase tracking-widest text-[10px]">
                    или войти через
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {/* VK */}
                <button
                  onClick={() => handleOAuthLogin('vk')}
                  className="flex flex-col items-center justify-center py-3 gap-2 rounded-2xl bg-[#0077FF]/10 text-[#0077FF] hover:bg-[#0077FF]/20 transition-colors group"
                  title="ВКонтакте"
                >
                  <svg className="w-6 h-6 group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="currentColor">
                    <path d="m9.489.004.729-.003h3.564l.73.003.914.01.433.007.418.011.403.014.388.016.374.021.36.025.345.03.333.033c1.74.196 2.933.616 3.833 1.516.9.9 1.32 2.092 1.516 3.833l.034.333.029.346.025.36.02.373.025.588.012.41.013.644.009.915.004.98-.001 3.313-.003.73-.01.914-.007.433-.011.418-.014.403-.016.388-.021.374-.025.36-.03.345-.033.333c-.196 1.74-.616 2.933-1.516 3.833-.9.9-2.092 1.32-3.833 1.516l-.333.034-.346.029-.36.025-.373.02-.588.025-.41.012-.644.013-.915.009-.98.004-3.313-.001-.73-.003-.914-.01-.433-.007-.418-.011-.403-.014-.388-.016-.374-.021-.36-.025-.345-.03-.333-.033c-1.74-.196-2.933-.616-3.833-1.516-.9-.9-1.32-2.092-1.516-3.833l-.034-.333-.029-.346-.025-.36-.02-.373-.025-.588-.012-.41-.013-.644-.009-.915-.004-.98.001-3.313.003-.73.01-.914.007-.433.011-.418.014-.403.016-.388.021-.374.025-.36.03-.345.033-.333c.196-1.74.616-2.933 1.516-3.833.9-.9 2.092-1.32 3.833-1.516l.333-.034.346-.029.36-.025.373-.02.588-.025.41-.012.644-.013.915-.009ZM6.79 7.3H4.05c.13 6.24 3.25 9.99 8.72 9.99h.31v-3.57c2.01.2 3.53 1.67 4.14 3.57h2.84c-.78-2.84-2.83-4.41-4.11-5.01 1.28-.74 3.08-2.54 3.51-4.98h-2.58c-.56 1.98-2.22 3.78-3.8 3.95V7.3H10.5v6.92c-1.6-.4-3.62-2.34-3.71-6.92Z"/>
                  </svg>
                  <span className="text-[10px] font-bold uppercase tracking-widest">VK</span>
                </button>

                {/* Yandex */}
                <button
                  onClick={() => handleOAuthLogin('yandex')}
                  className="flex flex-col items-center justify-center py-3 gap-2 rounded-2xl bg-[#FF0000]/10 text-[#FF0000] hover:bg-[#FF0000]/20 transition-colors group"
                  title="Яндекс"
                >
                  <svg className="w-6 h-6 group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 24C18.6274 24 24 18.6274 24 12C24 5.37258 18.6274 0 12 0C5.37258 0 0 5.37258 0 12C0 18.6274 5.37258 24 12 24Z" />
                    <path fillRule="evenodd" clipRule="evenodd" d="M14.9657 5.09998H11.5303C9.40058 5.09998 8.01633 6.20846 8.01633 7.8252C8.01633 9.47952 9.17637 10.5286 11.2335 10.5286H12.9841L12.9659 13.5H9.76008V15.749H12.9659V19.1415L15.3402 19.1232L15.3584 5.09998H14.9657ZM12.9841 8.87113H11.4589C10.5401 8.87113 10.0357 8.4116 10.0357 7.8184C10.0357 7.23419 10.531 6.75653 11.4589 6.75653H12.9841V8.87113Z" fill="white"/>
                  </svg>
                  <span className="text-[10px] font-bold uppercase tracking-widest">Yandex</span>
                </button>

                {/* Messenger Max */}
                <button
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const result = await signInWithOidc('oidc.messenger-max');
                      await processUser(result, role!);
                    } catch (e: any) {
                      toast.error('Мессенджер макс: необходимо настроить OAuth-провайдер oidc.messenger-max в консоли Firebase.');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="flex flex-col items-center justify-center py-3 gap-2 rounded-2xl bg-[#0088cc]/10 text-[#0088cc] hover:bg-[#0088cc]/20 transition-colors group"
                  title="Мессенджер макс"
                >
                  <svg className="w-6 h-6 group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.94z"/>
                  </svg>
                  <span className="text-[10px] font-bold uppercase tracking-widest">Max</span>
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <label className="flex items-center gap-3 p-4 rounded-2xl bg-black/5 dark:bg-white/5 border-2 border-transparent focus-within:border-primary transition-colors">
                <KeyRound className="w-5 h-5 text-[var(--color-text-secondary)]" />
                <input 
                   type="text" 
                   value={verificationCode} 
                   onChange={(e) => setVerificationCode(e.target.value)} 
                   placeholder="Код из SMS" 
                   required
                   className="bg-transparent border-none outline-none text-[var(--color-text-primary)] font-medium w-full tracking-widest"
                />
              </label>
              <button
                type="submit"
                disabled={loading}
                className="bento-button w-full py-4 text-lg"
              >
                {loading ? 'Проверка...' : 'Подтвердить код'}
              </button>
            </form>
          )}
        </div>
      )}

      <p className="text-center text-[10px] sm:text-xs text-[var(--color-text-secondary)] font-bold uppercase tracking-widest leading-relaxed mt-8">
        Продолжая, вы соглашаетесь с <br />
        <Link to="/terms" className="text-primary hover:underline">Условиями использования</Link> и <Link to="/privacy" className="text-primary hover:underline">Политикой конфиденциальности</Link>
      </p>
    </div>
  );
}
