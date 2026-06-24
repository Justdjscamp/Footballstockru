import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { saveFcmToken } from '../services/firebaseService';
import { User } from 'firebase/auth';

export const usePushNotifications = (user: User | null) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    
    import('@capacitor/core').then(({ Capacitor }) => {
      if (Capacitor.isNativePlatform()) {
        import('@capacitor/push-notifications').then(({ PushNotifications }) => {
          PushNotifications.requestPermissions().then(result => {
            if (result.receive === 'granted') {
              PushNotifications.register();
            }
          });

          PushNotifications.addListener('registration', (token) => {
            localStorage.setItem('fcm_token', token.value);
            saveFcmToken(user.uid, token.value);
          });

          PushNotifications.addListener('pushNotificationReceived', (notification) => {
            toast(notification.title || 'Новое уведомление', {
              description: notification.body,
            });
          });

          PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
            const data = notification.notification.data;
            if (data?.requestId || data?.chatId) {
              navigate('/chat');
            }
          });
        }).catch(e => console.error("Push init error:", e));
      }
    });

    return () => {
      import('@capacitor/core').then(({ Capacitor }) => {
        if (Capacitor.isNativePlatform()) {
          import('@capacitor/push-notifications').then(({ PushNotifications }) => {
            PushNotifications.removeAllListeners();
          }).catch(() => {});
        }
      });
    };
  }, [user, navigate]);
};
