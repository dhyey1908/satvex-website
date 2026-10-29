import { useEffect, useState } from 'react';
import './ColorField.css';

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Colour code: click the swatch to open the colour picker, or type the hex
 * beside it. The swatch always shows the colour that will be saved.
 */
export function ColorField({ value, onChange, id }) {
  const [text, setText] = useState(value || '#000000');
  useEffect(() => setText(value || '#000000'), [value]);

  const valid = HEX.test(text);
  // <input type="color"> only understands 6-digit hex.
  const pickerValue = valid ? (text.length === 4 ? `#${[...text.slice(1)].map((c) => c + c).join('')}` : text) : '#000000';

  return (
    <div className="color-field">
      <label className="color-swatch-btn" style={{ background: valid ? text : 'transparent' }} title="Pick a colour">
        <input
          type="color"
          value={pickerValue}
          aria-label="Open colour picker"
          onChange={(e) => {
            setText(e.target.value);
            onChange(e.target.value);
          }}
        />
      </label>
      <input
        id={id}
        type="text"
        className={`color-hex ${valid ? '' : 'invalid'}`}
        value={text}
        maxLength={7}
        spellCheck={false}
        aria-label="Hex colour code"
        aria-invalid={!valid}
        onChange={(e) => {
          let v = e.target.value.trim();
          if (v && v[0] !== '#') v = `#${v}`;
          setText(v);
          if (HEX.test(v)) onChange(v);
        }}
      />
    </div>
  );
}
