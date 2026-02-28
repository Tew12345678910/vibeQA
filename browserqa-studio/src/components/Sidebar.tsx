/**
 * Sidebar Component
 * Main navigation sidebar for the QA platform
 */

import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderKanban,
  Play,
  AlertCircle,
  Settings,
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle }) => {
  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/suites', icon: FolderKanban, label: 'Suites' },
    { to: '/runs', icon: Play, label: 'Runs' },
    { to: '/issues', icon: AlertCircle, label: 'Issues' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <aside
      className={`fixed left-0 top-0 h-full bg-slate-900 border-r border-slate-700 transition-all duration-300 z-50 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-700">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">QA</span>
            </div>
            <span className="text-white font-semibold">BrowserQA</span>
          </div>
        )}
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* New Run Button */}
      <div className="p-3">
        <NavLink
          to="/suites/new"
          className={`flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg py-2.5 px-3 transition-colors ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <Plus size={18} />
          {!collapsed && <span className="font-medium">New Suite</span>}
        </NavLink>
      </div>

      {/* Navigation */}
      <nav className="px-2 py-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-colors ${
                isActive
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              } ${collapsed ? 'justify-center' : ''}`
            }
          >
            <item.icon size={20} />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-700">
          <div className="text-xs text-slate-500">
            <p>BrowserQA Studio v1.0</p>
            <p className="mt-1">AI-Powered QA Testing</p>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
