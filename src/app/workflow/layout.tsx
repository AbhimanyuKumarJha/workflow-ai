'use client';

import { Header } from '@/components/layout/Header';
import { Toaster } from '@/components/ui/Toaster';

export default function WorkflowLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="h-screen flex flex-col">
            <Header />
            <main className="flex-1 overflow-hidden">{children}</main>
            <Toaster />
        </div>
    );
}
