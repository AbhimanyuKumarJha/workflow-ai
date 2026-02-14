import { useEffect } from 'react';

type ShortcutHandler = (event: KeyboardEvent) => void;
type ShortcutMap = Record<string, ShortcutHandler>;

function normalizeShortcut(event: KeyboardEvent): string {
    const parts = [
        event.ctrlKey ? 'ctrl' : '',
        event.metaKey ? 'meta' : '',
        event.altKey ? 'alt' : '',
        event.shiftKey ? 'shift' : '',
        event.key.toLowerCase(),
    ].filter(Boolean);

    return parts.join('+');
}

export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const normalized = normalizeShortcut(event);
            const handler = shortcuts[normalized] ?? shortcuts[event.key.toLowerCase()];

            if (handler) {
                handler(event);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [shortcuts]);
}
