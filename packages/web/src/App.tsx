import { BrowserRouter, Route, Routes } from 'react-router-dom';

import CreateGame from './components/CreateGame';
import GamePage from './components/GamePage';

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/" element={<CreateGame />} />
          <Route path="/game/:gameId" element={<GamePage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
