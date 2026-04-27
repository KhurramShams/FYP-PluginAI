import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'outline';
  children: React.ReactNode;
}

export function Button({ variant = 'primary', children, className = '', ...props }: ButtonProps) {
  const baseClass = variant === 'primary' ? 'btn-primary' : 'btn-ghost';

  return (
    <button className={`${baseClass} ${className}`} {...props}>
      {children}
    </button>
  );
}
