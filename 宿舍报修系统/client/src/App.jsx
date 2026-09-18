import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import { useSharedConfig } from './hooks/useSharedConfig';
import DormManagerPage from './pages/DormManagerPage';
import HomePage from './pages/HomePage';
import StudentPage from './pages/StudentPage';

export default function App() {
  const { config } = useSharedConfig();

  return (
    <BrowserRouter>
      <div className="app-shell">
        <Header />

        <main className="main-content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/student" element={<StudentPage config={config} />} />
            <Route path="/dorm-manager" element={<DormManagerPage config={config} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}