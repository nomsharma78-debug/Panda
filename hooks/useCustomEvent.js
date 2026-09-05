'use client';

import { useEffect, useRef } from 'react';

/**
 * Custom hook to safely attach a window event listener and clean up on unmount.
 * @param {string} eventName
 * @param {Function} handler
 */
export function useCustomEvent(eventName, handler) {
  const savedHandler = useRef(handler);

  useEffect(() => {
    savedHandler.current = handler;
  }, [handler]);

  useEffect(() => {
    if (typeof window === 'undefined' || !eventName) return;

    const eventListener = (event) => {
      if (savedHandler.current) {
        savedHandler.current(event.detail, event);
      }
    };

    window.addEventListener(eventName, eventListener);
    return () => {
      window.removeEventListener(eventName, eventListener);
    };
  }, [eventName]);
}
