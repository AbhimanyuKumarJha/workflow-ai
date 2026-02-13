import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function Loading() {
    return (
        <div className="h-screen flex items-center justify-center bg-background">
            <LoadingSpinner size="lg" />
        </div>
    );
}
