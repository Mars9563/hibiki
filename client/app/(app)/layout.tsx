import { ReactNode } from 'react';

interface ChatLayoutProps {
  children: ReactNode;
}

export default async function AppLayout({ children }: ChatLayoutProps) {
  return <>{children}</>;
}
