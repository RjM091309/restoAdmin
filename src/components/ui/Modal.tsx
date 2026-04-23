import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl';
  containerClassName?: string;
  /** Merged onto the white panel (motion.div). */
  panelClassName?: string;
  /** Merged onto the modal title (h3). */
  titleClassName?: string;
  /** Merged onto the scrollable body wrapper. */
  bodyClassName?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = 'md',
  containerClassName,
  panelClassName,
  titleClassName,
  bodyClassName,
}) => {
  const { t } = useTranslation();
  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const maxWidthClass = {
    'sm': 'max-w-sm',
    'md': 'max-w-md',
    'lg': 'max-w-lg',
    'xl': 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
    '6xl': 'max-w-6xl',
  }[maxWidth];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
          />

          {/* Modal Container */}
          <div
            className={cn(
              'fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none',
              containerClassName
            )}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className={cn(
                'bg-white rounded-3xl shadow-2xl w-full flex flex-col max-h-[90vh] pointer-events-auto border border-gray-100',
                maxWidthClass,
                panelClassName
              )}
            >
              {/* Header */}
              <div className="flex items-start gap-3 justify-between px-6 py-5 border-b border-gray-100 shrink-0">
                <h3
                  className={cn(
                    'text-xl font-bold text-brand-text tracking-tight pr-2 flex-1 min-w-0',
                    titleClassName
                  )}
                >
                  {title}
                </h3>
                <button
                  type="button"
                  onClick={onClose}
                  title={t('common.close')}
                  className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-gray-50 text-brand-muted hover:bg-red-50 hover:text-red-500 transition-colors shadow-sm"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div
                className={cn(
                  'px-6 py-6 overflow-y-auto custom-scrollbar flex-1 min-h-0',
                  bodyClassName
                )}
              >
                {children}
              </div>

              {/* Footer */}
              {footer && (
                <div className="px-6 py-5 border-t border-gray-100 bg-gray-50/50 rounded-b-3xl shrink-0">
                  {footer}
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};
