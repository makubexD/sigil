import { useState } from 'react';

export function Widget() {
  const [term, setTerm] = useState('');
  return (
    <label>
      Search products
      <input value={term} onChange={event => setTerm(event.target.value)} />
    </label>
  );
}
