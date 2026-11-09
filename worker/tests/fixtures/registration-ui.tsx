import React from 'react';
import {createRoot} from 'react-dom/client';
import RegistrationPreview from '../../../src/pages/RegistrationPreview';
import '../../../src/CSS/main.css';
if(!import.meta.env.DEV||!['127.0.0.1','localhost'].includes(location.hostname))throw Error('Local fixture only');
createRoot(document.getElementById('root')!).render(<main><RegistrationPreview/></main>);
