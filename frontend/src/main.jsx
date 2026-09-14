import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './styles/global.css';

import { AuthProvider } from './AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Nav from './components/Nav.jsx';

import Login    from './pages/Login.jsx';
import MapPage  from './pages/Map.jsx';
import Alerts   from './pages/Alerts.jsx';
import Search   from './pages/Search.jsx';
import RoutePage from './pages/Route.jsx';
import Watchlist from './pages/Watchlist.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Shell />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

/** Shell keeps the map always mounted. Non-map pages layer above it. */
function Shell() {
  return (
    <div className="app-shell">
      <Nav />
      <div className="app-body">
        <Routes>
          <Route path="/"          element={<Navigate to="/map" replace />} />
          <Route path="/map"       element={<MapPage />} />
          <Route path="/alerts"    element={<Alerts />} />
          <Route path="/search"    element={<Search />} />
          <Route path="/route"     element={<RoutePage />} />
          <Route path="/watchlist" element={
            <ProtectedRoute roles={['admin']}>
              <Watchlist />
            </ProtectedRoute>
          } />
        </Routes>
      </div>
    </div>
  );
}
