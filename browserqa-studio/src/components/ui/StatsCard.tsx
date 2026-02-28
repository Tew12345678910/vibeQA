/**
 * Stats Card Component
 * Displays statistics on the dashboard
 */

import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: 'blue' | 'green' | 'red' | 'purple' | 'yellow';
}

const colorClasses = {
  blue: {
    bg: 'bg-blue-500/20',
    text: 'text-blue-400',
    icon: 'bg-blue-500/30',
  },
  green: {
    bg: 'bg-green-500/20',
    text: 'text-green-400',
    icon: 'bg-green-500/30',
  },
  red: {
    bg: 'bg-red-500/20',
    text: 'text-red-400',
    icon: 'bg-red-500/30',
  },
  purple: {
    bg: 'bg-purple-500/20',
    text: 'text-purple-400',
    icon: 'bg-purple-500/30',
  },
  yellow: {
    bg: 'bg-yellow-500/20',
    text: 'text-yellow-400',
    icon: 'bg-yellow-500/30',
  },
};

const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  color = 'blue',
}) => {
  const colors = colorClasses[color];

  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-400 text-sm font-medium">{title}</p>
          <p className="text-3xl font-bold text-white mt-2">{value}</p>
          {subtitle && (
            <p className="text-slate-500 text-sm mt-1">{subtitle}</p>
          )}
          {trend && (
            <p
              className={`text-sm mt-2 ${
                trend.isPositive ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
              <span className="text-slate-500 ml-1">vs last week</span>
            </p>
          )}
        </div>
        <div className={`p-3 rounded-xl ${colors.icon}`}>
          <Icon className={colors.text} size={24} />
        </div>
      </div>
    </div>
  );
};

export default StatsCard;
