import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="h-12 px-8 flex items-center justify-between bg-white border-t border-gray-100 text-xs text-brand-muted shrink-0">
      <span>© 2026 3CORE. All rights reserved.</span>
      <span className="hidden sm:inline">Built for modern restaurant dashboards.</span>
    </footer>
  );
};

