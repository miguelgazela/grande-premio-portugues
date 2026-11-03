import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import './app.css';
import { Join } from './student/Join';
import { Play } from './student/Play';
import { Host } from './teacher/Host';
import { Classes } from './teacher/Classes';
import { Editor } from './teacher/Editor';
import { History } from './teacher/History';
import { Revisao } from './teacher/Revisao';
import { Jogar } from './teacher/Jogar';
import { Library } from './teacher/Library';
import { Prepare } from './teacher/Prepare';
import { Report } from './teacher/Report';
import { TeacherGate } from './teacher/TeacherGate';

createRoot(document.getElementById('root')!).render(
    <HashRouter>
      <Routes>
        <Route path="/" element={<Join />} />
        <Route path="/jogar" element={<Play />} />
        <Route path="/prof" element={<TeacherGate><Jogar /></TeacherGate>} />
        <Route path="/prof/revisao" element={<TeacherGate><Revisao /></TeacherGate>} />
        <Route path="/prof/preparar" element={<TeacherGate><Prepare /></TeacherGate>}>
          <Route index element={<Library />} />
          <Route path="quiz/:id" element={<Editor />} />
          <Route path="turmas" element={<Classes />} />
          <Route path="historico" element={<History />} />
          <Route path="relatorio/:id" element={<Report />} />
        </Route>
        <Route path="/prof/jogo/:id" element={<TeacherGate><Host /></TeacherGate>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
);
