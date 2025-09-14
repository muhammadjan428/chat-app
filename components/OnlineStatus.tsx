import { memo } from 'react';

interface OnlineStatusProps {
  isOnline: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const OnlineStatus = memo(({ 
  isOnline, 
  size = 'md', 
  className = '' 
}: OnlineStatusProps) => {
  const sizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  const borderClasses = {
    sm: 'border-2',
    md: 'border-2',
    lg: 'border-2'
  };

  return (
    <div 
      className={`${sizeClasses[size]} ${borderClasses[size]} rounded-full border-white ${
        isOnline 
          ? 'bg-green-400 shadow-sm' 
          : 'bg-gray-400'
      } ${className}`}
      title={isOnline ? 'Online' : 'Offline'}
    />
  );
});

OnlineStatus.displayName = 'OnlineStatus';

export default OnlineStatus;