import { AUTH_UI_AVAILABLE, authUIEnabled } from './lib/auth-mode';
import { Route, Routes, Link } from 'react-router';
import Header from './components/Header';
import Footer from './components/Footer';
import RouteFocus from './components/RouteFocus';
import Home from './pages/Home';
import Events from './pages/Events';
import Login from './pages/Login';
import Registration from './pages/Registration';
import Account from './pages/Account';
import VerifyEmail from './pages/VerifyEmail';
import LocalMail from './pages/LocalMail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AccountSecurity from './pages/AccountSecurity';
import MfaChallenge from './pages/MfaChallenge';
import { AuthProvider } from './lib/auth';

export default function App() {
  return (
    <AuthProvider><div className="site-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Header />
      <main id="main-content" className="container main-content" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/events" element={<Events />} />
          <Route path="/login" element={<Login />} />
          {(AUTH_UI_AVAILABLE && authUIEnabled()) && <Route path="/mfa" element={<MfaChallenge />} />}
          {(AUTH_UI_AVAILABLE && authUIEnabled()) && <Route path="/register" element={<Registration />} />}
          {(AUTH_UI_AVAILABLE && authUIEnabled()) && <Route path="/account" element={<Account />} />}
          {(AUTH_UI_AVAILABLE && authUIEnabled()) && <Route path="/account/security" element={<AccountSecurity />} />}
          {(AUTH_UI_AVAILABLE && authUIEnabled()) && <Route path="/verify-email" element={<VerifyEmail />} />}
          {import.meta.env.DEV && <Route path="/local-mail" element={<LocalMail />} />}
          {(AUTH_UI_AVAILABLE && authUIEnabled()) && <Route path="/forgot-password" element={<ForgotPassword />} />}
          {(AUTH_UI_AVAILABLE && authUIEnabled()) && <Route path="/reset-password" element={<ResetPassword />} />}
          <Route path="*" element={
            <section className="page-section">
              <p className="eyebrow">404</p>
              <h1>Page not found</h1>
              <p>This address does not lead to a page. Head home to regroup.</p>
              <Link className="button" to="/">Back to home</Link>
            </section>
          } />
        </Routes>
      </main>
      <Footer />
      <RouteFocus />
    </div></AuthProvider>
  );
}
