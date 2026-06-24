import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export default function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const duration = 2000; // 2 seconds
    const interval = 20; // Update every 20ms
    const step = 100 / (duration / interval);

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          setTimeout(onComplete, 500); // Small delay before finishing
          return 100;
        }
        return prev + step;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[9999] bg-green-900 flex flex-col items-center justify-center text-white overflow-hidden">
      <div className="relative flex flex-col items-center gap-8">
        {/* Spinning Football */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="w-32 h-32 md:w-48 md:h-48 flex items-center justify-center"
        >
          <svg viewBox="0 0 24 24" className="w-full h-full text-white drop-shadow-2xl">
            <path
              fill="currentColor"
              d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4C13.4,4 14.7,4.4 15.8,5.1L13.5,7.4C13,7.1 12.5,7 12,7C11.5,7 11,7.1 10.5,7.4L8.2,5.1C9.3,4.4 10.6,4 12,4M4.4,8.2L6.7,10.5C6.4,11 6.3,11.5 6.3,12C6.3,12.5 6.4,13 6.7,13.5L4.4,15.8C4.1,14.7 4,13.4 4,12C4,10.6 4.1,9.3 4.4,8.2M12,9C13.7,9 15,10.3 15,12C15,13.7 13.7,15 12,15C10.3,15 9,13.7 9,12C9,10.3 10.3,9 12,9M19.6,8.2C19.9,9.3 20,10.6 20,12C20,13.4 19.9,14.7 19.6,15.8L17.3,13.5C17.6,13 17.7,12.5 17.7,12C17.7,11.5 17.6,11 17.3,10.5L19.6,8.2M8.2,18.9L10.5,16.6C11,16.9 11.5,17 12,17C12.5,17 13,16.9 13.5,16.6L15.8,18.9C14.7,19.6 13.4,20 12,20C10.6,20 9.3,19.6 8.2,18.9Z"
            />
          </svg>
        </motion.div>

        {/* Brand Name */}
        <div className="text-center space-y-2">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-black tracking-tighter"
          >
            FOOTBALL STOCK
          </motion.h1>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-green-400 font-mono text-xl"
          >
            {Math.round(progress)}%
          </motion.div>
        </div>

        {/* Progress Bar */}
        <div className="w-64 h-1.5 bg-green-800 rounded-full overflow-hidden mt-4">
          <motion.div
            className="h-full bg-orange-500"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-green-600/20 blur-[120px] rounded-full pointer-events-none" />
    </div>
  );
}
