/**
 * Status Badge Component
 * Displays status with appropriate colors
 */

import React from 'react';
import { RunStatus } from '../../types/schema';

interface StatusBadgeProps {
  status: RunStatus;
  size?: 'sm' | 'md' | 'lg';
}

const statusConfig: Record<RunStatus, { color: string; bg: string; label: string }> = {
  pending: {
    color: 'text-slate-400',
    bg: 'bg-slate-500/20',
    label: 'Pending',
  },
  running: {
    color: 'text-blue-400',
    bg: 'bg-blue-500/20',
    label: 'Running',
  },
  passed: {
    color: 'text-green-400',
    bg: 'bg-green-500/20',
    label: 'Passed',
  },
  failed: {
    color: 'text-red-400',
    bg: 'bg-red-500/20',
    label: 'Failed',
  },
  canceled: {
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/20',
    label: 'Canceled',
  },
};

const sizeClasses = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-1',
  lg: 'text-base px-3 py-1.5',
};

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const config = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${config.bg} ${config.color} ${sizeClasses[size]}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          status === 'running'
            ? 'bg-blue-400 animate-pulse'
            : status === 'passed'
            ? 'bg-green-400'
            : status === 'failed'
            ? 'bg-red-400'
            : status === 'pending'
            ? 'bg-slate-400'
            : 'bg-yellow-400'
        }`}
      />
      {config.label}
    </span>
  );
};

export default StatusBadge;
