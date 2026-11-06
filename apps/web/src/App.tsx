import { Navigate, Route, Routes } from 'react-router';
import { useAuth } from './lib/auth';
import { Loading } from './components/ui';
import Home from './pages/Home';
import SignIn from './pages/SignIn';
import Shell from './pages/teacher/Shell';
import Quizzes from './pages/teacher/Quizzes';
import QuizEditor from './pages/teacher/QuizEditor';
import QuizPreview from './pages/teacher/QuizPreview';
import QuizUse from './pages/teacher/QuizUse';
import ActivityDetail from './pages/teacher/ActivityDetail';
import HostLive from './pages/teacher/HostLive';
import Exams from './pages/teacher/Exams';
import Dashboard from './pages/teacher/Dashboard';
import Welcome from './pages/teacher/Welcome';
import ExamEditor from './pages/teacher/ExamEditor';
import HostRoom from './pages/teacher/HostRoom';
import Results from './pages/teacher/Results';
import RoomResults from './pages/teacher/RoomResults';
import Entry from './pages/play/Entry';
import AttemptPlay from './pages/play/AttemptPlay';
import JoinRoom from './pages/play/JoinRoom';
import LivePlay from './pages/play/LivePlay';

function Private({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return user ? <>{children}</> : <Navigate to="/sign-in" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/join" element={<JoinRoom />} />
      <Route path="/join/:code" element={<JoinRoom />} />
      <Route path="/play/:code" element={<LivePlay />} />
      <Route path="/q/:code" element={<Entry kind="solo" />} />
      <Route path="/exam/:token" element={<Entry kind="invite" />} />
      <Route path="/launch/:token" element={<Entry kind="launch" />} />
      <Route path="/attempt/:token" element={<AttemptPlay />} />
      <Route path="/welcome" element={<Private><Welcome /></Private>} />
      <Route element={<Private><Shell /></Private>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/exams" element={<Exams />} />
        <Route path="/exams/new" element={<ExamEditor />} />
        <Route path="/exams/draft/:quizId" element={<ExamEditor />} />
        <Route path="/exams/:activityId/edit" element={<ExamEditor />} />
        <Route path="/quizzes" element={<Quizzes />} />
        <Route path="/quizzes/new" element={<QuizEditor />} />
        <Route path="/quizzes/:id" element={<QuizEditor />} />
        <Route path="/quizzes/:id/preview" element={<QuizPreview />} />
        <Route path="/quizzes/:id/use" element={<QuizUse />} />
        <Route path="/activities/:id" element={<ActivityDetail />} />
        <Route path="/host" element={<HostLive />} />
        <Route path="/host/room/:code" element={<HostRoom />} />
        <Route path="/results" element={<Results />} />
        <Route path="/results/room/:id" element={<RoomResults />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
