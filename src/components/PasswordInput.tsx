import { useState } from 'react';
import type { ComponentProps } from 'react';
import './PasswordInput.css';

export default function PasswordInput(props: Omit<ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false);
  return <div className="password-input">
    <input {...props} type={visible ? 'text' : 'password'} />
    <button type="button" className="password-toggle" aria-controls={props.id}
      aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible}
      disabled={props.disabled} onClick={() => setVisible(value => !value)}>{visible ? 'Hide' : 'Show'}</button>
  </div>;
}
