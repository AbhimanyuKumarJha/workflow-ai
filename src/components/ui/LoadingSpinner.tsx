interface LoadingSpinnerProps {
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

export function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
    const sizeClasses = {
        sm: 'h-4 w-4 border-2',
        md: 'h-8 w-8 border-[3px]',
        lg: 'h-12 w-12 border-4',
    };

    return (
        <div className={`inline-flex items-center justify-center ${className}`}>
            <div
                className={`${sizeClasses[size]} rounded-full border-gray-700 border-t-purple-500 animate-spin`}
            />
        </div>
    );
}
