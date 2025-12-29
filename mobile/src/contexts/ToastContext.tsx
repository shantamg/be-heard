/**
 * Toast Context for Meet Without Fear Mobile
 *
 * Provides a global toast notification system for showing in-app notifications.
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Toast, ToastAction } from '../components/Toast';

// ============================================================================
// Types
// ============================================================================

export interface ToastData {
  id: string;
  title: string;
  body?: string;
  action?: ToastAction;
  variant?: 'default' | 'success' | 'error' | 'warning';
  duration?: number;
}

export type ShowToastOptions = Omit<ToastData, 'id'>;

export interface ToastContextValue {
  /** Show a toast notification */
  showToast: (options: ShowToastOptions) => string;
  /** Show a success toast */
  showSuccess: (title: string, body?: string) => string;
  /** Show an error toast */
  showError: (title: string, body?: string) => string;
  /** Show a warning toast */
  showWarning: (title: string, body?: string) => string;
  /** Hide a specific toast by ID */
  hideToast: (id: string) => void;
  /** Hide all toasts */
  hideAllToasts: () => void;
}

// ============================================================================
// Context
// ============================================================================

const ToastContext = createContext<ToastContextValue | null>(null);

// ============================================================================
// Provider Component
// ============================================================================

interface ToastProviderProps {
  children: ReactNode;
  /** Maximum number of toasts to show at once (default: 3) */
  maxToasts?: number;
}

/**
 * Toast provider component.
 *
 * Wrap your app with this provider to enable toast notifications.
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <ToastProvider>
 *       <YourApp />
 *     </ToastProvider>
 *   );
 * }
 * ```
 */
export function ToastProvider({ children, maxToasts = 3 }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const showToast = useCallback(
    (options: ShowToastOptions): string => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      setToasts((prev) => {
        // Limit number of toasts
        const existingToasts = prev.length >= maxToasts ? prev.slice(1) : prev;
        return [...existingToasts, { ...options, id }];
      });

      return id;
    },
    [maxToasts]
  );

  const showSuccess = useCallback(
    (title: string, body?: string): string => {
      return showToast({ title, body, variant: 'success' });
    },
    [showToast]
  );

  const showError = useCallback(
    (title: string, body?: string): string => {
      return showToast({ title, body, variant: 'error', duration: 8000 });
    },
    [showToast]
  );

  const showWarning = useCallback(
    (title: string, body?: string): string => {
      return showToast({ title, body, variant: 'warning' });
    },
    [showToast]
  );

  const hideToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const hideAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const contextValue: ToastContextValue = {
    showToast,
    showSuccess,
    showError,
    showWarning,
    hideToast,
    hideAllToasts,
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {toasts.map((toast, index) => (
        <Toast
          key={toast.id}
          title={toast.title}
          body={toast.body}
          action={toast.action}
          variant={toast.variant}
          duration={toast.duration}
          onDismiss={() => hideToast(toast.id)}
        />
      ))}
    </ToastContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access toast context.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { showToast, showSuccess, showError } = useToast();
 *
 *   const handleSubmit = async () => {
 *     try {
 *       await submitForm();
 *       showSuccess('Saved!', 'Your changes have been saved.');
 *     } catch (error) {
 *       showError('Error', 'Failed to save changes.');
 *     }
 *   };
 *
 *   return <Button onPress={handleSubmit} title="Submit" />;
 * }
 * ```
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  return context;
}
