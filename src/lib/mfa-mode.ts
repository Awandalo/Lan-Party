// Local development UI only. The Worker independently enforces local mode and
// loopback origins. No build flag enables hosted enrollment.
export const MFA_ENROLLMENT_AVAILABLE=import.meta.env.DEV && typeof window!=='undefined'
  && window.location.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(window.location.hostname);
