import { auth } from '@clerk/nextjs/server';
import { Header } from '@/components/layout/Header';
import { Toaster } from '@/components/ui/Toaster';

export default async function WorkflowLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await auth.protect();

    return (
        <div className="h-screen flex flex-col">
            <Header />
            <main className="flex-1 overflow-hidden">{children}</main>
            <Toaster />
        </div>
    );
}
