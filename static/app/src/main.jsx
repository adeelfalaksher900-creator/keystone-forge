import { createRoot } from 'react-dom/client';
import { view } from '@forge/bridge';
import App from './App.jsx';
import './styles.css';

view.theme?.enable?.().catch(() => {});
createRoot(document.getElementById('root')).render(<App />);
