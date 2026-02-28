/**
 * BrowserQA Studio - Main Application
 * AI-Powered QA Testing Platform
 */

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

// Layout
import Sidebar from './components/Sidebar';

// Pages
import Dashboard from './pages/Dashboard';
import SuiteList from './pages/SuiteList';
import SuiteDetail from './pages/SuiteDetail';
import SuiteForm from './pages/SuiteForm';
import RunDetail from './pages/RunDetail';
import Runs from './pages/Runs';
import Issues from './pages/Issues';
import Settings from './pages/Settings';

// Styles
import './App.css';

const App: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Initialize demo data on first load
  useEffect(() => {
    // Check if we need to generate demo data
    const hasData = localStorage.getItem('browserqa_suites');
    if (!hasData) {
      // Import and run demo data generator
      import('./lib/store').then(({ generateDemoData }) => {
        generateDemoData();
      });
    }
  }, []);

  return (
    <Router>
      <div className="min-h-screen bg-slate-950 text-white">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        <main
          className={`transition-all duration-300 ${
            sidebarCollapsed ? 'ml-16' : 'ml-64'
          }`}
        >
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/suites" element={<SuiteList />} />
            <Route path="/suites/new" element={<SuiteForm />} />
            <Route path="/suites/:id" element={<SuiteDetail />} />
            <Route path="/suites/:id/run" element={<SuiteDetail />} />
            <Route path="/runs" element={<Runs />} />
            <Route path="/runs/:id" element={<RunDetail />} />
            <Route path="/issues" element={<Issues />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App;
