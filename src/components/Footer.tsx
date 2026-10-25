import { Link } from 'react-router';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <p className="footer-brand">Good friends. Great games.</p>
        <p>LAN Party · Built for the next get-together. <Link to="/privacy">Privacy Policy</Link></p>
      </div>
    </footer>
  );
}

