import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateChatId(uid1: string, uid2: string) {
  return [uid1, uid2].sort().join('_');
}
