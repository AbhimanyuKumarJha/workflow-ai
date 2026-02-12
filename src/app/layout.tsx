import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkClientProvider } from "@/components/providers/ClerkClientProvider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "Weavy Workflow Builder",
    description: "A pixel-perfect clone of Weavy.ai workflow builder focused on LLM workflows",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className="dark">
            <body className={inter.className}>
                <ClerkClientProvider>{children}</ClerkClientProvider>
            </body>
        </html>
    );
}
