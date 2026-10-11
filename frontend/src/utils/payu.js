// PayU's hosted checkout is a plain HTML form POST (not an SDK/session
// flow like Cashfree's) -- the backend returns { actionUrl, fields }
// (already hashed), and this just builds + submits that form, redirecting
// the whole browser to PayU's payment page.
export async function redirectToPayuCheckout(payuParams) {
  const { actionUrl, fields } = payuParams;
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = actionUrl;
  form.style.display = 'none';

  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value ?? '';
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
}
