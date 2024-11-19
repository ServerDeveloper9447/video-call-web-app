import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Meeting from './pages/Meeting';
import Home from './pages/Home';
import { useAuthStore } from './store/authStore';

function PrivateRoute({ children }) {
  const token = useAuthStore(state => state.token);
  return token ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={
          <PrivateRoute>
            <Home />
          </PrivateRoute>
        } />
        <Route path="/meeting/:roomId" element={
          <PrivateRoute>
            <Meeting />
          </PrivateRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}