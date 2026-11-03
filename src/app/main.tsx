import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import './app.css';
import { Join } from './student/Join';
import { Play } from './student/Play';
import { Host } from './teacher/Host';
import { Quizzes } from './teacher/Quizzes';
import { TeacherGate } from './teacher/TeacherGate';

createRoot(document.getElementById('root')!).render(
    <HashRouter>
      <Routes>
        <Route path="/" element={<Join />} />
        <Route path="/jogar" element={<Play />} />
        <Route path="/prof" element={<TeacherGate><Quizzes /></TeacherGate>} />
        <Route path="/prof/jogo/:id" element={<TeacherGate><Host /></TeacherGate>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
);
