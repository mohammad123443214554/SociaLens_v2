interface StatusDotProps {
  status: 'online' | 'active' | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE_CLASSES = {
  sm: 'h-2 w-2 border',
  md: 'h-2.5 w-2.5 border-2',
  lg: 'h-3.5 w-3.5 border-2',
}

// Positioned with a wrapping `relative` container around the avatar, e.g.:
//   <div className="relative">
//     <Avatar ... />
//     <StatusDot status={status} className="absolute bottom-0 right-0" />
//   </div>
export function StatusDot({ status, size = 'md', className = '' }: StatusDotProps) {
  if (!status) return null
  const color = status === 'online' ? 'bg-green-500' : 'bg-blue-500'
  return (
    <span
      className={`rounded-full border-background ${color} ${SIZE_CLASSES[size]} ${className}`}
      aria-label={status === 'online' ? 'Online' : 'Active'}
    />
  )
}
