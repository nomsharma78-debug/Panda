'use client';

import { useEffect } from 'react';

/**
 * ContentProtection Component
 * Hardens the UI against text selection, element dragging, right-click context menus,
 * and DevTools keyboard shortcuts.
 */
export function ContentProtection() {
  useEffect(() => {
    // 1. Disable Right Click Context Menu
    const handleContextMenu = (e) => {
      e.preventDefault();
      return false;
    };

    // 2. Disable Dragging of text, images, and elements
    const handleDragStart = (e) => {
      e.preventDefault();
      return false;
    };

    // 3. Disable Copy outside of editable inputs
    const handleCopy = (e) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.isContentEditable);

      if (!isInput) {
        e.preventDefault();
        return false;
      }
    };

    // 4. Disable DevTools & Inspect Shortcuts
    const handleKeyDown = (e) => {
      if (!e) return;
      const isMac = typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
      const rawKey = e.key || '';
      const key = typeof rawKey === 'string' ? rawKey.toUpperCase() : '';

      // F12 (DevTools)
      if (rawKey === 'F12' || e.keyCode === 123) {
        e.preventDefault();
        return false;
      }

      // Ctrl+Shift+I / Cmd+Opt+I (Inspect Element)
      if (isCtrlOrCmd && e.shiftKey && key === 'I') {
        e.preventDefault();
        return false;
      }

      // Ctrl+Shift+J / Cmd+Opt+J (Console)
      if (isCtrlOrCmd && e.shiftKey && key === 'J') {
        e.preventDefault();
        return false;
      }

      // Ctrl+Shift+C / Cmd+Opt+C (Element Picker)
      if (isCtrlOrCmd && e.shiftKey && key === 'C') {
        e.preventDefault();
        return false;
      }

      // Ctrl+U / Cmd+Opt+U (View Page Source)
      if (isCtrlOrCmd && key === 'U') {
        e.preventDefault();
        return false;
      }

      // Ctrl+S / Cmd+S (Save Webpage)
      if (isCtrlOrCmd && key === 'S') {
        e.preventDefault();
        return false;
      }

      // Ctrl+A / Cmd+A (Select All outside inputs)
      if (isCtrlOrCmd && key === 'A') {
        const activeEl = document.activeElement;
        const isInput =
          activeEl &&
          (activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            activeEl.isContentEditable);

        if (!isInput) {
          e.preventDefault();
          return false;
        }
      }
    };

    document.addEventListener('contextmenu', handleContextMenu, { capture: true });
    document.addEventListener('dragstart', handleDragStart, { capture: true });
    document.addEventListener('copy', handleCopy, { capture: true });
    window.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu, { capture: true });
      document.removeEventListener('dragstart', handleDragStart, { capture: true });
      document.removeEventListener('copy', handleCopy, { capture: true });
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, []);

  return null;
}
