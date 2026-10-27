import {Link} from 'react-router';
import './Footer.css';

declare const __LAN_BUILD_SHA__:string;

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <p className="footer-brand">Good friends. Great games.</p>
        <p>LAN Party · Built for the next get-together.</p>
        <Link to="/privacy">Privacy Policy</Link>
        <small className="footer-build" aria-label="Website build">Build {typeof __LAN_BUILD_SHA__==='string'?__LAN_BUILD_SHA__:'local'}</small>
      </div>
    </footer>
  );
}

