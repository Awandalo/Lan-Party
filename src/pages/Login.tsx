import '../CSS/Login_style.css';

export default function Login() {
  return (
    <section className="page-section login-page">
      <div className="panel login-card">
        <p className="eyebrow">Welcome back</p>
        <h1>Login</h1>
        <p>A future sign-in for participants, moderators, and organizers.</p>
        <div className="login-preview" aria-describedby="login-notice">
          <label htmlFor="login-email">Email address</label>
          <input id="login-email" type="email" placeholder="Email address" disabled />
          <label htmlFor="login-password">Password</label>
          <input id="login-password" type="password" placeholder="Password" disabled />
          <button className="button" type="button" disabled>Login — coming soon</button>
        </div>
        <div id="login-notice" className="login-notice">
          <span className="status-label">Nonfunctional preview</span>
          <p>Login is not available yet. These fields are disabled and do not collect
            credentials. This public page is not a secured administration area.</p>
        </div>
      </div>
    </section>
  );
}

