export default function Loading() {
    return (
        <div className="h-screen flex items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-t-accent-purple border-border rounded-full animate-spin" />
                <p className="text-text-secondary">Loading...</p>
            </div>
        </div>
    );
}
