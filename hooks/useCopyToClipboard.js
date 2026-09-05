'use client';

import { useState, useCallback } from 'react';

/**
 * Custom hook to safely copy text to clipboard with automatic status reset.
 * @param {number} [resetTimeout=2000]
 * @returns {[boolean, Function]} [isCopied, copyFn]
 */
export function useCopyToClipboard(resetTimeout = 2000) {
  const [isCopied, setIsCopied] = useState(false);

  const copyToClipboard = useCallback(
    async (text) => {
      if (!text) return false;
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(String(text));
        } else {
          // Fallback for non-secure contexts
          const textarea = document.createElement('textarea');
          textarea.value = String(text);
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), resetTimeout);
        return true;
      } catch (err) {
        console.warn('Failed to copy to clipboard:', err);
        return false;
      }
    },
    [resetTimeout]
  );

  return [isCopied, copyToClipboard];
}
