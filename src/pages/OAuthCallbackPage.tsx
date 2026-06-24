import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../firebase';
import { getUserProfile, createUserProfile } from '../services/firebaseService';
import { UserRole } from '../types';
import { toast } from 'sonner';
import { Trophy, Loader2 } from 'lucide-react';
import { Browser } from '@capacitor/browser';

export default function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code || !state) {
      setErrorMsg('Некорректный запрос авторизации. Отсутствуют параметры code или state.');
      toast.error('Ошибка входа: неверные параметры');
      setTimeout(() => navigate('/login'), 3000);
      return;
    }

    const [provider, role, nonce] = state.split(':');

    if (!provider || !role || !nonce) {
      setErrorMsg('Некорректный формат параметра state.');
      toast.error('Ошибка входа: некорректный state');
      setTimeout(() => navigate('/login'), 3000);
      return;
    }

    // CSRF nonce verification
    const savedNonce = sessionStorage.getItem('oauth_nonce');
    sessionStorage.removeItem('oauth_nonce');
    if (!savedNonce || savedNonce !== nonce) {
      setErrorMsg('Ошибка безопасности: нарушение проверки CSRF (несовпадение токена сессии).');
      toast.error('Ошибка входа: нарушение безопасности CSRF');
      setTimeout(() => navigate('/login'), 4000);
      return;
    }

    const exchangeCode = async () => {
      try {
        const response = await fetch('/api/auth/callback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            provider,
            code,
            redirectUri: window.location.origin + '/oauth-callback',
          }),
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Не удалось выполнить обмен кода на токен');
        }

        const { customToken } = await response.json();

        // Sign in with Custom Token in Firebase
        const userCredential = await signInWithCustomToken(auth, customToken);
        const user = userCredential.user;

        // Process User Profile (Check if profile exists, otherwise create it)
        const profile = await getUserProfile(user.uid);
        if (!profile) {
          await createUserProfile(user, role as UserRole);
          toast.success('Профиль успешно создан!');
        } else {
          toast.success('С возвращением!');
        }

        try {
          await Browser.close();
        } catch (e) {}

        navigate('/profile');
      } catch (error: any) {
        console.error('OAuth exchange error:', error);
        setErrorMsg(error.message || 'Произошла ошибка во время авторизации.');
        toast.error(`Ошибка авторизации: ${error.message || 'Неизвестная ошибка'}`);
        try {
          await Browser.close();
        } catch (e) {}
        setTimeout(() => navigate('/login'), 4000);
      }
    };

    exchangeCode();
  }, [searchParams, navigate]);

  return (
    <div className="max-w-md mx-auto py-12 space-y-8 bento-glass p-8 mt-20 text-center relative flex flex-col items-center justify-center min-h-[300px]">
      <div className="inline-flex bg-primary/20 p-4 rounded-2xl mb-4 shadow-inner border border-primary/20">
        <Trophy className="w-8 h-8 text-primary animate-pulse" />
      </div>
      
      {!errorMsg ? (
        <div className="space-y-4">
          <h1 className="text-2xl font-black text-[var(--color-text-primary)] tracking-tight flex items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            Авторизация...
          </h1>
          <p className="text-[var(--color-text-secondary)] font-medium">
            Обмениваемся данными с провайдером для входа в систему
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <h1 className="text-2xl font-black text-red-500 tracking-tight">
            Ошибка авторизации
          </h1>
          <p className="text-[var(--color-text-secondary)] font-medium">
            {errorMsg}
          </p>
          <p className="text-xs text-[var(--color-text-secondary)] opacity-85 font-medium animate-pulse">
            Перенаправление на страницу входа через несколько секунд...
          </p>
        </div>
      )}
    </div>
  );
}
