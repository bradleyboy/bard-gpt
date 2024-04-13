import React, { Suspense } from 'react';

import './index.css';

export default function PageLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <main className="flex flex-col h-screen w-screen bg-gray-800 text-gray-50 overflow-hidden">
      <Suspense fallback={null}>{children}</Suspense>
    </main>
  );
}
