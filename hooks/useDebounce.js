'use client';

import { useState, useEffect } from 'react';

/**
 * Custom hook to debounce any fast-changing value (e.g. search queries)
 * @param {any} value
 * @param {number} delay
 * @returns {any}
 */
export function useDebounce(value, delay = 250) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
