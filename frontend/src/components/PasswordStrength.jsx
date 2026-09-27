function scorePassword(password) {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(score, 4);
}

const LEVELS = ['weak', 'weak', 'fair', 'fair', 'strong'];
const LABELS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];

export function PasswordStrength({ password }) {
  if (!password) return null;
  const score = scorePassword(password);
  return (
    <div>
      <div className="password-strength">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`password-strength-bar ${i < score ? `filled ${LEVELS[score]}` : ''}`} />
        ))}
      </div>
      <p className="password-strength-label">{LABELS[score]}</p>
    </div>
  );
}
