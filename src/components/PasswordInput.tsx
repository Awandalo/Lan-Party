import { useState } from 'react';
import type { ComponentProps } from 'react';
import './PasswordInput.css';

export default function PasswordInput(props: Omit<ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false);
  return <div className="password-input">
    <input {...props} type={visible ? 'text' : 'password'} />
    <button type="button" className="password-toggle" aria-controls={props.id}
      aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible}
      disabled={props.disabled} onClick={() => setVisible(value => !value)}>
      <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
        {visible && <path d="m3 3 18 18" />}
      </svg>
    </button>
  </div>;
}
